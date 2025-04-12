const express = require("express");
const ytdl = require("ytdl-core");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/kshitiz", async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: "Missing 'url' query parameter." });
    }

    try {
        if (!ytdl.validateURL(videoUrl)) {
            return res.status(400).json({ error: "Invalid YouTube URL." });
        }

        const info = await ytdl.getBasicInfo(videoUrl);
        const title = info.videoDetails.title;

        return res.json({ title });
    } catch (error) {
        console.error("Error fetching video info:", error.message);
        return res.status(500).json({ error: "Failed to fetch video title." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
