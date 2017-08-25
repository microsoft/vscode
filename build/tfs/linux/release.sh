#!/bin/bash

. ./scripts/env.sh
. ./build/tfs/common/common.sh

step "Build Debian package" \
	npm run gulp -- "vscode-linux-$ARCH-build-deb"

step "Build RPM package" \
	npm run gulp -- "vscode-linux-$ARCH-build-rpm"

(cd $BUILD_SOURCESDIRECTORY/build/tfs/common && \
	step "Install build dependencies" \
	npm install --unsafe-perm)

# Variables
PLATFORM_LINUX="linux-$ARCH"
PLATFORM_DEB="linux-deb-$ARCH"
PLATFORM_RPM="linux-rpm-$ARCH"
[[ "$ARCH" == "ia32" ]] && DEB_ARCH="i386" || DEB_ARCH="amd64"
[[ "$ARCH" == "ia32" ]] && RPM_ARCH="i386" || RPM_ARCH="x86_64"
REPO="`pwd`"
ROOT="$REPO/.."
BUILDNAME="VSCode-$PLATFORM_LINUX"
BUILD="$ROOT/$BUILDNAME"
BUILD_VERSION="$(ls $REPO/.build/linux/deb/$DEB_ARCH/deb/ | sed -e 's/code-[a-z]*_//g' -e 's/\.deb$//g')"
[ -z "$VSCODE_QUALITY" ] && TARBALL_FILENAME="code-$BUILD_VERSION.tar.gz" || TARBALL_FILENAME="code-$VSCODE_QUALITY-$BUILD_VERSION.tar.gz"
TARBALL_PATH="$ROOT/$TARBALL_FILENAME"
PACKAGEJSON="$BUILD/resources/app/package.json"
VERSION=$(node -p "require(\"$PACKAGEJSON\").version")

rm -rf $ROOT/code-*.tar.*
(cd $ROOT && \
	step "Create tar.gz archive" \
	tar -czf $TARBALL_PATH $BUILDNAME)

step "Publish tar.gz archive" \
	node build/tfs/common/publish.js $VSCODE_QUALITY $PLATFORM_LINUX archive-unsigned $TARBALL_FILENAME $VERSION true $TARBALL_PATH

DEB_FILENAME="$(ls $REPO/.build/linux/deb/$DEB_ARCH/deb/)"
DEB_PATH="$REPO/.build/linux/deb/$DEB_ARCH/deb/$DEB_FILENAME"

step "Publish Debian package" \
	node build/tfs/common/publish.js $VSCODE_QUALITY $PLATFORM_DEB package $DEB_FILENAME $VERSION true $DEB_PATH

RPM_FILENAME="$(ls $REPO/.build/linux/rpm/$RPM_ARCH/ | grep .rpm)"
RPM_PATH="$REPO/.build/linux/rpm/$RPM_ARCH/$RPM_FILENAME"

step "Publish RPM package" \
	node build/tfs/common/publish.js $VSCODE_QUALITY $PLATFORM_RPM package $RPM_FILENAME $VERSION true $RPM_PATH

if [ -z "$VSCODE_QUALITY" ]; then
	echo "VSCODE_QUALITY is not set, skipping repo package publish"
else
	if [ "$BUILD_SOURCEBRANCH" = "master" ] || [ "$BUILD_SOURCEBRANCH" = "refs/heads/master" ]; then
		if [[ $BUILD_QUEUEDBY = *"Project Collection Service Accounts"* || $BUILD_QUEUEDBY = *"Microsoft.VisualStudio.Services.TFS"* ]]; then
			# Get necessary information
			pushd $REPO && COMMIT_HASH=$(git rev-parse HEAD) && popd
			PACKAGE_NAME="$(ls $REPO/.build/linux/deb/$DEB_ARCH/deb/ | sed -e 's/_.*//g')"
			DEB_URL="https://az764295.vo.msecnd.net/$VSCODE_QUALITY/$COMMIT_HASH/$DEB_FILENAME"
			RPM_URL="https://az764295.vo.msecnd.net/$VSCODE_QUALITY/$COMMIT_HASH/$RPM_FILENAME"
			PACKAGE_VERSION="$(ls $REPO/.build/linux/deb/$DEB_ARCH/deb/ | sed -e 's/code-[a-z]*_//g' -e 's/\_.*$//g')"
			# Write config files needed by API, use eval to force environment variable expansion
			DIRNAME=$(dirname $(readlink -f $0))
			pushd $DIRNAME
			# Submit to apt repo
			if [ "$DEB_ARCH" = "amd64" ]; then
				eval echo '{ \"server\": \"azure-apt-cat.cloudapp.net\", \"protocol\": \"https\", \"port\": \"443\", \"repositoryId\": \"58a4adf642421134a1a48d1a\", \"username\": \"$LINUX_REPO_USERNAME\", \"password\": \"$LINUX_REPO_PASSWORD\" }' > apt-config.json
				eval echo '{ \"name\": \"$PACKAGE_NAME\", \"version\": \"$PACKAGE_VERSION\", \"repositoryId\": \"58a4adf642421134a1a48d1a\", \"sourceUrl\": \"$DEB_URL\" }' > apt-addpkg.json
				echo "Submitting apt-addpkg.json:"
				cat apt-addpkg.json

				step "Publish to repositories" \
					./repoapi_client.sh -config apt-config.json -addpkg apt-addpkg.json
			fi
			# Submit to yum repo (disabled as it's manual until signing is automated)
			# eval echo '{ \"server\": \"azure-apt-cat.cloudapp.net\", \"protocol\": \"https\", \"port\": \"443\", \"repositoryId\": \"58a4ae3542421134a1a48d1b\", \"username\": \"$LINUX_REPO_USERNAME\", \"password\": \"$LINUX_REPO_PASSWORD\" }' > yum-config.json
			# eval echo '{ \"name\": \"$PACKAGE_NAME\", \"version\": \"$PACKAGE_VERSION\", \"repositoryId\": \"58a4ae3542421134a1a48d1b\", \"sourceUrl\": \"$RPM_URL\" }' > yum-addpkg.json
			# echo "Submitting yum-addpkg.json:"
			# cat yum-addpkg.json
			# ./repoapi_client.sh -config yum-config.json -addpkg yum-addpkg.json
			popd
			echo "To check repo publish status run ./repoapi_client.sh -config config.json -check <id>"
		fi
	fi
fi
