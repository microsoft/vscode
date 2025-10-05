#!/bin/bash
set -e

echo "================================================================"
echo "VS Code Development Dependencies Installer"
echo "================================================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Detect package manager
if command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt"
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
elif command -v zypper &> /dev/null; then
    PKG_MANAGER="zypper"
else
    echo -e "${RED}No supported package manager found (apt, dnf, yum, zypper)${NC}"
    exit 1
fi

echo -e "${GREEN}Detected package manager: $PKG_MANAGER${NC}"

# Update package lists
echo -e "\n${YELLOW}Updating package lists...${NC}"
case $PKG_MANAGER in
    apt)
        apt-get update
        ;;
    dnf|yum)
        $PKG_MANAGER check-update || true
        ;;
    zypper)
        zypper refresh
        ;;
esac

# Install build dependencies
echo -e "\n${YELLOW}Installing build dependencies...${NC}"
case $PKG_MANAGER in
    apt)
        apt-get install -y \
            build-essential \
            g++ \
            gcc \
            make \
            python3 \
            python3-pip \
            pkg-config \
            libsecret-1-dev \
            libxkbfile-dev \
            libkrb5-dev \
            git \
            curl \
            wget \
            gpg \
            lsb-release
        ;;
    dnf)
        dnf install -y \
            gcc \
            gcc-c++ \
            make \
            python3 \
            python3-pip \
            pkgconfig \
            libsecret-devel \
            libxkbfile-devel \
            krb5-devel \
            git \
            curl \
            wget \
            gpg
        ;;
    yum)
        yum install -y \
            gcc \
            gcc-c++ \
            make \
            python3 \
            python3-pip \
            pkgconfig \
            libsecret-devel \
            libxkbfile-devel \
            krb5-devel \
            git \
            curl \
            wget \
            gpg
        ;;
    zypper)
        zypper install -y \
            gcc \
            gcc-c++ \
            make \
            python3 \
            python3-pip \
            pkg-config \
            libsecret-devel \
            libxkbfile-devel \
            krb5-devel \
            git \
            curl \
            wget \
            gpg2
        ;;
esac

