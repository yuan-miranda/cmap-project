export default async function handler(req, res) {
  const path = req.url.replace('/api/sha', '');
  
  const targetUrl = `http://143.244.173.238:5000${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 
        'Content-Type': 'application/json'
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : null
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to connect to VPS" });
  }
}