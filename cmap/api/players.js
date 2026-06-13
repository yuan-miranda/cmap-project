export default async function handler(req, res) {
    const vpsBase = `http://143.244.173.238:5000/api/players`;
    const qs = (req.query && Object.keys(req.query).length) ? `?${new URLSearchParams(req.query).toString()}` : '';
    const targetUrl = `${vpsBase}${qs}`;

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: req.method === 'POST' ? JSON.stringify(req.body) : null
        });

        if (!response.ok) {
            const status = response.status || 500;
            // Return an empty array for missing players, but otherwise forward error
            if (status === 404) return res.status(404).json([]);
            return res.status(status).json({ error: 'VPS returned error' });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to connect to VPS' });
    }
}
