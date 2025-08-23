#!/bin/bash

# Install pyenv and Python versions here to avoid using shim.
curl https://pyenv.run | bash
echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
# echo 'eval "$(pyenv init -)"' >> ~/.bashrc

export PYENV_ROOT="$HOME/.pyenv"
command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"
# eval "$(pyenv init -)" Comment this out and DO NOT use shim.
source ~/.bashrc

# Install Python via pyenv .
pyenv install 3.8.18 3.9:latest 3.10:latest 3.11:latest

# Set default Python version to 3.8 .
pyenv global 3.8.18

npm ci

# Create Virutal environment.
pyenv exec python -m venv .venv

# Activate Virtual environment.
source /workspaces/vscode-python/.venv/bin/activate

# Install required Python libraries.
/workspaces/vscode-python/.venv/bin/python -m pip install nox
nox --session install_python_libs

/workspaces/vscode-python/.venv/bin/python -m pip install -r build/test-requirements.txt
/workspaces/vscode-python/.venv/bin/python -m pip install -r build/functional-test-requirements.txt

# Below will crash codespace
# npm run compile
