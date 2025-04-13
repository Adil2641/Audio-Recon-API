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
const TIMEOUT_MS = 6000; // Increased to 6 seconds
const RETRY_COUNT = 2; // Number of retry attempts

// Verify yt-dlp exists
if (!fs.existsSync(YT_DLP_PATH)) {
  console.error('yt-dlp binary missing!');
  process.exit(1);
}

app.use(cors());

// Improved yt-dlp command with fallback options
const buildCommand = (url, attempt = 1) => {
  let command = `"${YT_DLP_PATH}" \\
    --no-cache-dir \\
    --no-update \\
    --quiet \\
    --socket-timeout ${attempt * 2} \\ // Increase timeout with each attempt
    --force-ipv4 \\
    --skip-download \\
    --print "%(title)s"`;

  // Only use cookies on first attempt (might be slowing things down)
  if (fs.existsSync(COOKIES_PATH) && attempt === 1) {
    command += ` --cookies "${COOKIES_PATH}"`;
  }

  // Fallback options for subsequent attempts
  if (attempt > 1) {
    command += ` --compat-options no-youtube-unavailable-videos`;
  }

  command += ` "${url}"`;
  return command;
};

// Retry wrapper with timeout
const fetchWithRetry = (url, attempt = 1) => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    const command = buildCommand(url, attempt);

    exec(command, { signal: controller.signal }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      
      if (error) {
        if (attempt < RETRY_COUNT) {
          console.log(`Attempt ${attempt} failed, retrying...`);
          resolve(fetchWithRetry(url, attempt + 1));
        } else {
          reject({
            error: error,
            stderr: stderr.toString(),
            attempt: attempt
          });
        }
      } else {
        resolve(stdout.toString().trim());
      }
    });
  });
};

// Main endpoint with retry logic
app.get('/adil', async (req, res) => {
  const startTime = Date.now();
  const videoUrl = req.query.url;

  if (!videoUrl || !videoUrl.includes('youtube.com')) {
    return res.status(400).json({ error: 'Valid YouTube URL required' });
  }

  try {
    const title = await fetchWithRetry(videoUrl);
    const responseTime = Date.now() - startTime;
    
    res.json({
      title: title,
      responseTime: `${responseTime}ms`,
      attempts: title.includes('retry') ? 2 : 1
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`Failed after ${error.attempt} attempts in ${responseTime}ms`);
    
    res.status(500).json({
      error: 'Failed to fetch title',
      details: error.stderr || error.error.message,
      responseTime: `${responseTime}ms`,
      attempts: error.attempt
    });
  }
});

// Health endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ready',
    config: {
      timeout: `${TIMEOUT_MS}ms`,
      retries: RETRY_COUNT
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running with ${TIMEOUT_MS}ms timeout`);
});