# Install runtime dependencies (from snapcraft.yaml)
echo -e "\n${YELLOW}Installing runtime dependencies...${NC}"
case $PKG_MANAGER in
    apt)
        # Detect Ubuntu version to handle package name changes
        UBUNTU_VERSION=$(lsb_release -rs 2>/dev/null || echo "0")
        UBUNTU_MAJOR=$(echo "$UBUNTU_VERSION" | cut -d. -f1)
        UBUNTU_MINOR=$(echo "$UBUNTU_VERSION" | cut -d. -f2)

        # For Ubuntu 24.04+, use t64 package names where applicable
        if [ "$UBUNTU_MAJOR" -ge 24 ]; then
            apt-get install -y \
                ca-certificates \
                libasound2t64 \
                libatk-bridge2.0-0t64 \
                libatk1.0-0t64 \
                libatspi2.0-0t64 \
                libcairo2 \
                libcanberra-gtk3-module \
                libcurl3t64-gnutls \
                libcurl4t64 \
                libegl1 \
                libdrm2 \
                libgbm1 \
                libgl1 \
                libgles2 \
                libglib2.0-0t64 \
                libgtk-3-0t64 \
                libibus-1.0-5 \
                libnss3 \
                libpango-1.0-0 \
                libsecret-1-0 \
                libwayland-egl1 \
                libxcomposite1 \
                libxdamage1 \
                libxfixes3 \
                libxkbcommon0 \
                libxkbfile1 \
                libxrandr2 \
                libxss1 \
                locales-all \
                packagekit-gtk3-module \
                xdg-utils
        else
            # For older Ubuntu versions, use original package names
            apt-get install -y \
                ca-certificates \
                libasound2 \
                libatk-bridge2.0-0 \
                libatk1.0-0 \
                libatspi2.0-0 \
                libcairo2 \
                libcanberra-gtk3-module \
                libcurl3-gnutls \
                libcurl3-nss \
                libcurl4 \
                libegl1 \
                libdrm2 \
                libgbm1 \
                libgl1 \
                libgles2 \
                libglib2.0-0 \
                libgtk-3-0 \
                libibus-1.0-5 \
                libnss3 \
                libpango-1.0-0 \
                libsecret-1-0 \
                libwayland-egl1 \
                libxcomposite1 \
                libxdamage1 \
                libxfixes3 \
                libxkbcommon0 \
                libxkbfile1 \
                libxrandr2 \
                libxss1 \
                locales-all \
                packagekit-gtk3-module \
                xdg-utils
        fi
        ;;
    dnf)
        dnf install -y \
            ca-certificates \
            alsa-lib \
            at-spi2-atk \
            atk \
            at-spi2-core \
            cairo \
            libcanberra-gtk3 \
            libcurl \
            mesa-libEGL \
            libdrm \
            mesa-libgbm \
            mesa-libGL \
            mesa-libGLES \
            glib2 \
            gtk3 \
            ibus \
            nss \
            pango \
            libsecret \
            libwayland-egl \
            libXcomposite \
            libXdamage \
            libXfixes \
            libxkbcommon \
            libxkbfile \
            libXrandr \
            libXScrnSaver \
            PackageKit-gtk3-module \
            xdg-utils
        ;;
    yum)
        yum install -y \
            ca-certificates \
            alsa-lib \
            at-spi2-atk \
            atk \
            at-spi2-core \
            cairo \
            libcanberra-gtk3 \
            libcurl \
            mesa-libEGL \
            libdrm \
            mesa-libgbm \
            mesa-libGL \
            mesa-libGLES \
            glib2 \
            gtk3 \
            ibus \
            nss \
            pango \
            libsecret \
            libXcomposite \
            libXdamage \
            libXfixes \
            libxkbcommon \
            libxkbfile \
            libXrandr \
            libXScrnSaver \
            xdg-utils
        ;;
    zypper)
        zypper install -y \
            ca-certificates \
            alsa \
            at-spi2-atk \
            atk \
            at-spi2-core \
            cairo \
            libcanberra-gtk3-module \
            libcurl4 \
            libEGL1 \
            libdrm2 \
            libgbm1 \
            Mesa-libGL1 \
            Mesa-libGLESv2 \
            glib2 \
            gtk3 \
            ibus \
            mozilla-nss \
            pango \
            libsecret-1-0 \
            libXcomposite1 \
            libXdamage1 \
            libXfixes3 \
            libxkbcommon0 \
            libxkbfile1 \
            libXrandr2 \
            libXss1 \
            xdg-utils
        ;;
esac

# Check Node.js installation
echo -e "\n${YELLOW}Checking Node.js installation...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}Node.js is already installed: $NODE_VERSION${NC}"

    # Check if version is 18 or higher
    NODE_MAJOR=$(node --version | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        echo -e "${YELLOW}Warning: Node.js version 18+ is recommended. Current version: $NODE_VERSION${NC}"
        echo -e "${YELLOW}Consider updating Node.js manually or using nvm${NC}"
    fi
else
    echo -e "${YELLOW}Node.js not found. Installing via NodeSource...${NC}"

    # Install Node.js 22.x (LTS) via NodeSource
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

    case $PKG_MANAGER in
        apt)
            apt-get install -y nodejs
            ;;
        dnf)
            dnf install -y nodejs
            ;;
        yum)
            yum install -y nodejs
            ;;
        zypper)
            zypper install -y nodejs
            ;;
    esac

    echo -e "${GREEN}Node.js installed: $(node --version)${NC}"
fi

# Install global npm packages
echo -e "\n${YELLOW}Installing global npm packages...${NC}"
npm install -g node-gyp yarn

# Summary
echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}All system dependencies installed successfully!${NC}"
echo -e "${GREEN}================================================================${NC}"

echo -e "\n${YELLOW}Next steps (run as regular user, not root):${NC}"
echo -e "  1. cd $(pwd)"
echo -e "  2. npm install         # Install Node.js dependencies"
echo -e "  3. npm run compile     # Compile TypeScript"
echo -e "  4. code vscode.code-workspace  # Open in VS Code"
echo -e "  5. Press F5 to debug\n"

echo -e "${YELLOW}Or use the watch mode for development:${NC}"
echo -e "  npm run watch\n"

echo -e "${GREEN}Installation complete!${NC}"
