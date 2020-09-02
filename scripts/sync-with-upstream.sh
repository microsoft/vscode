#!/usr/bin/env bash

echo "Syncing gitpod code with upstream"

upstream_url="https://github.com/microsoft/vscode.git"
upstream_branch=${1:-"upstream/main"}
local_branch=${2:-"gp-code/main"}
base_commit_msg=${3:-"gitpod server initial commit"}

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
