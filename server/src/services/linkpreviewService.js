class LinkPreviewService {
    extractFirstUrlFromText(content) {
        if (!content || typeof content !== 'string') return null;
        const matches = Array.from(content.matchAll(/((?:https?:\/\/|www\.)[^\s<]+)/gi));
        if (matches.length !== 1) return null;
        const rawUrl = (matches[0][1] || '').replace(/[.,!?;:]+$/, '');
        if (!rawUrl) return null;
        return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    }

    normalizePreviewUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return null;
        const trimmed = rawUrl.trim();
        const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

        try {
            const parsed = new URL(withProtocol);
            if (!['http:', 'https:'].includes(parsed.protocol)) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    extractMetaTag(html, attr, value) {
        if (!html) return null;

        // 1. Find all meta tags
        const metaTags = html.match(/<meta\s+[^>]+>/gi) || [];
        
        for (const tag of metaTags) {
            // 2. Check if this tag has the matching attribute (property or name) and value
            const attrPattern = new RegExp(`${attr}\\s*=\\s*[\\\"']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\"']`, 'i');
            if (attrPattern.test(tag)) {
                // 3. Extract the content attribute value
                const contentMatch = tag.match(/content\s*=\s*[\\\"']([^\\\"']*)[\\\"']/i);
                if (contentMatch) {
                    return this.decodeHtmlEntities(contentMatch[1]).trim();
                }
            }
        }

        return null;
    }

    decodeHtmlEntities(text) {
        if (!text) return '';
        return text
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
            .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
    }

    extractTitleTag(html) {
        if (!html) return null;
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = match?.[1]?.trim() || null;
        return title ? this.decodeHtmlEntities(title) : null;
    }

    async getLinkPreview(rawUrl) {
        const parsedUrl = this.normalizePreviewUrl(rawUrl);
        if (!parsedUrl) {
            console.warn(`[LinkPreview] Invalid URL: ${rawUrl}`);
            return null;
        }

        const hostname = parsedUrl.hostname.toLowerCase();
        const isYouTube = hostname.includes('youtube.com') || hostname.includes('youtu.be');

        const fallback = {
            url: parsedUrl.toString(),
            title: parsedUrl.hostname,
            description: '',
            image: null,
            siteName: parsedUrl.hostname,
            hostname: parsedUrl.hostname,
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
            // Special Case: YouTube oEmbed (More reliable than scraping)
            if (isYouTube) {
                console.log(`[LinkPreview] Fetching YouTube oEmbed for: ${parsedUrl.hostname}`);
                const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(parsedUrl.toString())}&format=json`;
                const ytRes = await fetch(oembedUrl, { signal: controller.signal });

                if (ytRes.ok) {
                    const data = await ytRes.json();
                    console.log(`[LinkPreview] YouTube oEmbed Success: ${data.title}`);
                    return {
                        url: parsedUrl.toString(),
                        title: data.title || fallback.title,
                        description: data.author_name ? `By ${data.author_name}` : '',
                        image: data.thumbnail_url || null,
                        siteName: 'YouTube',
                        hostname: parsedUrl.hostname,
                    };
                } else {
                    console.warn(`[LinkPreview] YouTube oEmbed failed: ${ytRes.status}. Falling back to scraping.`);
                }
            }

            // General case: Metadata Scraping
            console.log(`[LinkPreview] Scraping metadata for: ${parsedUrl.hostname}`);
            const response = await fetch(parsedUrl.toString(), {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Twitterbot/1.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
            });

            if (!response.ok) {
                console.warn(`[LinkPreview] Fetch failed for ${parsedUrl.hostname}: ${response.status}`);
                return fallback;
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html')) {
                console.warn(`[LinkPreview] Non-HTML content from ${parsedUrl.hostname}: ${contentType}`);
                return fallback;
            }

            const html = await response.text();

            const ogTitle = this.extractMetaTag(html, 'property', 'og:title') || this.extractMetaTag(html, 'name', 'og:title');
            const twitterTitle = this.extractMetaTag(html, 'name', 'twitter:title') || this.extractMetaTag(html, 'property', 'twitter:title');
            const ogDescription = this.extractMetaTag(html, 'property', 'og:description') || this.extractMetaTag(html, 'name', 'og:description');
            const twitterDescription = this.extractMetaTag(html, 'name', 'twitter:description') || this.extractMetaTag(html, 'property', 'twitter:description');
            const ogImage = this.extractMetaTag(html, 'property', 'og:image') || this.extractMetaTag(html, 'name', 'og:image');
            const twitterImage = this.extractMetaTag(html, 'name', 'twitter:image') || this.extractMetaTag(html, 'property', 'twitter:image');
            const ogSiteName = this.extractMetaTag(html, 'property', 'og:site_name') || this.extractMetaTag(html, 'name', 'og:site_name');
            const twitterSite = this.extractMetaTag(html, 'name', 'twitter:site') || this.extractMetaTag(html, 'property', 'twitter:site');
            const metaDescription = this.extractMetaTag(html, 'name', 'description');
            const titleTag = this.extractTitleTag(html);

            let imageUrl = ogImage || twitterImage || null;
            if (imageUrl) {
                try {
                    imageUrl = new URL(imageUrl, parsedUrl).toString();
                } catch {
                    imageUrl = null;
                }
            }

            const title = (ogTitle || twitterTitle || titleTag || parsedUrl.hostname || '').trim();
            const description = (ogDescription || twitterDescription || metaDescription || '').trim();
            const siteName = (ogSiteName || twitterSite || parsedUrl.hostname || '').trim();

            console.log('--- Link Preview Metadata Extracted ---', {
                url: parsedUrl.toString(),
                title: title.substring(0, 50),
                hasImage: !!imageUrl,
                hasDesc: !!description
            });

            return {
                url: parsedUrl.toString(),
                title,
                description,
                image: imageUrl,
                siteName,
                hostname: parsedUrl.hostname,
            };
        } catch (error) {
            console.error(`[LinkPreview] Error processing ${parsedUrl.hostname}:`, error.message);
            return fallback;
        } finally {
            clearTimeout(timeout);
        }
    }

}

module.exports = new LinkPreviewService();