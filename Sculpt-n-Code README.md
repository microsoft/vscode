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

Inspiration from projection boxes: https://github.com/microsoft/vscode/compare/main...UCSD-PL:vscode:main


CS1 because it's simpler
RNA/DNA is concrete
D3 is hard for students, particular the interactive parts
pandas and relation tables (mini visualizations of trucks) (dev thinks data science is too different)
data structures: advent of code, there are patterns that might be nice for semi-abstraction

what about understanding and changing AI code? how to nudge students to *think*; talk to Lisa

can you even design semiabstractions for e.g. tables? our grant examples are convenient

Paper 1: Manipations on Abstractions, that can (a) re-represent (b) change
Paper 1: DMP w/o semiabstraction
Paper 2: Combine the above
(Paper 1: Live Shapes of Abstraction)
(Paper 1: Need-finding)
