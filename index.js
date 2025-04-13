const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const YT_DLP_PATH = path.join(__dirname, 'bin', 'yt-dlp');
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const TIMEOUT_MS = 8000; // Increased timeout to 8 seconds
const RETRY_COUNT = 3; // Maximum retry attempts
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

// Simple in-memory cache
const cache = new Map();

// Verify yt-dlp exists
if (!fs.existsSync(YT_DLP_PATH)) {
  console.error('yt-dlp binary missing!');
  process.exit(1);
}

app.use(cors());

// Optimized command builder with different strategies
const buildCommand = (url, strategy = 'default') => {
  let command = `"${YT_DLP_PATH}" --no-cache-dir --no-update --quiet --skip-download --print "%(title)s"`;
  
  // Different strategies for different attempts
  switch(strategy) {
    case 'fast':
      command += ` --socket-timeout 3 --force-ipv4 --throttled-rate 1M`;
      break;
    case 'fallback':
      command += ` --socket-timeout 5 --force-ipv4 --compat-options no-youtube-unavailable-videos`;
      break;
    case 'final':
      command += ` --socket-timeout 8 --force-ipv4 --ignore-errors --no-playlist`;
      break;
    default:
      command += ` --socket-timeout 4 --force-ipv4`;
      if (fs.existsSync(COOKIES_PATH)) {
        command += ` --cookies "${COOKIES_PATH}"`;
      }
  }

  return `${command} "${url}"`;
};

// Execute with timeout and strategy
const executeWithStrategy = (url, strategy) => {
  return new Promise((resolve, reject) => {
    const command = buildCommand(url, strategy);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    exec(command, { signal: controller.signal }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      if (error) {
        reject({
          strategy: strategy,
          error: error.message,
          stderr: stderr.toString()
        });
      } else {
        resolve(stdout.toString().trim());
      }
    });
  });
};

// Main endpoint with progressive strategies
app.get('/adil', async (req, res) => {
  const videoUrl = req.query.url;
  const startTime = Date.now();

  if (!videoUrl || !videoUrl.includes('youtube.com')) {
    return res.status(400).json({ error: 'Valid YouTube URL required' });
  }

  // Check cache first
  if (cache.has(videoUrl) {
    const { title, timestamp } = cache.get(videoUrl);
    if (Date.now() - timestamp < CACHE_TTL) {
      return res.json({ 
        title: title,
        cached: true,
        responseTime: `${Date.now() - startTime}ms`
      });
    }
  }

  // Try different strategies in order
  const strategies = ['default', 'fast', 'fallback', 'final'];
  
  for (let attempt = 0; attempt < Math.min(strategies.length, RETRY_COUNT); attempt++) {
    const strategy = strategies[attempt];
    try {
      const title = await executeWithStrategy(videoUrl, strategy);
      
      // Cache successful result
      cache.set(videoUrl, {
        title: title,
        timestamp: Date.now()
      });

      return res.json({
        title: title,
        strategy: strategy,
        attempt: attempt + 1,
        responseTime: `${Date.now() - startTime}ms`
      });
    } catch (error) {
      console.error(`Attempt ${attempt + 1} (${strategy}) failed: ${error.error}`);
      // Continue to next strategy if not final attempt
    }
  }

  // All attempts failed
  res.status(504).json({
    error: 'Could not fetch title after multiple attempts',
    attempts: RETRY_COUNT,
    responseTime: `${Date.now() - startTime}ms`
  });
});

// Health endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ready',
    config: {
      timeout: `${TIMEOUT_MS}ms`,
      retries: RETRY_COUNT,
      strategies: ['default', 'fast', 'fallback', 'final']
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running with ${TIMEOUT_MS}ms timeout and ${RETRY_COUNT} retries`);
});
