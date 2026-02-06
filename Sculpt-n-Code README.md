# Sculpt-n-Code

Setup:

```
git clone https://github.com/brianhempel/vscode.git
cd vscode
git checkout snc
npm install

# Use your ordinary VS Code extensions
mkdir ~/.vscode-oss-dev
ln -s ~/.vscode/extensions ~/.vscode-oss-dev/extensions

# Build (first build takes 66sec)
npm run watch-client
npm run watch # if you are working on extensions

# In separate terminal
./scripts/code.sh
```

After building once, you can edit `~/.vscode-oss-dev/argv.json` to disable crash reporting.

Front-end code is at: `src/vs/editor/contrib/snc`

Back-end runner is at: `src/vs/platform/snc`

The Python visualizers are at: `src/vs/platform/snc/common/node/visualizers`

Visualizers use the Elm architecture (albeit a custom implementation in Python). They take in a Python value and a visualizer-specific model state and render HTML which is delivered to the VS Code front-end for display. They may specify events on that HTML which are routed to a visualizer-specific Python update function which updates the model (and thereby the displayed HTML).

User events trigger a full re-run to get back to the appropriate visualizer to run the event through its Elm-like update and visualize functions. To speed this up, Python is preloaded at two checkpoints to avoid paying startup costs. Checkpoint 1 is after the python_runner.py is started up; checkpoint 2 is after just the `import`s on the open file (to avoid re-paying import and source-to-source translation cost). Checkpoint 2 is used if the code didn't change, checkpoint 1 otherwise.

See `Scuplt-n-Code README 2.md` for more architecture details.

## Committing

Currently, one big commit to streamline rebasing. Amend that commit.

```
git add .
git commit --no-verify --amend -m 'message'
git push -f
```

After that, to update on latest VS Code as below. Currently can't move up because I need a C++20 compiler for tree-sitter on the newer versions of node.

```
git fetch ms --tags
git reset --hard TAG
git cherry-pick --no-commit origin/snc
# probably will have to "Accept Both" on all merge conflicts
git add WHATEVER
git commit --no-verify
```

If everything still works:

```
git push -f
```

## Scratch Notes (ignore)

How to get the Python path etc: https://github.com/microsoft/vscode-python-debugger/blob/main/src/extension/common/python.ts

All together: https://github.com/microsoft/vscode-python-debugger/blob/main/src/extension/debugger/configuration/resolvers/launch.ts

Process spawning/killing: debugpy-main/src/debugpy/launcher/handlers.py debugpy-main/src/debugpy/launcher/debuggee.py

Can overwrite the import handling pretty easily, if we need to hook into that process: https://docs.python.org/3/reference/import.html https://github.com/rohitsanj/import-hook-python/blob/main/import_hook.py https://docs.python.org/3/library/importlib.htm
