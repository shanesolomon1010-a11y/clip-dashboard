#!/bin/bash
# Include both Intel (/usr/local) and Apple Silicon (/opt/homebrew) npm bin paths
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd /Users/shane/clip-dashboard
npx tsx scripts/youtube-studio-sync.ts >> logs/youtube-studio-sync.log 2>&1
