#!/usr/bin/env bash

echo "Syncing openvscode-server with upstream"

upstream_url="https://github.com/microsoft/vscode.git"
upstream_branch=${1:-"upstream/main"}
local_branch=${2:-"main"}
base_commit_msg=${3:-"code web server initial commit"}
only_sync=${4:-"true"}

exit_script() {
	reason=$1
	echo "Update script ended unsucessfully"
	echo "Reason: $reason"
	exit 1
}

if [[ "$OSTYPE" == "darwin"* ]]; then
	realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
	ROOT=$(dirname $(dirname $(realpath "$0")))
else
	ROOT=$(dirname $(dirname $(readlink -f $0)))
	# --disable-dev-shm-usage --use-gl=swiftshader: when run on docker containers where size of /dev/shm
	# partition < 64MB which causes OOM failure for chromium compositor that uses the partition for shared memory
	LINUX_EXTRA_ARGS="--disable-dev-shm-usage --use-gl=swiftshader"
fi

# Checks is there's an upstream remote repository and if not
# set it to $upstream_url
check_upstream() {
	git remote -v | grep --quiet upstream
	if [[ $? -ne 0 ]]; then
		echo "Upstream repository not configured"
		echo "Setting upstream URL to ${upstream_url}"
		git remote add upstream $upstream_url
	fi
}

# Gets the base commit
get_base_commit() {
	local base_commit=$(git log --pretty="%H" --max-count=1 --grep "$base_commit_msg")
	if [[ -z $base_commit ]]; then
		exit_script "Could not find base commit"
	fi
	echo $base_commit
}

# Fetch updates from upstream and rebase
sync() {
	echo "Shallow fetching upstream..."
	git fetch upstream
	git checkout $local_branch
	echo "Rebasing $local_branch branch onto $upstream_branch from upstream"
	git rebase --onto=$upstream_branch $(get_base_commit)~ $local_branch
	if [[ $? -ne 0 ]]; then
		echo "There are merge conflicts doing the rebase."
		echo "Please resolve them or abort the rebase."
		exit_script "Could not rebase succesfully"
	fi
	echo "$local_branch sucessfully updated"
}

cd $ROOT

# Sync
check_upstream
sync

if [[ "$only_sync" == "true" ]]; then
	exit 0
fi

# Clean and build
# git clean -dfx
yarn && yarn server:init
if [[ $? -ne 0 ]]; then
	exit_script "There are some errors during compilation"
fi

# Configuration
export NODE_ENV=development
export VSCODE_DEV=1
export VSCODE_CLI=1

# Run smoke tests
yarn smoketest --web --headless --verbose --electronArgs=$LINUX_EXTRA_ARGS
if [[ $? -ne 0 ]]; then
	exit_script "Some smoke test are failing"
fi
