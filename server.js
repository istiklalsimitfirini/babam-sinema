const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

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
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
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
 * Endpoint 1: Rewrite and serve the M3U Playlist dynamically with truncation to prevent Smart TV crashes
 */
app.get('/playlist.m3u', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const limit = parseInt(req.query.limit) || 2000; // Default limit is 2000 to prevent TV app crashes
    const isDirect = req.query.direct === 'true';
    const rawData = await getM3UData(forceRefresh);

    console.log(`Processing playlist with limit: ${limit} (Direct: ${isDirect})`);
    const lines = rawData.split('\n');
    const rewrittenLines = [];
    
    if (lines.length > 0 && lines[0].startsWith('#EXTM3U')) {
      rewrittenLines.push(lines[0]);
    } else {
      rewrittenLines.push('#EXTM3U');
    }

    const host = getHostUrl(req);
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF')) {
        if (count >= limit) break;
        
        // Push the EXTINF line
        rewrittenLines.push(line);
        
        // Look for the next line which should be the URL
        let nextIndex = i + 1;
        while (nextIndex < lines.length && lines[nextIndex].trim() === '') {
          nextIndex++;
        }
        
        if (nextIndex < lines.length && !lines[nextIndex].startsWith('#')) {
          const urlLine = lines[nextIndex].trim();
          // Rewrite the URL
          const rewrittenUrl = urlLine.replace(/https:\/\/vidmody\.com\/vs\/([a-zA-Z0-9_-]+)/g, (match, id) => {
            const queryParams = isDirect ? '?direct=true' : '';
            return `${host}/vs/${id}.m3u8${queryParams}`;
          });
          rewrittenLines.push(rewrittenUrl);
          i = nextIndex; // Move index forward
        }
        count++;
      }
    }

    const rewrittenData = rewrittenLines.join('\n');
    console.log(`Serving dynamic playlist with ${count} items (Size: ${(rewrittenData.length / 1024).toFixed(2)} KB)`);

    res.setHeader('Content-Type', 'application/x-mpegURL; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
    res.send(rewrittenData);
  } catch (error) {
    console.error('Error serving playlist.m3u:', error.message);
    res.status(500).send('Error loading M3U playlist: ' + error.message);
  }
});

// Serve static portal files (like index.html, styles.css, app.js) AFTER the dynamic playlist route
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Endpoint 2: Proxy the HLS Master Playlist
 */
app.get('/vs/:id.m3u8', async (req, res) => {
  const { id } = req.params;
  const targetUrl = `https://vidmody.com/vs/${id}`;
  const isDirect = req.query.direct === 'true';

  try {
    console.log(`Proxying Master Playlist: ${targetUrl} (Direct: ${isDirect})`);
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidmody.com/'
      }
    });

    const host = getHostUrl(req);
    let playlistText = response.data;

    // Rewrite internal master playlist links
    const queryParams = isDirect ? '?direct=true' : '';
    const rewrittenPlaylist = playlistText.replace(
      /https:\/\/vidmody\.com\/mm\/([^\s"]+?)\.gif/g,
      (match, wildcardPath) => {
        return `${host}/mm/${wildcardPath}.m3u8${queryParams}`;
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
 * Endpoint 3: Proxy the HLS Media Playlist rewriting segments to go through our proxy or direct link
 */
app.get('/mm/*', async (req, res) => {
  const wildcardPath = req.params[0];
  const originalPlaylistPath = wildcardPath.replace(/\.m3u8$/, '.gif');
  const targetUrl = `https://vidmody.com/mm/${originalPlaylistPath}`;
  const isDirect = req.query.direct === 'true';

  try {
    console.log(`Proxying Media Playlist: ${targetUrl} (Direct: ${isDirect})`);
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidmody.com/'
      }
    });

    const host = getHostUrl(req);
    const playlistLines = response.data.split('\n');
    
    // Parse lines and rewrite segment URLs
    const rewrittenLines = playlistLines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        if (isDirect) {
          // Zero-bandwidth direct link trick: append #.ts to make the TV play it directly from CDN
          if (trimmed.endsWith('.jpg') || trimmed.endsWith('.gif') || trimmed.endsWith('.png') || trimmed.endsWith('.jpeg')) {
            return `${trimmed}#.ts`;
          }
          return trimmed;
        } else {
          // Proxy stream segments through our server
          const ext = trimmed.endsWith('.vtt') ? 'vtt' : 'ts';
          return `${host}/seg.${ext}?url=${encodeURIComponent(trimmed)}`;
        }
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

/**
 * Endpoint 4: Proxy Stream Segments (Resolving CORB and TV player mime-type blocks) using high-performance native https module
 */
app.get('/seg.:ext', async (req, res) => {
  const { ext } = req.params;
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Missing target URL');
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://vidmody.com/'
    };

    if (ext === 'vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'video/mp2t');
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Proxy stream segments using native Node.js https.get for high performance and low latency
    https.get(targetUrl, { headers }, (proxyRes) => {
      if (proxyRes.statusCode >= 400) {
        console.error(`Proxy request failed with status: ${proxyRes.statusCode} for URL: ${targetUrl}`);
        res.status(proxyRes.statusCode).end();
        return;
      }
      proxyRes.pipe(res);
    }).on('error', (err) => {
      console.error(`Error proxying segment ${targetUrl}:`, err.message);
      if (!res.headersSent) {
        res.status(502).send('Error retrieving stream segment.');
      }
    });
  } catch (error) {
    console.error(`Error initializing segment proxy:`, error.message);
    if (!res.headersSent) {
      res.status(500).send('Proxy internal error.');
    }
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
