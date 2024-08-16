#!/bin/bash

# Function to check the operating system
check_os() {
  case "$(uname -s)" in
    Linux*)     os="Linux";;
    Darwin*)    os="Mac";;
    CYGWIN*|MINGW32*|MSYS*|MINGW*) os="Windows";;
    *)          os="Unknown";;
  esac
}

check_os
printf "\n\nDetected operating system: $os\n\n"

# If the OS is Windows, give warning and prompt user to continue
if [ "$os" == "Windows" ]; then
  	echo "This script is for unix systems (mac, linux)"
	echo -e "Symbolic links might not work properly on Windows, please run windows scripts"
	read -n 1 -s -r -p "Press any key to exit or enter to continue..."
	# Check the user's input
  	if [ "$REPLY" != "" ]; then
    	echo -e "\n\e[91mExiting...\e[0m"
    	exit
  	fi
fi


# Function to execute a command and check its status
execute() {
	local cmd=$1
	local failure_message=$2
	echo "Executing: $cmd"
	eval $cmd
	if [ $? -ne 0 ]; then
		echo "Setup | $failure_message"
		exit 1
	fi
}

# Setup all necessary paths for this script
app_dir=$(pwd)
target_path="$app_dir/extensions/pearai-submodule/extensions/vscode"
link_path="$app_dir/extensions/pearai-ref"

# Run the base functionality
echo -e "\nInitializing sub-modules..."

# Check if the submodule directory already exists
if [ -d "$app_dir/extensions/pearai-submodule" ]; then
    echo "Removing existing pearai-submodule directory"
    execute "rm -rf $app_dir/extensions/pearai-submodule" "Failed to remove existing pearai-submodule directory"
fi

# Clone the submodule extension folder
execute "git submodule update --init --recursive" "Failed to initialize git submodules"
execute "git submodule update --recursive --remote" "Failed to update to latest tip of submodule"


# Check if the symbolic link exists
if [ ! -L "$link_path" ]; then
	# Print message about creating a symbolic link from link_path to target_path
	echo -e "\nCreating symbolic link '$link_path' -> '$target_path'"
	# Create the symbolic link
	ln -s "$target_path" "$link_path"
else
	echo -e "\n\e[93mSymbolic link already exists...\e[0m"
fi


execute "cd ./extensions/pearai-submodule" "Failed to change directory to extensions/pearai-submodule"
echo -e "\nSetting the submodule directory to match origin/main's latest changes..."

# Set the current branch to match the latest origin/main branch for the submodule.
execute "git reset origin/main" "Failed to git reset to origin/main"

# Discard any potential changes or merge conflicts in the working directory or staging area,
# ensuring local branch matches remote branch exactly before checking out main
execute "git reset --hard" "Failed to reset --hard"

execute "git checkout main" "Failed to checkout main branch"

execute "git fetch origin" "Failed to fetch latest changes from origin"

# Make sure the submodule has the latest updates
execute "git pull origin main" "Failed to pull latest changes from origin/main"

execute "./scripts/install-and-build.sh" "Failed to install dependencies for the submodule"

# Discard the package.json and package-lock.json version update changes
execute "git reset --hard" "Failed to reset --hard after submodule dependencies install"

execute "cd $app_dir" "Failed to change directory to application root"

echo -e "\nSetting up root application..."
pwd

execute "yarn install" "Failed to install dependencies with yarn"
