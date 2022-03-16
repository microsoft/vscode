# This dockerfile is used to build up from a base image to create an image a cache.tar file containing the results of running "prepare.sh".
# Other image contents: https://github.com/microsoft/vscode-dev-containers/blob/master/repository-containers/images/github.com/microsoft/vscode/.devcontainer/base.Dockerfile

# This first stage generates cache.tar
FROM mcr.microsoft.com/vscode/devcontainers/repos/microsoft/vscode:dev as cache
ARG USERNAME=node
ARG CACHE_FOLDER="/home/${USERNAME}/.devcontainer-cache"
COPY --chown=${USERNAME}:${USERNAME} . /repo-source-tmp/
RUN mkdir -p ${CACHE_FOLDER} && chown ${USERNAME} ${CACHE_FOLDER} /repo-source-tmp \
	&& su ${USERNAME} -c "\
		cd /repo-source-tmp \
		&& .devcontainer/cache/before-cache.sh . ${CACHE_FOLDER} \
		&& .devcontainer/prepare.sh . ${CACHE_FOLDER} \
		&& .devcontainer/cache/cache-diff.sh . ${CACHE_FOLDER}"

# This second stage starts fresh and just copies in cache.tar from the previous stage. The related
# devcontainer.json file is then setup to have postCreateCommand fire restore-diff.sh to expand it.
FROM mcr.microsoft.com/vscode/devcontainers/repos/microsoft/vscode:dev as dev-container
ARG USERNAME=node
ARG CACHE_FOLDER="/home/${USERNAME}/.devcontainer-cache"
RUN mkdir -p "${CACHE_FOLDER}" && chown "${USERNAME}:${USERNAME}" "${CACHE_FOLDER}"
COPY --from=cache ${CACHE_FOLDER}/cache.tar ${CACHE_FOLDER}/
