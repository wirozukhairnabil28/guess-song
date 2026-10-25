const path = require('path');
const fs = require('fs');

const norm = (v) => String(v || '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const songKey = (s) => norm(s.artist + s.title);

// Search-catalog songs have no level; derive it from the same rank bands catalog.json uses.
function levelFromRank(rank) {
  if (rank >= 896000) return 0;
  if (rank >= 809000) return 1;
  if (rank >= 718000) return 2;
  return 3;
}

let cache = null;
function loadSongs() {
  if (cache) return cache;
  const root = process.cwd();
  const songs = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
  const seen = new Set(songs.map(songKey));
  try {
    const extra = JSON.parse(fs.readFileSync(path.join(root, 'catalog-search.json'), 'utf8'));
    for (const song of extra) {
      const key = songKey(song);
      if (seen.has(key)) continue; // same song already in catalog.json
      seen.add(key);
      song.id = 'search:' + key;
      if (song.level == null) song.level = levelFromRank(song.rank);
      songs.push(song);
    }
  } catch (e) { /* catalog-search.json is optional */ }
  cache = songs;
  return songs;
}

function yearMatches(year, sel) {
  if (sel === 'all') return true;
  if (sel === 'before-2000') return year < 2000;
  if (sel === '2020-now') return year >= 2020;
  const [a, b] = sel.split('-').map(Number);
  return year >= a && year <= b;
}

module.exports = { loadSongs, yearMatches, norm };
