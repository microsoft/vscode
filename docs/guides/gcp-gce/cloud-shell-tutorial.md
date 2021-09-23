# How to set up OpenVSCode Server on GCE

## Welcome 👋!

In this tutorial, you are going to set up [OpenVSCode Server](https://github.com/gitpod-io/openvscode-server) on GCE.

**Time to complete**: Less than 10 minutes

Click the **Start** button to move to the next step.

## Enable required APIs

Click the button below to enable the APIs required to complete this tutorial.

<walkthrough-enable-apis apis="compute.googleapis.com"></walkthrough-enable-apis>

## Create a VM

Let's first create a virtual machine to host our server:

```bash
gcloud beta compute instances create openvscode-server --machine-type=e2-micro --image=ubuntu-2004-focal-v20210908 --image-project=ubuntu-os-cloud --boot-disk-size=10GB --boot-disk-type=pd-balanced --boot-disk-device-name=openvscode-server --tags=http-openvscode-server
```

**Tip**: Click the copy button on the side of the code box and paste the command in the Cloud Shell terminal to run it.

### Allow HTTP & HTTPS

To access OpenVSCode Server, we have to allow HTTP traffic on port 3000 to the server:

```bash
gcloud compute firewall-rules create openvscode-server-allow-http-3000 --direction=INGRESS --priority=1000 --network=default --action=ALLOW --rules=tcp:3000 --source-ranges=0.0.0.0/0 --target-tags=http-openvscode-server
```

Next, you will ssh into the newly created VM to install OpenVSCode Server.

## Install OpenVSCode Server

### Connect to the VM

```bash
gcloud beta compute ssh "openvscode-server"  --project "dcs-openvscode-server"
```

### Download OpenVSCode Server

**Caution**: Make sure you successfully connected to the `openvscode-server` VM before you execute the following commands. Your prompt should read: `your-name@openvscode-server:~$`

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

### Execute the startup script

While you are still connected to the VM, execute the following command to start OpenVSCode Server:

```bash
cd openvscode-server-v$SERVER_VERSION-linux-x64
./server.sh
```

**Note**: If you cancel the script, the OpenVSCode Server will stop.

Next up, you are going to access the shiny new OpenVSCode Server in your browser.

## Access OpenVSCode Server in your browser

Congratulations 🎉! Use the following command to access OpenVSCode Server in a new browser tab.

With the server still running, open a new Cloud Shell tab and execute the following command:

```bash
export SERVER_IP=$(gcloud compute instances describe openvscode-server \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
echo "http://$SERVER_IP:3000"
```

Click the URL displayed in the terminal to see OpenVSCode Server up and running.
