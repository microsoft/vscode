# OpenVSCode Server

[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-908a85?logo=gitpod)](https://gitpod.io/from-referrer)
[![GitHub](https://img.shields.io/github/license/gitpod-io/openvscode-server)](https://github.com/gitpod-io/openvscode-server/blob/main/LICENSE.txt)
[![Discord](https://img.shields.io/discord/816244985187008514)](https://www.gitpod.io/chat)

## What is this?

This project provides a version of VS Code that runs a server on a remote machine and allows access through a modern web browser. It's based on the very same architecture used by [Gitpod](https://www.gitpod.io) or [GitHub Codespaces](https://github.com) at scale.

<img width="1624" alt="Screenshot 2021-09-02 at 08 39 26" src="https://user-images.githubusercontent.com/372735/131794918-d6602646-4d67-435b-88fe-620a3cc0a3aa.png">

## Why?

VS Code has traditionally been a desktop IDE built with web technologies. A few years back, people started patching it in order to run it in a remote context and to make it accessible through web browsers. These efforts have been complex and error prone, because many changes had to be made across the large code base of VS Code.

Luckily, in 2019 the VS Code team started to refactor its architecture to support a browser-based working mode. While this architecture has been adopted by Gitpod and GitHub, the important bits have not been open-sourced, until now. As a result, many people in the community still use the old, hard to maintain and error-prone approach.

At Gitpod, we've been asked a lot about how we do it. So we thought we might as well share the minimal set of changes needed so people can rely on the latest version of VS Code, have a straightforward upgrade path and low maintenance effort.

## Getting started

### Docker

- Start the server:
```bash
docker run -it --init -p 3000:3000 -v "$(pwd):/home/workspace:cached" gitpod/openvscode-server
```
- Visit [localhost:3000](http://localhost:3000).

_Note_: Feel free to use the `nightly` tag to test the latest version, i.e. `gitpod/openvscode-server:nightly`.

#### Custom Environment
- If you want to add dependencies to this Docker image, here is a template to help:
	```Dockerfile

	FROM gitpod/openvscode-server:latest

	USER root # to get permissions to install packages and such
	RUN # the installation process for software needed
	USER openvscode-server # to restore permissions for the web interface

	```
- For additional possibilities, please consult the `Dockerfile` for OpenVSCode Server at https://github.com/gitpod-io/openvscode-releases/

### Linux

- [Download the latest release](https://github.com/gitpod-io/openvscode-server/releases/latest)
- Untar and run the server:
```bash
tar -xzf openvscode-server-v${OPENVSCODE_SERVER_VERSION}.tar.gz
cd openvscode-server-v${OPENVSCODE_SERVER_VERSION}
./server.sh
```
- Visit [localhost:3000](http://localhost:3000).

_Note_: You can use [pre-releases](https://github.com/gitpod-io/openvscode-server/releases) to test nightly changes.

### Deployment guides

Please refer to [Guides](https://github.com/gitpod-io/openvscode-server/tree/docs/guides) to learn how to deploy OpenVSCode Server to your cloud provider of choice.

## The scope of this project

This project only adds minimal bits required to run VS Code in a server scenario. We have no intention of changing VS Code in any way or to add additional features to VS Code itself. Please report feature requests, bug fixes, etc. in the upstream repository.

> **For any feature requests, bug reports, or contributions that are not specific to running VS Code in a server context, please go to [Visual Studio Code - Open Source "OSS"](https://github.com/microsoft/vscode)**

## Documentation

All documentation is available in [the `docs` branch](https://github.com/gitpod-io/openvscode-server/tree/docs) of this project.

## Supporters

The project is supported by companies such as [GitLab](https://gitlab.com/), [VMware](https://www.vmware.com/), [Uber](https://www.uber.com/), [SAP](https://www.sap.com/), [Sourcegraph](https://sourcegraph.com/), [RStudio](https://www.rstudio.com/), [SUSE](https://rancher.com/), [Tabnine](https://www.tabnine.com/), [Render](https://render.com/) and [TypeFox](https://www.typefox.io/).

## Contributing

Thanks for your interest in contributing to the project 🙏. You can start a development environment with the following button:

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/from-referrer)

To learn about the code structure and other topics related to contributing, please refer to the [development docs](https://github.com/gitpod-io/openvscode-server/blob/docs/development.md).

## Community & Feedback

To learn what others are up to and to provide feedback, please head over to the [Discussions](https://github.com/gitpod-io/openvscode-server/discussions).

You can also follow us on Twitter [@gitpod](https://twitter.com/gitpod) or come [chat with us](https://www.gitpod.io/chat).

## Legal
This project is not affiliated with Microsoft Corporation.
