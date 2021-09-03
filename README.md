# VS Code Web Server

[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-908a85?logo=gitpod)](https://gitpod.io/from-referrer/)

## What is this?

This project provides a version of VS Code that runs a server on a remote machine and allows through a modern web browser. It's based on the very same architecture used by [Gitpod](https://www.gitpod.io) or [GitHub Codespaces](https://github.com).

<img width="1624" alt="Screenshot 2021-09-02 at 08 39 26" src="https://user-images.githubusercontent.com/372735/131794918-d6602646-4d67-435b-88fe-620a3cc0a3aa.png">

## Why?

VS Code has traditionally been a desktop IDE built with web technology. A few years back people started patching it, in order to run it in a remote context and to make it accessible through web browsers. [These efforts have been complex and error prone](https://github.com/cdr/code-server/issues/3835), because many changes had to be made across the large code base of VS Code.

Luckily in 2019 the VS Code team started to refactor its architecture to support this working mode. While this new architecture has been adopted by Gitpod and GitHub, the important bits have not been open-sources, yet. As a result many people in the community are still using the old hard to maintain and error-prone approach.

At Gitpod we've been asked a lot about how we do it. So we thought we might just share the minimal set of changes needed, so people can rely on the latest version of VS Code and have a straight forward upgrade path and low maintenance effort.

## Getting started

The easiest way to get started is ...

## The scope of this project

This project really only adds the minimal bits required to run VS Code in a web server scenario. We have no intention of changing VS Code in any way or adding additional features through this. Feature request, bug fixes, etc. should go to the upstream repository.

> **For any feature requests, bug reports, or contributions that are not specific to running VS Code in a web server context,**
>
> **please go to [Visual Studio Code - Open Source "OSS"](https://github.com/microsoft/vscode)**
