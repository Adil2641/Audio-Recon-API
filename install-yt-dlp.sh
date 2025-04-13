#!/bin/bash

echo "Setting up yt-dlp..."

# Create bin directory if it doesn't exist
mkdir -p bin

# Download yt-dlp binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp

# Make it executable
chmod a+rx bin/yt-dlp

# Verify installation
./bin/yt-dlp --version

echo "yt-dlp setup complete!"
