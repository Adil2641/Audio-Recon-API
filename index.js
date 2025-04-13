const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const YT_DLP_PATH = path.join(__dirname, 'bin', 'yt-dlp');
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const BASE_TIMEOUT = 5000; // Base 5 second timeout
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
    name: 'default',
    flags: '--force-ipv4 --socket-timeout 3',
    timeout: BASE_TIMEOUT,
    useCookies: true
  },
  {
    name: 'fast',
    flags: '--force-ipv4 --throttled-rate 2M --socket-timeout 2 --no-playlist',
    timeout: BASE_TIMEOUT - 1000,
    useCookies: false
  },
  {
    name: 'fallback',
    flags: '--force-ipv4 --compat-options no-youtube-unavailable-videos --socket-timeout 4',
    timeout: BASE_TIMEOUT + 2000,
    useCookies: false
  }
];

const buildCommand = (url, strategy) => {
  let command = `"${YT_DLP_PATH}" --no-cache-dir --no-update --quiet --skip-download --print "%(title)s"`;
  command += ` ${strategy.flags}`;
  
  if (strategy.useCookies && fs.existsSync(COOKIES_PATH)) {
    command += ` --cookies "${COOKIES_PATH}"`;
  }

  return `${command} "${url}"`;
};

const fetchTitle = async (url) => {
  const errors = [];
  
  for (const strategy of strategies) {
    try {
      const command = buildCommand(url, strategy);
      const { stdout } = await Promise.race([
        execPromise(command, { timeout: strategy.timeout }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout exceeded')), strategy.timeout)
        )
      ]);
      
      return stdout.trim();
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

  if (!videoUrl || !videoUrl.includes('youtube.com')) {
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

app.listen(PORT, () => {
  console.log(`Server running with base timeout of ${BASE_TIMEOUT}ms`);
  console.log('Available strategies:', strategies.map(s => s.name));
});
