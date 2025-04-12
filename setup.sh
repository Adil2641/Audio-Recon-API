#!/bin/bash

# Install ffmpeg (optional but useful)
apt-get update && apt-get install -y ffmpeg curl

# Download yt-dlp to /usr/local/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp

# Make it executable
chmod a+rx /usr/local/bin/yt-dlp
