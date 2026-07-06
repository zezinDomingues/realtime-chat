import { NextResponse } from 'next/server'

// Busca uma página no servidor e extrai as metatags Open Graph (título, descrição,
// imagem, site) para montar um cartão de preview de link, estilo WhatsApp.
// Feito no servidor porque o navegador não consegue ler metatags de outro domínio (CORS).

export const runtime = 'nodejs'

const decodeEntities = s =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')

// Extrai o content de <meta property/name="prop" content="...">, nas duas ordens de atributo.
const pickMeta = (html, prop) => {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i')

  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')

  return html.match(a)?.[1] || html.match(b)?.[1] || ''
}

export async function GET(req) {
  const url = req.nextUrl.searchParams.get('url') || ''

  // Só http/https; bloqueia hosts internos (evita SSRF básico)
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }

  try {
    const target = new URL(url)

    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/i.test(target.hostname)) {
      return NextResponse.json({ error: 'blocked host' }, { status: 400 })
    }

    // --- YouTube: usa o oEmbed oficial (o scraping direto cai na tela de consentimento) ---
    const ytId = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i)?.[1] || null

    if (ytId) {
      try {
        const oc = new AbortController()
        const ot = setTimeout(() => oc.abort(), 7000)

        const oe = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`, {
          signal: oc.signal
        })

        clearTimeout(ot)

        if (oe.ok) {
          const j = await oe.json()

          return NextResponse.json(
            {
              url,
              title: (j.title || '').slice(0, 200),
              description: j.author_name ? `por ${j.author_name}` : '',
              image: j.thumbnail_url || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
              siteName: 'YouTube',
              mediaType: 'video'
            },
            { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
          )
        }
      } catch {
        // cai para o scraping genérico abaixo
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SmartRanchBot/1.0; +link-preview)',
        Accept: 'text/html,application/xhtml+xml'
      },
      signal: controller.signal,
      redirect: 'follow'
    })

    clearTimeout(timeout)

    const contentType = res.headers.get('content-type') || ''

    if (!contentType.includes('text/html')) {
      return NextResponse.json({ url, notHtml: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }

    // Lê só o começo do HTML (metatags ficam no <head>)
    const raw = await res.text()
    const html = raw.slice(0, 200000)

    let image = pickMeta(html, 'og:image') || pickMeta(html, 'og:image:url') || pickMeta(html, 'twitter:image')
    const title = pickMeta(html, 'og:title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || ''
    const description =
      pickMeta(html, 'og:description') || pickMeta(html, 'description') || pickMeta(html, 'twitter:description')
    const siteName = pickMeta(html, 'og:site_name')
    const ogType = pickMeta(html, 'og:type')

    // Resolve imagem relativa para absoluta
    if (image && !/^https?:\/\//i.test(image)) {
      try {
        image = new URL(image, url).href
      } catch {
        image = ''
      }
    }

    const cleanTitle = decodeEntities(title).trim().slice(0, 200)

    // Só cacheia por 24h quando conseguiu extrair algo útil; senão, sem cache.
    const hasContent = !!(cleanTitle || image)

    return NextResponse.json(
      {
        url,
        title: cleanTitle,
        description: decodeEntities(description).trim().slice(0, 300),
        image,
        siteName: (decodeEntities(siteName).trim() || target.hostname.replace(/^www\./, '')).slice(0, 100),
        mediaType: /video/i.test(ogType) ? 'video' : 'link'
      },
      { headers: { 'Cache-Control': hasContent ? 'public, max-age=86400, s-maxage=86400' : 'no-store' } }
    )
  } catch {
    return NextResponse.json({ url, error: 'fetch failed' }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
