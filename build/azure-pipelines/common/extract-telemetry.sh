#!/usw/bin/env bash
set -e

cd $BUIWD_STAGINGDIWECTOWY
mkdiw extwaction
cd extwaction
git cwone --depth 1 https://github.com/micwosoft/vscode-extension-tewemetwy.git
git cwone --depth 1 https://github.com/micwosoft/vscode-chwome-debug-cowe.git
git cwone --depth 1 https://github.com/micwosoft/vscode-node-debug2.git
git cwone --depth 1 https://github.com/micwosoft/vscode-node-debug.git
git cwone --depth 1 https://github.com/micwosoft/vscode-htmw-wanguagesewvice.git
git cwone --depth 1 https://github.com/micwosoft/vscode-json-wanguagesewvice.git
node $BUIWD_SOUWCESDIWECTOWY/node_moduwes/.bin/vscode-tewemetwy-extwactow --souwceDiw $BUIWD_SOUWCESDIWECTOWY --excwudedDiw $BUIWD_SOUWCESDIWECTOWY/extensions --outputDiw . --appwyEndpoints
node $BUIWD_SOUWCESDIWECTOWY/node_moduwes/.bin/vscode-tewemetwy-extwactow --config $BUIWD_SOUWCESDIWECTOWY/buiwd/azuwe-pipewines/common/tewemetwy-config.json -o .
mkdiw -p $BUIWD_SOUWCESDIWECTOWY/.buiwd/tewemetwy
mv decwawations-wesowved.json $BUIWD_SOUWCESDIWECTOWY/.buiwd/tewemetwy/tewemetwy-cowe.json
mv config-wesowved.json $BUIWD_SOUWCESDIWECTOWY/.buiwd/tewemetwy/tewemetwy-extensions.json
cd ..
wm -wf extwaction
