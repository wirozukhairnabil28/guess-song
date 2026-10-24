const { loadSongs, yearMatches } = require('./_catalog');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  try {
    const { region = 'all', genre = 'all', year = 'all' } = req.query;
    const tracks = loadSongs()
      .filter((s) => (region === 'all' || s.region === region) && (genre === 'all' || s.genre === genre) && yearMatches(s.year, year))
      .map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        region: s.region,
        genre: s.genre,
        year: s.year,
        downloads: s.rank,
        level: s.level,
        deepCut: !!s.deepCut,
        trackUrl: /^\d+$/.test(s.id) ? `https://www.deezer.com/track/${s.id}` : `https://www.deezer.com/search/${encodeURIComponent(s.artist + ' ' + s.title)}`,
      }))
      .sort((a, b) => b.downloads - a.downloads);
    return res.status(200).json({ tracks });
  } catch (err) {
    return res.status(500).json({ error: 'failed-to-load-catalog' });
  }
};
