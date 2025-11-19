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

  try {
    const response = await fetch('https://data.pid.cz/stops/json/stops.json');

    if (!response.ok) {
      throw new Error(`PID API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Filter and minimize data to only what the frontend actually needs
    // This reduces payload from ~20MB to ~2-3MB
    const optimizedData = {
      generatedAt: data.generatedAt,
      stopGroups: (data.stopGroups || []).map(group => ({
        node: group.node,
        cis: group.cis,
        name: group.name,
        fullName: group.fullName,
        uniqueName: group.uniqueName,
        municipality: group.municipality,
        avgLat: group.avgLat,
        avgLon: group.avgLon,
        mainTrafficType: group.mainTrafficType,
        stops: (group.stops || []).map(stop => ({
          id: stop.id,
          lat: stop.lat,
          lon: stop.lon,
          zone: stop.zone,
          mainTrafficType: stop.mainTrafficType,
          gtfsIds: stop.gtfsIds,
          lines: (stop.lines || []).map(line => ({
            id: line.id,
            name: line.name,
            type: line.type,
          }))
        }))
      }))
    };

    // Cache for 1 hour
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(optimizedData);
  } catch (error) {
    console.error('Error fetching PID stops:', error);
    res.status(500).json({ error: 'Failed to fetch stops data', message: error.message });
  }
}
