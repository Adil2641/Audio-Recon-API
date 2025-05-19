#!/bin/bash

# Create bin directory for yt-dlp
mkdir -p bin

# Download yt-dlp binary to local bin folder
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp

# Make yt-dlp executable
chmod +x bin/yt-dlp

# Disable auto-updates
#export YTDL_NO_UPDATE=1
