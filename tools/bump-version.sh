#!/bin/sh
# Stamp every script and stylesheet reference with a new version so phones
# don't mix freshly deployed files with cached old ones after a push.
# Run before committing a change to the site.
set -e
cd "$(dirname "$0")/.."
v=$(date +%Y%m%d%H%M%S)
sed -i -E "s#\.js\?v=[A-Za-z0-9]+#.js?v=$v#g" js/*.js index.html
sed -i -E "s#style\.css\?v=[A-Za-z0-9]+#style.css?v=$v#g" index.html
echo "version $v"
