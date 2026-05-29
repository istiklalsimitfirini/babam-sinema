const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Serve static portal files (including playlist.m3u after local build)
app.use(express.static(path.join(__dirname, 'public')));

// M3U Playlist Cache (for dynamic local runs)
let playlistCache = {
  data: null,
  lastFetched: null
};

const CDN_M3U_URL = 'https://cdn.jsdelivr.net/gh/Playtvapp/Playtvlist@main/FİLMLERFANTİKAPPP.m3u';
const LOCAL_M3U_PATH = path.join(__dirname, 'FİLMLERFANTİKAPPP.m3u');

/**
 * Helper to get correct protocol and host (handling proxy headers)
 */
function getHostUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

/**
 * Helper to fetch and cache the M3U file
 */
async function getM3UData(forceRefresh = false) {
  const oneHour = 60 * 60 * 1000;
  if (!forceRefresh && playlistCache.data && (Date.now() - playlistCache.lastFetched < oneHour)) {
    return playlistCache.data;
  }

  console.log('Fetching and parsing M3U playlist...');
  let rawData = '';

  if (fs.existsSync(LOCAL_M3U_PATH)) {
    console.log('Loading playlist from local file...');
    rawData = fs.readFileSync(LOCAL_M3U_PATH, 'utf8');
  } else {
    console.log('Local file not found, fetching from CDN...');
    const response = await axios.get(CDN_M3U_URL, { responseType: 'text' });
    rawData = response.data;
  }

  playlistCache.data = rawData;
  playlistCache.lastFetched = Date.now();
  console.log(`Playlist loaded successfully. Size: ${(rawData.length / 1024 / 1024).toFixed(2)} MB`);
  return rawData;
}

/**
 * Endpoint 1: Rewrite and serve the M3U Playlist dynamically (for local testing)
 */
app.get('/playlist.m3u', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const rawData = await getM3UData(forceRefresh);

    const host = getHostUrl(req);
    console.log(`Rewriting playlist links to use host: ${host}`);

    const rewrittenData = rawData.replace(/https:\/\/vidmody\.com\/vs\/([a-zA-Z0-9_-]+)/g, (match, id) => {
      return `${host}/vs/${id}.m3u8`;
    });

    res.setHeader('Content-Type', 'application/x-mpegURL; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
    res.send(rewrittenData);
  } catch (error) {
    console.error('Error serving playlist.m3u:', error.message);
    res.status(500).send('Error loading M3U playlist: ' + error.message);
  }
});

/**
 * Endpoint 2: Proxy the HLS Master Playlist
 */
app.get('/vs/:id.m3u8', async (req, res) => {
  const { id } = req.params;
  const targetUrl = `https://vidmody.com/vs/${id}`;

  try {
    console.log(`Proxying Master Playlist: ${targetUrl}`);
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidmody.com/'
      }
    });

    const host = getHostUrl(req);
    let playlistText = response.data;

    // Rewrite internal master playlist links
    const rewrittenPlaylist = playlistText.replace(
      /https:\/\/vidmody\.com\/mm\/([^\s"]+?)\.gif/g,
      (match, wildcardPath) => {
        return `${host}/mm/${wildcardPath}.m3u8`;
      }
    );

    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.send(rewrittenPlaylist);
  } catch (error) {
    console.error(`Error loading master playlist for ID ${id}:`, error.message);
    res.status(502).send('Error loading video stream from Vidmody.');
  }
});

/**
 * Endpoint 3: Proxy the HLS Media Playlist using the zero-bandwidth fragment trick
 */
app.get('/mm/*', async (req, res) => {
  const wildcardPath = req.params[0];
  const originalPlaylistPath = wildcardPath.replace(/\.m3u8$/, '.gif');
  const targetUrl = `https://vidmody.com/mm/${originalPlaylistPath}`;

  try {
    console.log(`Proxying Media Playlist: ${targetUrl}`);
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidmody.com/'
      }
    });

    const playlistLines = response.data.split('\n');
    
    // Parse lines and rewrite segment URLs using the zero-bandwidth fragment trick
    const rewrittenLines = playlistLines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // Direct streaming: Rewrite segment URL by appending #.ts fragment
        if (trimmed.endsWith('.jpg') || trimmed.endsWith('.gif') || trimmed.endsWith('.png') || trimmed.endsWith('.jpeg')) {
          return `${trimmed}#.ts`;
        }
        return trimmed;
      }
      return line;
    });

    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.send(rewrittenLines.join('\n'));
  } catch (error) {
    console.error(`Error loading media playlist for ${wildcardPath}:`, error.message);
    res.status(502).send('Error loading video tracks.');
  }
});

// Warm cache on start
getM3UData().catch(err => console.error('Failed to initialize playlist cache:', err.message));

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Vidmody IPTV Proxy Server running on port ${PORT}`);
  console.log(`M3U playlist link: http://localhost:${PORT}/playlist.m3u`);
  console.log(`Smart TV portal link: http://localhost:${PORT}/index.html`);
  console.log(`==================================================`);
});
