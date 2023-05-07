# Use the TypeScript and Node.js 16 development container as the base image
FROM mcr.microsoft.com/devcontainers/typescript-node:16-bullseye

# Copy the VS Code installation script to the root directory of the container
ADD install-vscode.sh /root/

# Run the VS Code installation script
RUN /root/install-vscode.sh

# Configure Git to hide the status bar in the Codespaces extension
RUN git config --system codespaces-theme.hide-status 1

# Switch to the 'node' user
USER node

# Remove any existing Yarn cache directory and create a symbolic link to a new one
RUN YARN_CACHE="$(yarn cache dir)" && rm -rf "$YARN_CACHE" && ln -s /vscode-dev/yarn-cache "$YARN_CACHE"

# Switch back to the 'root' user and set the ownership of the '/vscode-dev' directory to 'node:node'
USER root
CMD chown node:node /vscode-dev && \
    # Create a new Yarn cache directory within '/vscode-dev' using the 'node' user
    sudo -u node mkdir -p /vscode-dev/yarn-cache && \
    # Sleep indefinitely to keep the container running
    sleep inf
