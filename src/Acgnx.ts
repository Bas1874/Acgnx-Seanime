/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {

    private api = "https://share.acgnx.se/rss.xml"

    // Defines the settings for this provider.
    async getSettings(): Promise<AnimeProviderSettings> {
        return {
            canSmartSearch: false, // ACGNX RSS does not support detailed filtering
            smartSearchFilters: [],
            supportsAdult: true, // The site may contain adult content
            type: "main",
        }
    }

    // Searches for torrents based on a user's query.
    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const url = `${this.api}?keyword=${encodeURIComponent(opts.query)}`
        return this.fetchAndParseRss(url)
    }

    // This provider does not support smart searching.
    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        console.log("ACGNX provider does not support smart search.")
        return []
    }

    // Fetches the latest torrents from the main RSS feed.
    async getLatest(): Promise<AnimeTorrent[]> {
        return this.fetchAndParseRss(this.api)
    }
    
    // The info hash is already provided in the search results.
    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    // The magnet link is already provided in the search results.
    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || ""
    }

    // Main function to fetch the RSS feed and parse it.
    private async fetchAndParseRss(url: string): Promise<AnimeTorrent[]> {
        try {
            const response = await fetch(url)
            if (!response.ok) {
                throw new Error(`Failed to fetch RSS feed, status: ${response.status}`)
            }
            const xmlText = response.text()
            const torrents = this.parseTorrentsFromXml(xmlText)
            return torrents
        } catch (error) {
            console.error(`Error fetching or parsing RSS feed from ${url}: ${error}`)
            return []
        }
    }

    // Parses the raw XML string to extract torrent items.
    private parseTorrentsFromXml(xml: string): AnimeTorrent[] {
        const items = xml.split('<item>')
        items.shift() // Remove the channel header part
        
        return items.map(itemXml => {
            try {
                const title = this.getTagContent(itemXml, 'title')
                const link = this.getTagContent(itemXml, 'link')
                const pubDate = this.getTagContent(itemXml, 'pubDate')
                const descriptionHtml = this.getTagContent(itemXml, 'description')
                
                const magnetMatch = /<enclosure url="(magnet:[^"]+)"/.exec(itemXml)
                const magnetLink = magnetMatch ? magnetMatch[1] : ''

                // Description format: <a href=...>...</a> | 467.5GB | 季度全集 | HASH
                const descriptionParts = descriptionHtml.split('|')
                const formattedSize = descriptionParts.length > 1 ? descriptionParts[1].trim() : "0"
                const infoHash = descriptionParts.length > 3 ? descriptionParts[3].trim() : (this.getHashFromMagnet(magnetLink) || "")

                return {
                    name: title,
                    date: new Date(pubDate).toISOString(),
                    size: this.parseSizeToBytes(formattedSize),
                    formattedSize: formattedSize,
                    seeders: 0, // Not available in RSS
                    leechers: 0, // Not available in RSS
                    downloadCount: 0, // Not available in RSS
                    link: link,
                    downloadUrl: "", // No direct download URL
                    magnetLink: magnetLink,
                    infoHash: infoHash.toLowerCase(),
                    resolution: "", // Let Seanime parse it
                    isBatch: undefined, // Let Seanime parse it
                    episodeNumber: -1, // Let Seanime parse it
                    releaseGroup: "", // Let Seanime parse it
                    isBestRelease: false,
                    confirmed: false,
                }
            } catch (e) {
                console.error("Failed to parse an item from ACGNX RSS:", e)
                return null
            }
        }).filter((t): t is AnimeTorrent => t !== null) // Filter out any nulls from parsing errors
    }
    
    // Helper to extract content from a CDATA-wrapped tag.
    private getTagContent(xml: string, tagName: string): string {
        const match = new RegExp(`<${tagName}><!\\[CDATA\\[(.*?)]]></${tagName}>`, 's').exec(xml)
        if (match && match[1]) return match[1]
        
        // Fallback for non-CDATA tags like <link> and <pubDate>
        const fallbackMatch = new RegExp(`<${tagName}>(.*?)</${tagName}>`).exec(xml)
        return fallbackMatch ? fallbackMatch[1] : ''
    }

    // Helper to extract the info hash from a magnet link.
    private getHashFromMagnet(magnet: string): string | null {
        const match = /urn:btih:([a-fA-F0-9]{40})/.exec(magnet)
        return match ? match[1] : null
    }

    // Helper to convert size strings (e.g., "1.5GB") into bytes.
    private parseSizeToBytes(sizeStr: string): number {
        if (!sizeStr) return 0
        const sizeLower = sizeStr.toLowerCase()
        let value = parseFloat(sizeStr.replace(/[^0-9.]/g, ''))
        
        if (isNaN(value)) {
            value = 0
        }

        let bytes = 0
        if (sizeLower.includes('gb')) {
            bytes = value * 1024 * 1024 * 1024
        } else if (sizeLower.includes('mb')) {
            bytes = value * 1024 * 1024
        } else if (sizeLower.includes('kb')) {
            bytes = value * 1024
        } else {
            bytes = value
        }
        
        // FIX: Round the final value to the nearest integer to match the expected 'int64' type.
        return Math.round(bytes)
    }
}
