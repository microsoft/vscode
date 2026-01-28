ARG BASE_IMAGE=registry.access.redhat.com/ubi9/nodejs-22
FROM ${BASE_IMAGE}

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
