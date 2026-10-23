module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'missing-id' });
  }

  try {
    const response = await fetch(`https://api.deezer.com/track/${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) {
      return res.status(404).json({ error: 'preview-unavailable' });
    }
    const data = await response.json();
    if (!data.preview) {
      return res.status(404).json({ error: 'preview-unavailable' });
    }

    return res.status(200).json({
      streamUrl: data.preview,
      trackUrl: data.link || `https://www.deezer.com/track/${id}`,
      previewUrl: data.preview
    });
  } catch (err) {
    return res.status(502).json({ error: 'preview-lookup-failed' });
  }
};
