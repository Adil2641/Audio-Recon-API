const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const { promisify } = require("util");
const timeoutSignal = require('timeout-signal');

const app = express();
const PORT = process.env.PORT || 3000;
const execPromise = promisify(exec);

// Path configuration
const YT_DLP = path.join(__dirname, "bin", "yt-dlp");
const COOKIES = path.join(__dirname, "cookies.txt");

// Middleware
app.use(cors());
app.use(express.json());

// Timeout configuration (3 seconds total, 2.8s for yt-dlp)
const TOTAL_TIMEOUT = 3000;
const YT_DLP_TIMEOUT = 2800;

// Optimized yt-dlp command with fastest possible options
const getTitleCommand = (url) => {
    return `"${YT_DLP}" \
        --no-cache-dir \
        --no-update \
        --no-progress \
        --no-warnings \
        --quiet \
        --socket-timeout 2 \
        --compat-options no-youtube-unavailable-videos \
        --force-ipv4 \
        --throttled-rate 100K \
        --cookies "${COOKIES}" \
        --skip-download \
        --print "%(title)s" \
        "${url}"`;
};

// Main endpoint with aggressive timeout handling
app.get("/adil", async (req, res) => {
    const startTime = Date.now();
    const videoUrl = req.query.url;
    
    if (!videoUrl) {
        return res.status(400).json({ error: "Missing URL parameter" });
    }

    try {
        // Setup timeout control
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, YT_DLP_TIMEOUT);

        const cmd = getTitleCommand(videoUrl);
        
        // Execute with timeout
        const { stdout } = await execPromise(cmd, { 
            signal: controller.signal,
            timeout: YT_DLP_TIMEOUT - 200 // Give 200ms buffer
        });

        clearTimeout(timeout);
        
        const title = stdout.trim();
        const responseTime = Date.now() - startTime;
        
        console.log(`Success in ${responseTime}ms: ${title.substring(0, 30)}...`);
        
        return res.json({ 
            title,
            response_time: responseTime
        });

    } catch (error) {
        console.error(`Error (${Date.now() - startTime}ms):`, error.message);
        
        if (error.killed || error.signal) {
            return res.status(504).json({ 
                error: "YouTube title fetch timeout",
                response_time: Date.now() - startTime
            });
        }
        
        return res.status(500).json({ 
            error: "Failed to fetch title",
            details: error.message,
            response_time: Date.now() - startTime
        });
    }
});

// Health endpoint
app.get("/", (req, res) => {
    res.send("⚡ Ultra-Fast YouTube Title API");
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Warm up yt-dlp
    exec(`${YT_DLP} --version`, (error) => {
        if (error) {
            console.error("Warmup failed - check yt-dlp installation");
        } else {
            console.log("yt-dlp ready - maximum speed optimized");
        }
    });
});
