# Deploy OpenVSCode Server to Azure VM

## Prerequisites

To complete this guide, you need:
* an [Azure](https://azure.microsoft.com/en-us/) subscription

## Setup

### Create a VM

1. Navigate to https://portal.azure.com/#create/Microsoft.VirtualMachine-ARM
1. Launch a Ubuntu 20.04 instance with the default settings
  * **Caution**: Please follow security best practices when setting up your VM

### Download & extract OpenVSCode Server

**Caution**: Make sure you successfully connected to the VM before you execute the following commands.

First, let's define the release version we want to download. You can find the latest version on the [Releases](https://github.com/gitpod-io/openvscode-server/releases) page.

```bash
export SERVER_VERSION=1.60.0 # Replace with the latest version
```

With that in place, let's download & extract OpenVSCode server:

```bash
wget https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-v$SERVER_VERSION/openvscode-server-v$SERVER_VERSION-linux-x64.tar.gz -O code-server.tar.gz
tar -xzf code-server.tar.gz
rm code-server.tar.gz
```



## Start the server

While you are still connected to the VM, execute the following commands to start OpenVSCode Server:

```bash
cd openvscode-server-v$SERVER_VERSION-linux-x64
./server.sh
```

## Access OpenVSCode Server


## Teardown

1. Navigate to your VM's instance dashboard page
1. Click on "Stop"
