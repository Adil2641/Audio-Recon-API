const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/kshitiz", async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: "Missing 'url' query parameter." });
    }

    const cmd = `yt-dlp --skip-download --print "%(title)s" "${videoUrl}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error("Error executing yt-dlp:", stderr);
            return res.status(500).json({ error: "Failed to fetch title." });
        }

        const title = stdout.trim();
        return res.json({ title });
    });
});

app.get("/", (req, res) => {
    res.send("🎵 YouTube Title API using yt-dlp is running.");
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
