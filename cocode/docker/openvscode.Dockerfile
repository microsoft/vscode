FROM gitpod/openvscode-server:latest

USER root

# Create workspaces directory
RUN mkdir -p /workspaces && \
	chown -R openvscode-server:openvscode-server /workspaces

# Install minimal tools for C/C++/Python
RUN apt-get update && apt-get install -y \
	build-essential \
	clang \
	clang-format \
	cmake \
	gdb \
	python3 \
	python3-pip \
	git \
	&& rm -rf /var/lib/apt/lists/*

# Install collaboration extension from packaged VSIX
COPY --chown=openvscode-server:openvscode-server services/collab-extension/*.vsix /tmp/extensions/
RUN set -eux; \
	apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*; \
	collab_vsix="$(find /tmp/extensions -maxdepth 1 -name 'cocode-collab-extension-*.vsix' | head -n 1)"; \
	if [ -z "$collab_vsix" ]; then echo 'Collaboration VSIX not found at build time' >&2; exit 1; fi; \
	echo "Found VSIX: $collab_vsix"; \
	ext_dir="/home/.openvscode-server/extensions/cocode-collab-extension-1.0.0"; \
	mkdir -p "$ext_dir"; \
	unzip -q "$collab_vsix" -d "$ext_dir"; \
	mv "$ext_dir/extension/"* "$ext_dir/" || true; \
	rmdir "$ext_dir/extension" 2>/dev/null || true; \
	chown -R openvscode-server:openvscode-server "$ext_dir"; \
	rm -f /tmp/extensions/*.vsix; \
	echo "Extension installed to $ext_dir"

# Disable extensions gallery to avoid OpenVSX lookups
RUN set -eux; \
	product_json="$(find / -type f -name product.json 2>/dev/null | head -n 1)"; \
	if [ -n "$product_json" ]; then \
		echo "Patching ${product_json}"; \
		apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*; \
		jq 'del(.extensionsGallery)' "$product_json" > "$product_json.tmp" && \
		mv "$product_json.tmp" "$product_json"; \
	fi

# Create and set permissions for workspace directory
RUN mkdir -p /home/workspace/.openvscode-server && \
	chown -R openvscode-server:openvscode-server /home/workspace

USER openvscode-server

ENV OPENVSCODE_SERVER_ROOT=/home/.openvscode-server

# Disable telemetry
ENV DISABLE_TELEMETRY=true

WORKDIR /home/workspace

# Expose the server port
EXPOSE 3000

# Start the OpenVSCode server
CMD ["/home/.openvscode-server/bin/openvscode-server", "--host", "0.0.0.0", "--port", "3000", "--without-connection-token"]

