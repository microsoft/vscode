# Deploy OpenVSCode Server to Digital Ocean

## Prerequisites

To complete this guide, you need:
* a [Digital Ocean](https://www.digitalocean.com/) account

## Setup

### Create the Droplet

First, you need to create a Virtual Machine to host your server. If you don't have one already, you can start with [our template](https://cloud.digitalocean.com/droplets/new?use_case=droplet&i=59c3b0&fleetUuid=a8fdcc26-2bf0-449d-8113-e458327192fe&distro=ubuntu&distroImage=ubuntu-20-04-x64&size=s-1vcpu-1gb-amd&region=fra1&options=ipv6), then change a couple of settings as explained below.

- You either need to set a password or add an SSH key. For demonstration purposes, it's easier to use a password. **Caution**: This is for demo purposes, please follow security best practices for a production environment.
- We need to do is to check the checkbox <kbd>User data</kbd> and add the following script to the text field below: **TODO: What script, cc @filiptronicek**

### Prepare the Droplet

- First things first, you need to turn on the Droplet by selecting it in the dashboard and toggling the switch on the top right of the page.
- Then, you need to copy the Droplet's IP address, available on the same page in the top bar. If you are unsure whether to copy the **ipv4** or **ipv6** address, select **ipv4**.
- Now you can connect to your droplet via SSH, which you can do straight from your terminal by executing the following commands (you will need to replace `DROPLET_IP` with the actual address you copied in the previous step):
		```
		ssh root@DROPLET_IP
		```
- When prompted, enter the password you chose during the configuration.

### Download & extract OpenVSCode Server

**Caution**: Make sure you successfully connected to the Droplet before you execute the following commands.

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

While you are still connected to the Droplet, execute the following commands to start OpenVSCode Server:

```bash
cd openvscode-server-v$SERVER_VERSION-linux-x64
./server.sh
```

> Gotcha: If you close the SSH session, the server will stop as well. To avoid this, you can run the server script in the background with the command shown below. If you want to do things like kill the process or bring it back to the foreground, refer to [Run a Linux Command in the Background](https://linuxize.com/post/how-to-run-linux-commands-in-background/#run-a-linux-command-in-the-background) or use a multiplexer such as [tmux](https://en.wikipedia.org/wiki/Tmux) [[tmux - a very simple beginner's guide](https://www.ocf.berkeley.edu/~ckuehl/tmux/)].
```
./server.sh >/dev/null 2>&1 &
```

You're all set!

## Access OpenVSCode Server

You can now access your IDE at `http://<your-droplet-ip>:3000`.

## Teardown

Delete the Droplet through the Digital Ocean web interface.

## Further steps

### Running OpenVSCode Server on startup

If you want to run the server on boot, you can add this to your Crontab file (`crontab -e`):

```
@reboot /root/openvscode-server-v<REPLACE_WITH_LATEST_VERSION>-linux-x64/server.sh
```

Make sure you replace `REPLACE_WITH_LATEST_VERSION` with the version you used earlier.

### Add a custom domain

You can follow the official [DNS Quickstart](https://docs.digitalocean.com/products/networking/dns/quickstart/) guide for setting up a custom domain with your Droplet.

### Secure the Droplet

There is an awesome video by Mason Egger called [Securing Your Droplet](https://youtu.be/L8e_eAm4fFM), which explains some key steps for hardening the security of the Droplet.
