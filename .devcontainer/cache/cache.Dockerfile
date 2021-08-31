# This dockerfile is used to build up from a base image to create an image a cache.tar file containing the results of running "prepare.sh".
# Other image contents: https://github.com/microsoft/vscode-dev-containers/blob/master/repository-containers/images/github.com/microsoft/vscode/.devcontainer/base.Dockerfile

# This first stage generates cache.tar
FROM mcr.microsoft.com/vscode/devcontainers/repos/microsoft/vscode:dev as cache
ARG USERNAME=node
COPY --chown=${USERNAME}:${USERNAME} . /repo-source-tmp/
RUN mkdir /usr/local/etc/devcontainer-cache \
	&& chown ${USERNAME} /usr/local/etc/devcontainer-cache /repo-source-tmp \
	&& su ${USERNAME} -c "\
		cd /repo-source-tmp \
		&& .devcontainer/cache/before-cache.sh \
		&& .devcontainer/prepare.sh \
		&& .devcontainer/cache/cache-diff.sh"

# This second stage starts fresh and just copies in cache.tar from the previous stage. The related
# devcontainer.json file is then setup to have postCreateCommand fire restore-diff.sh to expand it.
FROM mcr.microsoft.com/vscode/devcontainers/repos/microsoft/vscode:dev as dev-container
ARG USERNAME=node
ARG CACHE_FOLDER="/usr/local/etc/devcontainer-cache"
RUN mkdir -p "${CACHE_FOLDER}" && chown "${USERNAME}:${USERNAME}" "${CACHE_FOLDER}"
COPY --from=cache ${CACHE_FOLDER}/cache.tar ${CACHE_FOLDER}/
