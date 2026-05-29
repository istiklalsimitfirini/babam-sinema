const express = require('express');
const cors = require('cors');
const axios = require('axios');
const serverless = require('serverless-http');

const app = express();

// Enable CORS
app.use(cors());

/**
 * Helper to get correct protocol and host in Netlify environments
 */
function getHostUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

/**
 * Endpoint 1: Proxy the HLS Master Playlist
 */
app.get('/vs/:id.m3u8', async (req, res) => {
  const { id } = req.params;
  const targetUrl = `https://vidmody.com/vs/${id}`;

  try {
    console.log(`[Netlify Serverless] Proxying Master Playlist: ${targetUrl}`);
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidmody.com/'
      }
    });

    const host = getHostUrl(req);
    let playlistText = response.data;

    // Rewrite internal master playlist links:
    // Replace: https://vidmody.com/mm/tt123456/.../index.gif
    // With: https://<host>/mm/tt123456/.../index.m3u8
    const rewrittenPlaylist = playlistText.replace(
      /https:\/\/vidmody\.com\/mm\/([^\s"]+?)\.gif/g,
      (match, wildcardPath) => {
        return `${host}/mm/${wildcardPath}.m3u8`;
      }
    );

    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.setHeader('Cache-Control', 'public, max-age=600'); // Cache playlist for 10 minutes
    res.send(rewrittenPlaylist);
  } catch (error) {
    console.error(`Error loading master playlist for ID ${id}:`, error.message);
    res.status(502).send('Error loading video stream from Vidmody.');
  }
});

/**
 * Endpoint 2: Proxy the HLS Media Playlist using the zero-bandwidth segment hile (fragment spoofing)
 */
app.get('/mm/*', async (req, res) => {
  // wildcardPath will be: tt20859028/main_1080p/index-v1-a1.m3u8
  const wildcardPath = req.params[0];
  
  // Reconstruct the original .gif playlist URL:
  const originalPlaylistPath = wildcardPath.replace(/\.m3u8$/, '.gif');
  const targetUrl = `https://vidmody.com/mm/${originalPlaylistPath}`;

  try {
    console.log(`[Netlify Serverless] Proxying Media Playlist: ${targetUrl}`);
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidmody.com/'
      }
    });

    const playlistLines = response.data.split('\n');
    
    // Parse lines and rewrite disguised segment URLs using the zero-bandwidth fragment trick
    const rewrittenLines = playlistLines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // Only append fragment #.ts to disguised image formats (.jpg, .gif, .png)
        if (trimmed.endsWith('.jpg') || trimmed.endsWith('.gif') || trimmed.endsWith('.png') || trimmed.endsWith('.jpeg')) {
          return `${trimmed}#.ts`;
        }
        // Keep standard subtitle chunks (.vtt) untouched
        return trimmed;
      }
      return line;
    });

    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.setHeader('Cache-Control', 'public, max-age=600'); // Cache playlist for 10 minutes
    res.send(rewrittenLines.join('\n'));
  } catch (error) {
    console.error(`Error loading media playlist for ${wildcardPath}:`, error.message);
    res.status(502).send('Error loading video tracks.');
  }
});

// Export Express App wrapped in serverless-http for Netlify Functions
module.exports.handler = serverless(app);
