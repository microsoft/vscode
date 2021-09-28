# Deploy OpenVSCode Server to Render

## Prerequisites

To complete this guide, you need:
* a [Render](https://render.com/) account

## Setup

To deploy to Render, click the following button and follow the instructions:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/render-examples/gitpod-openvscode-server)

After that, create a name for the service group (for example `OpenVSCode Server`) and click <kbd>Apply</kbd>.

## Start the server

Render starts the server automatically.

## Access OpenVSCode Server

When the deployment is complete, you will see your server listed in the <kbd>Services</kbd> section of the Dashboard. Click the dashboard entry to see your server URL to access OpenVSCode Server.

![image showing where the URL can be found](https://user-images.githubusercontent.com/36797588/134728867-54de3d3f-31e5-4c08-a239-f6d2babeec7b.png)

## Teardown

Delete the service in your dashboard.


---


# Deploy Secure OpenVSCode Server to Render with OAuth

## Prerequisites

To complete this guide, you need:
* a [Render](https://render.com/) account
* an account with the [OAuth Provider](https://oauth2-proxy.github.io/oauth2-proxy/docs/configuration/oauth_provider) of your choice.

## Set up provider account

Consult the [OAuth2-Proxy Provider Configuration Documentation](https://oauth2-proxy.github.io/oauth2-proxy/docs/configuration/oauth_provider/), and select at least one provider to use for authenticating users of Open VSCode. Create an OAuth application with your provider of choice. For the Homepage/Base URI, enter a placeholder like `https://openvscode-secure-server.onrender.com`, and for the Callback/Redirect URI, enter a placeholder like `https://openvscode-secure-server.onrender.com/oauth2/callback`. You will update the OAuth2 app with your URIs once your OAuth2-Proxy Server deployment is complete. Save the Client Secret and ID in a secure place like a password manager for later reference.


## Set up Open VSCode Server

To deploy Open VSCode to Render as a private service, click the following button and follow the instructions:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/render-examples/openvscode-private-server)

After that, create a name for the service group (for example `Private OpenVSCode Server`) and click <kbd>Apply</kbd>.

## Start the server

Render starts the server automatically. Copy the service address to the clipboard:
![Image showing where the service address can be found](https://user-images.githubusercontent.com/36797588/135016293-fb9b351b-f764-4c22-a1a3-7bfdec386f50.jpeg)


## Set up OAuth2-Proxy server

Fork the [OAuth2-Proxy Render Example Repository](https://github.com/dnilasor/oauth2-proxy). In the Render Dashboard, select <kbd>YAML</kbd> from the side navigation and click the <kbd>New From YAML</kbd> button:
![Image showing where to initialize a new service from YAML](https://user-images.githubusercontent.com/36797588/135017966-06eb2d3a-1255-42df-800d-38413b8180d8.jpeg)

After that, use your connected GitHub account or the full URL of your public OAuth-Proxy fork to create a deployment based on the fork.

## Configure OAuth server

Create a name for the service group (for example, `Secure Access To Open VSCode`). Next, enter the environment variable values to configure OAuth.

- For `OAUTH2_PROXY_UPSTREAMS` enter the Service Address for Private Open VSCode Server appended by http://
- For `OAUTH2_PROXY_CLIENT_ID` enter the Client ID from your OAuth App
- For `OAUTH2_PROXY_CLIENT_SECRET` enter the Client Secret from your OAuth App or password manager
- For `OAUTH2_PROXY_PROVIDER` enter the name of your OAuth provider
	
![Image showing YAML service creation and input of sync: false values](https://user-images.githubusercontent.com/36797588/135025049-fd399efb-3c17-4a12-9539-0d12e4306eeb.jpeg)

## Start the server

Render starts the server automatically.

## Access OpenVSCode Server

When the deployment is complete, you will see your OAuth server listed in the <kbd>Services</kbd> section of the Dashboard. Click the dashboard entry to see your server URL to access OpenVSCode Server. You will be prompted to authenticate and then redirected to the private Open VSCode service.

## Teardown

Delete the service in your dashboard.






