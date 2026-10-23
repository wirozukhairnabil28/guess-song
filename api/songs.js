const path = require('path');
const fs = require('fs');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  try {
    const catalogPath = path.join(process.cwd(), 'catalog.json');
    const songs = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const { region = 'all', genre = 'all', year = 'all' } = req.query;

    const filtered = songs.filter(song => {
      const matchRegion = region === 'all' || song.region === region;
      const matchGenre = genre === 'all' || song.genre === genre;
      let matchYear = true;
      if (year === 'before-2000') matchYear = song.year < 2000;
      else if (year === '2020-now') matchYear = song.year >= 2020;
      else if (year !== 'all') {
        const [start, end] = year.split('-').map(Number);
        matchYear = song.year >= start && song.year <= end;
      }
      return matchRegion && matchGenre && matchYear;
    });

    return res.status(200).json({ tracks: filtered });
  } catch (err) {
    return res.status(500).json({ error: 'failed-to-load-catalog' });
  }
};
