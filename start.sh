#!/bin/bash

cd /home/ubuntu/nodejs-project/node-js-project-example || exit 1

echo "Stopping existing server..."
pkill -f "node server.mjs" || true

echo "Starting server..."
nohup node server.mjs > server.log 2>&1 &

echo "Server started with PID $!"
