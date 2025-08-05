#!/bin/bash

# Check if Python3 is already installed
if command -v python3 &> /dev/null; then
    echo "Python3 is already installed:"
    python3 --version
else
    echo "Python3 not found. Installing Python3..."
    sudo apt update
    sudo apt install -y python3
    echo "Python3 installation completed:"
    python3 --version
fi

# Check if pip is available, if not install it
if ! python3 -m pip --version &> /dev/null; then
    echo "pip not found. Installing pip..."
    sudo apt install -y python3-pip
fi

# Upgrade pip, setuptools, and wheel
echo "Upgrading pip, setuptools, and wheel..."
python3 -m pip install --upgrade pip setuptools wheel packaging gitpython
