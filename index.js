const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Path configuration
const YT_DLP = path.join(__dirname, "bin", "yt-dlp");
const COOKIES = path.join(__dirname, "cookies.txt");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request timeout middleware (5 seconds)
app.use((req, res, next) => {
    res.setTimeout(5000, () => {
        res.status(504).json({ error: "Request timeout" });
    });
    next();
});

// Cache object (simple in-memory cache)
const cache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

// Optimized yt-dlp command
const getTitleCommand = (url) => {
    return `"${YT_DLP}" \
        --no-cache-dir \
        --no-update \
        --no-progress \
        --no-warnings \
        --quiet \
        --socket-timeout 5 \
        --force-ipv4 \
        --cookies "${COOKIES}" \
        --skip-download \
        --print "%(title)s" \
        "${url}"`;
};

// Main endpoint
app.get("/adil", async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) {
            return res.status(400).json({ error: "Missing 'url' query parameter." });
        }

        // Check cache first
        if (cache[videoUrl] && (Date.now() - cache[videoUrl].timestamp) < CACHE_TTL) {
            return res.json({ title: cache[videoUrl].title, cached: true });
        }

        const cmd = getTitleCommand(videoUrl);
        
        const title = await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 4500 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error processing ${videoUrl}:`, stderr || error.message);
                    return reject(new Error("Failed to fetch title from YouTube"));
                }
                resolve(stdout.trim());
            });
        });

        // Update cache
        cache[videoUrl] = {
            title: title,
            timestamp: Date.now()
        };

        return res.json({ title });
    } catch (error) {
        console.error("Endpoint error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get("/", (req, res) => {
    res.json({
        status: "running",
        message: "YouTube Title API using yt-dlp",
        endpoints: {
            getTitle: "/adil?url=YOUTUBE_URL"
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Optional: Warm up yt-dlp at startup
    exec(`${YT_DLP} --version`, (error) => {
        if (error) console.error("yt-dlp warmup failed:", error);
        else console.log("yt-dlp initialized");
    });
});
