const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Local yt-dlp path
const YT_DLP = path.join(__dirname, "bin", "yt-dlp");

app.use(cors());

app.get("/kshitiz", (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).json({ error: "Missing 'url' query parameter." });
    }

    const cmd = `"${YT_DLP}" --skip-download --print "%(title)s" "${videoUrl}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error("yt-dlp error:", stderr);
            return res.status(500).json({ error: "Failed to fetch title." });
        }

        const title = stdout.trim();
        return res.json({ title });
    });
});

app.get("/", (req, res) => {
    res.send("🎵 YouTube Title API using yt-dlp (local) is running.");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
