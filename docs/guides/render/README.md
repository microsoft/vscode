# Deploying an OpenVSCode Server to Render

## Creating the server with one click

To host OpenVSCode Server on Render (www.render.com), click the button below:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/login?next=/iac/new?repo=https://github.com/render-examples/gitpod-vscode-example)

After that, create a name for the service group (for example `OpenVSCode Server`) and click <kbd>Apply</kbd>.

After Render does its magic, you will see your server listed in the <kbd>Services</kbd> section of the Dashboard. In there, you can see your server URL, at which you can access it.

![image showing where the URL can be found](https://user-images.githubusercontent.com/29888641/133103443-c20a6eab-7d35-46d2-80b0-107dd9237870.png)

## Creating the server manually

- [Connect your GitHub account to your Render account](https://render.com/docs/github).
- Clone this repo.
- Create a new web service using this repo and the following parameters:
  - Environment: Docker
  - Advanced > Add Environment Variable
    - key: SERVER_VERSION
    - value: v1.60.0
  - Advanced > Add Disk
    - Name: data
    - Mount Path: /home/workspace
- Watch your OpenVSCode Server deploy, and then log in at the public URL listed below your web service name.

For a list of available `SERVER_VERSION` values, please refer to the [Releases](https://github.com/gitpod-io/openvscode-server/releases) page.
