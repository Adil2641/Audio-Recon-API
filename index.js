const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Added for API fallback
const util = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const YT_DLP_PATH = path.join(__dirname, 'bin', 'yt-dlp');
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const BASE_TIMEOUT = 10000; // Increased to 10 seconds
const execPromise = util.promisify(exec);

// Verify yt-dlp exists
if (!fs.existsSync(YT_DLP_PATH)) {
  console.error('yt-dlp binary missing!');
  process.exit(1);
}

app.use(cors());

// Strategy configurations
const strategies = [
  {
    name: 'fast',
    command: (url) => `"${YT_DLP_PATH}" --force-ipv4 --socket-timeout 5 --throttled-rate 2M --no-playlist --skip-download --print "%(title)s" "${url}"`,
    timeout: 5000
  },
  {
    name: 'default',
    command: (url) => {
      let cmd = `"${YT_DLP_PATH}" --force-ipv4 --socket-timeout 8 --skip-download --print "%(title)s"`;
      if (fs.existsSync(COOKIES_PATH)) {
        cmd += ` --cookies "${COOKIES_PATH}"`;
      }
      return `${cmd} "${url}"`;
    },
    timeout: 8000
  },
  {
    name: 'api-fallback',
    handler: async (url) => {
      const videoId = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1];
      if (!videoId) throw new Error('Invalid YouTube URL');
      
      const response = await axios.get(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { timeout: 5000 }
      );
      return response.data.title;
    },
    timeout: 5000
  }
];

const fetchTitle = async (url) => {
  const errors = [];
  
  for (const strategy of strategies) {
    try {
      let title;
      const startTime = Date.now();
      
      if (strategy.command) {
        const { stdout } = await Promise.race([
          execPromise(strategy.command(url), { timeout: strategy.timeout }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout exceeded')), strategy.timeout)
          )
        ]);
        title = stdout.trim();
      } else if (strategy.handler) {
        title = await Promise.race([
          strategy.handler(url),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout exceeded')), strategy.timeout)
          )
        ]);
      }

      console.log(`Success with ${strategy.name} in ${Date.now() - startTime}ms`);
      return title;
      
    } catch (error) {
      errors.push({
        strategy: strategy.name,
        error: error.message
      });
      console.error(`Attempt (${strategy.name}) failed: ${error.message}`);
    }
  }
  
  throw new Error(`All strategies failed: ${JSON.stringify(errors)}`);
};

app.get('/adil', async (req, res) => {
  const startTime = Date.now();
  const videoUrl = req.query.url;

  if (!videoUrl || !/youtube\.com|youtu\.be/.test(videoUrl)) {
    return res.status(400).json({ error: 'Valid YouTube URL required' });
  }

  try {
    const title = await fetchTitle(videoUrl);
    const responseTime = Date.now() - startTime;
    
    res.json({
      title,
      responseTime: `${responseTime}ms`,
      status: 'success'
    });
  } catch (error) {
    res.status(504).json({
      error: 'Failed to fetch title after multiple attempts',
      details: error.message,
      responseTime: `${Date.now() - startTime}ms`
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ready',
    strategies: strategies.map(s => s.name)
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running with base timeout of ${BASE_TIMEOUT}ms`);
  console.log('Available strategies:', strategies.map(s => s.name));
});
