const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CDN_M3U_URL = 'https://cdn.jsdelivr.net/gh/Playtvapp/Playtvlist@main/FİLMLERFANTİKAPPP.m3u';
const LOCAL_M3U_PATH = path.join(__dirname, 'FİLMLERFANTİKAPPP.m3u');
const OUTPUT_PATH = path.join(__dirname, 'public', 'playlist.m3u');

async function buildPlaylist() {
  console.log('--- Starting Playlist Build ---');
  let rawData = '';

  // 1. Try to load local file if exists (for faster builds/local runs)
  if (fs.existsSync(LOCAL_M3U_PATH)) {
    console.log('Loading playlist from local file...');
    rawData = fs.readFileSync(LOCAL_M3U_PATH, 'utf8');
  } else {
    // 2. Fallback to CDN URL
    console.log('Fetching playlist from CDN...');
    try {
      const response = await axios.get(CDN_M3U_URL, { responseType: 'text' });
      rawData = response.data;
    } catch (err) {
      console.error('Failed to fetch from CDN, trying with HTTP...');
      // Fallback in case of temporary CDN network issue
      const response = await axios.get(CDN_M3U_URL.replace('https', 'http'), { responseType: 'text' });
      rawData = response.data;
    }
  }

  // Determine Netlify Host during build
  // Netlify sets process.env.URL dynamically (e.g. https://babam-sinema.netlify.app)
  const host = process.env.URL || 'https://babam-sinema.netlify.app';
  console.log(`Using Host URL for rewriting: ${host}`);

  // Rewrite all Vidmody URLs to point to our Netlify function
  console.log('Rewriting URLs in progress...');
  const rewrittenData = rawData.replace(/https:\/\/vidmody\.com\/vs\/([a-zA-Z0-9_-]+)/g, (match, id) => {
    return `${host}/vs/${id}.m3u8`;
  });

  // Ensure public directory exists
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  // Write static playlist
  fs.writeFileSync(OUTPUT_PATH, rewrittenData, 'utf8');
  console.log(`--- Playlist Build Success ---`);
  console.log(`Output written to: ${OUTPUT_PATH}`);
  console.log(`Size: ${(rewrittenData.length / 1024 / 1024).toFixed(2)} MB`);
}

buildPlaylist().catch(err => {
  console.error('Build step failed:', err.message);
  process.exit(1);
});
