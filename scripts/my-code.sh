#!/usr/bin/env bash

ROOT_PATH=~/Public/nodejs/vscode/

# remove some built-in extensions
extensions=(clojure coffeescript docker fsharp groovy handlebars hlsl jake less make lua microsoft-authentication perl r razor ruby rust theme-abyss theme-defaults theme-kimbie-dark theme-monokai theme-monokai-dimmed theme-quietlight theme-red theme-seti theme-solarized-dark theme-solarized-light theme-tomorrow-night-blue vb)

for ext in "${extensions[@]}"
do
  if [[ -d "extensions/$ext" ]]; then
    rm -rf "${ROOT_PATH}extensions/$ext"
    echo "removed ${ROOT_PATH}extensions/$ext"
  fi
done

# undo telemetry
TELEMETRY_URLS="(dc\.services\.visualstudio\.com)|(vortex\.data\.microsoft\.com)"
REPLACEMENT="s/$TELEMETRY_URLS/0\.0\.0\.0/g"

if [[ "$TRAVIS_OS_NAME" == "osx" ]]; then
  grep -rl --exclude-dir=.git -E $TELEMETRY_URLS . | xargs sed -i '' -E $REPLACEMENT
else
  grep -rl --exclude-dir=.git -E $TELEMETRY_URLS . | xargs sed -i -E $REPLACEMENT
fi

source "$ROOT_PATH"scripts/code.sh
