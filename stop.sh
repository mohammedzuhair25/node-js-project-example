#!/bin/bash

cd /home/ubuntu/nodejs-project/node-js-project-example || exit 1

echo "Stopping existing server..."
pkill -f "node server.mjs" || true

