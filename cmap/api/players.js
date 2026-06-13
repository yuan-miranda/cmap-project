export default async function handler(req, res) {
    const sha = typeof req.query.v === 'string' && req.query.v.trim() ? req.query.v.trim() : 'main';
    const sourceUrls = [
        `https://rawcdn.githack.com/yuan-miranda/tiles/${sha}/players.json?v=${encodeURIComponent(sha)}`,
        `https://raw.githubusercontent.com/yuan-miranda/tiles/${sha}/players.json`,
        `https://rawcdn.githack.com/yuan-miranda/tiles/main/players.json?v=main`
    ];

    try {
        let response = null;
        for (const targetUrl of sourceUrls) {
            response = await fetch(targetUrl, { method: 'GET' });
            if (response.ok) break;
        }

        if (!response || !response.ok) {
            res.status(response.status).json([]);
            return;
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch players data' });
    }
}