FROM mcr.microsoft.com/devcontainers/typescript-node:18-bookworm

RUN apt-get install -y wget bzip2

# Run in silent mode and save downloaded script as anaconda.sh.
# Run with /bin/bash and run in silent mode to /opt/conda.
# Also get rid of installation script after finishing.
RUN wget --quiet https://repo.anaconda.com/archive/Anaconda3-2023.07-1-Linux-x86_64.sh -O ~/anaconda.sh && \
    /bin/bash ~/anaconda.sh -b -p /opt/conda && \
    rm ~/anaconda.sh

ENV PATH="/opt/conda/bin:$PATH"

# Sudo apt update needs to run in order for installation of fish to work .
RUN sudo apt update && \
    sudo apt install fish -y


