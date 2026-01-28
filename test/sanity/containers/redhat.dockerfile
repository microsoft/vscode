ARG BASE_IMAGE=redhat/ubi9:9.7
FROM ${BASE_IMAGE}

# Node.js
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - \
	&& dnf install -y --setopt=install_weak_deps=False nodejs \
	&& dnf clean all \
	&& rm -rf /var/cache/dnf
