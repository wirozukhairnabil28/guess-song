const { loadSongs, norm } = require('./_catalog');

const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const BAD_VERSION = /remix|live|karaoke|sped up|slowed/i;

function matches(track, song) {
  const title = norm(song.title);
  const full = norm(track.title);
  const short = norm(track.title_short);
  if (!(short === title || full === title || full.startsWith(title))) return false;
  if (norm(track.artist && track.artist.name) !== norm(song.artist)) return false;
  if (BAD_VERSION.test(track.title_version || '')) return false;
  return !!track.preview;
}

const out = (track) => ({ streamUrl: track.preview, previewUrl: track.preview, trackUrl: track.link || `https://www.deezer.com/track/${track.id}` });

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'missing-id' });
  const song = loadSongs().find((s) => s.id === id);
  if (!song) return res.status(404).json({ error: 'unknown-song' });

  try {
    if (/^\d+$/.test(id)) {
      const r = await fetch(`https://api.deezer.com/track/${id}`, { headers: HEADERS });
      if (r.ok) {
        const t = await r.json();
        if (t && matches(t, song)) return res.status(200).json(out(t));
      }
    }
    const q = new URLSearchParams({ q: `${song.artist} ${song.title}`, limit: '25' });
    const r = await fetch(`https://api.deezer.com/search?${q}`, { headers: HEADERS });
    const data = r.ok ? await r.json() : { data: [] };
    const hit = (data.data || []).sort((a, b) => (b.rank || 0) - (a.rank || 0)).find((t) => matches(t, song));
    if (!hit) return res.status(404).json({ error: 'preview-unavailable' });
    return res.status(200).json(out(hit));
  } catch (err) {
    return res.status(502).json({ error: 'preview-lookup-failed' });
  }
};
