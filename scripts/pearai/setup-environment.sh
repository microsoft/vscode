#!/bin/bash

# Function to execute a command and check its status
execute() {
	local cmd=$1
	local failure_message=$2

	$cmd
	if [ $? -ne 0 ]; then
		echo "Setup | $failure_message"
		exit 1
	fi
}

# Setup all necessary paths for this script
app_dir=$(pwd)
target_path="$app_dir/extensions/pearai-submodule/extensions/vscode"
link_path="$app_dir/extensions/pearai-ref"

# Check if the symbolic link exists
if [ ! -L "$link_path" ]; then
	echo -e "\nCreating symbolic link 'extensions/pearai-submodule/extensions/vscode' -> 'extensions/pearai-ref'"

	# Create the symbolic link
	ln -s "$target_path" "$link_path"
fi

# Run the base functionality
echo -e "\nInitializing sub-modules..."
execute "git submodule update --init --recursive" "Failed to initialize git submodules"

execute "cd ./extensions/pearai-submodule" "Failed to change directory to extensions/pearai-submodule"

execute "git fetch origin" "Failed to fetch latest changes from origin"

execute "git pull origin main" "Failed to pull latest changes from origin/main"

execute "git checkout main" "Failed to checkout main branch"

execute "./scripts/install-dependencies.sh" "Failed to install dependencies for the submodule"

execute "cd $app_dir" "Failed to change directory to application root"

echo -e "\nSetting up root application..."
pwd

execute "yarn install" "Failed to install dependencies with yarn"
