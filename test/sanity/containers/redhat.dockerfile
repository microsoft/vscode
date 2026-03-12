ARG BASE_IMAGE=redhat/ubi9:9.7
FROM ${BASE_IMAGE}

# Node.js 22
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && \
	dnf install -y nodejs-22.21.1
