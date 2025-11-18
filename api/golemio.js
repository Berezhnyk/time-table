export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With, Content-Type, Accept'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiKey = process.env.GOLEMIO_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GOLEMIO_API_KEY not configured' });
  }

  try {
    // Extract the path after /api/golemio
    const { path } = req.query;
    const endpoint = Array.isArray(path) ? path.join('/') : path || '';

    // Construct the full URL with query parameters
    const url = new URL(`https://api.golemio.cz/v2/pid/${endpoint}`);

    // Forward query parameters (except 'path')
    Object.keys(req.query).forEach(key => {
      if (key !== 'path') {
        url.searchParams.append(key, req.query[key]);
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        'X-Access-Token': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Golemio API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Cache for 30 seconds (real-time data)
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching Golemio data:', error);
    res.status(500).json({ error: 'Failed to fetch Golemio data', message: error.message });
  }
}
