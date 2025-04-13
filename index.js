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
const TIMEOUT_MS = 4000; // 4 second timeout
const MAX_TITLE_LENGTH = 100; // Character limit for title

// Middleware
app.use(cors());
app.use(express.json());

// Verify yt-dlp exists and is executable
if (!fs.existsSync(YT_DLP_PATH)) {
  console.error('Error: yt-dlp binary not found at', YT_DLP_PATH);
  process.exit(1);
}

// Verify cookies file exists if needed
const USE_COOKIES = fs.existsSync(COOKIES_PATH);
if (!USE_COOKIES) {
  console.warn('Cookies file not found - restricted videos may fail');
}

// Build yt-dlp command
const buildCommand = (url) => {
  let command = `"${YT_DLP_PATH}" \\
    --no-cache-dir \\
    --no-update \\
    --quiet \\
    --socket-timeout 3 \\
    --force-ipv4 \\
    --skip-download \\
    --print "%(title)s"`;

  if (USE_COOKIES) {
    command += ` --cookies "${COOKIES_PATH}"`;
  }

  command += ` "${url}"`;
  return command;
};

// Main API endpoint
app.get('/adil', (req, res) => {
  const startTime = Date.now();
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ 
      error: 'URL parameter is required',
      example: '/adil?url=https://www.youtube.com/watch?v=VIDEO_ID'
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  const command = buildCommand(videoUrl);

  exec(command, { signal: controller.signal }, (error, stdout, stderr) => {
    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;

    if (error) {
      console.error(`[${new Date().toISOString()}] Error in ${responseTime}ms:`, {
        url: videoUrl,
        error: error.message,
        stderr: stderr.toString()
      });

      if (error.killed || error.signal) {
        return res.status(504).json({
          error: 'Request timeout',
          message: 'YouTube took too long to respond',
          responseTime: `${responseTime}ms`
        });
      }

      return res.status(500).json({
        error: 'Failed to fetch video title',
        details: stderr.toString() || error.message,
        responseTime: `${responseTime}ms`
      });
    }

    const title = stdout.toString().trim().substring(0, MAX_TITLE_LENGTH);
    console.log(`[${new Date().toISOString()}] Success in ${responseTime}ms:`, {
      url: videoUrl,
      title: title
    });

    res.json({
      title: title,
      responseTime: `${responseTime}ms`,
      usedCookies: USE_COOKIES
    });
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'YouTube Title API',
    endpoints: {
      getTitle: '/adil?url=YOUTUBE_URL'
    },
    config: {
      timeout: `${TIMEOUT_MS}ms`,
      ytDlpPath: YT_DLP_PATH,
      cookiesEnabled: USE_COOKIES
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log('Configuration:', {
    ytDlpPath: YT_DLP_PATH,
    cookiesPath: COOKIES_PATH,
    cookiesEnabled: USE_COOKIES,
    timeout: TIMEOUT_MS
  });

  // Verify yt-dlp works
  exec(`${YT_DLP_PATH} --version`, (error) => {
    if (error) {
      console.error('yt-dlp verification failed:', error.message);
    } else {
      console.log('yt-dlp verified and ready');
    }
  });
});
