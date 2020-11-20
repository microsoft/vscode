# This dockerfile is used to build up from a base image to create an image with cached results of running "prepare.sh".
# Other image contents: https://github.com/microsoft/vscode-dev-containers/blob/master/repository-containers/images/github.com/microsoft/vscode/.devcontainer/base.Dockerfile
FROM mcr.microsoft.com/vscode/devcontainers/repos/microsoft/vscode:dev

ARG USERNAME=node
COPY --chown=${USERNAME}:${USERNAME} . /repo-source-tmp/
RUN mkdir /usr/local/etc/devcontainer-cache \
	&& chown ${USERNAME} /usr/local/etc/devcontainer-cache /repo-source-tmp \
	&& su ${USERNAME} -c "\
		cd /repo-source-tmp \
		&& .devcontainer/cache/before-cache.sh \
		&& .devcontainer/prepare.sh \
		&& .devcontainer/cache/cache-diff.sh" \
	&& rm -rf /repo-source-tmp
