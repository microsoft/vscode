# Deploy OpenVSCode Server to AWS EC2

## Prerequisites

To complete this guide, you need:
* an [AWS](https://aws.amazon.com/) account

## Setup

### Create a VM

1. Navigate to https://console.aws.amazon.com/ec2
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

### Create an inbound rule for port 3000

To access OpenVSCode Server on port 3000 later, we have to create an inbound rule:
1. Open the instance summary page
1. Select the "Security" tab
1. In the "Security groups" section, click on the link to open the security group page
1. In the "Inbound rules" table, click the "Edit inbound rules" button on the right side
1. Click "Add rule" and populate the following fields (use default values for everything else):
  * Type: Custom TCP
	* Port range: 3000
	* Source: Anywhere-IPv4
1. Click "Save rules"

## Start the server

While you are still connected to the VM, execute the following commands to start OpenVSCode Server:

```bash
cd openvscode-server-v$SERVER_VERSION-linux-x64
./server.sh
```

## Access OpenVSCode Server

1. Navigate to your VM's instance summary page
1. Copy the "Public IPv4 address"
1. Paste the IP address in a new browser tab and add `:3000`, i.e. `http://18.118.194.234:3000`

## Teardown

1. Navigate to your VM's instance summary page
1. Click "Instance state" and select "Terminate instance"
