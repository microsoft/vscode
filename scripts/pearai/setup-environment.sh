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
echo -e "\n========================================="
echo "Starting PearAI Environment Setup"
echo "========================================="
echo "1. Cleaning up existing installations"
echo "2. Initializing submodules"
echo "3. Setting up symbolic links"
echo "4. Configuring pearai-submodule"
echo "5. Configuring PearAI-Roo-Code"
echo "6. Installing dependencies"
echo -e "=========================================\n"

echo "Step 1/6: Cleaning up existing installations..."

# Clean up any existing installations
echo "Cleaning up any existing installations..."

# Clean up pearai-submodule
# Clean up pearai-submodule if it exists
if [ -d "$app_dir/extensions/pearai-submodule" ]; then
    echo "Cleaning up existing pearai-submodule..."
    if git config --file .gitmodules --get-regexp '^submodule\..*pearai-submodule' > /dev/null 2>&1; then
        echo "Removing submodule configuration..."
        git submodule deinit -f ./extensions/pearai-submodule 2>/dev/null || true
        rm -rf .git/modules/extensions/pearai-submodule 2>/dev/null || true
        git rm -f ./extensions/pearai-submodule 2>/dev/null || true
    fi
    rm -rf "$app_dir/extensions/pearai-submodule"
    echo "Successfully removed pearai-submodule"
fi

# Clean up PearAI-Roo-Code if it exists
if [ -d "$app_dir/extensions/PearAI-Roo-Code" ]; then
    echo "Cleaning up existing PearAI-Roo-Code..."
    if git config --file .gitmodules --get-regexp '^submodule\..*PearAI-Roo-Code' > /dev/null 2>&1; then
        echo "Removing submodule configuration..."
        git submodule deinit -f ./extensions/PearAI-Roo-Code 2>/dev/null || true
        rm -rf .git/modules/extensions/PearAI-Roo-Code 2>/dev/null || true
        git rm -f ./extensions/PearAI-Roo-Code 2>/dev/null || true
    fi
    rm -rf "$app_dir/extensions/PearAI-Roo-Code"
    echo "Successfully removed PearAI-Roo-Code"
fi

echo -e "\nStep 2/6: Initializing submodules..."
# Clone the submodule extension folder
execute "git submodule update --init --recursive" "Failed to initialize git submodules"
execute "git submodule update --recursive --remote" "Failed to update to latest tip of submodule"

echo -e "\nStep 3/6: Setting up symbolic links..."
# Handle symbolic link creation/update
echo -e "\nChecking symbolic link..."
if [ -L "$link_path" ]; then
    echo -e "\e[93mRemoving existing symbolic link...\e[0m"
    rm "$link_path"
fi

# Ensure target directory exists before creating symlink
if [ ! -d "$target_path" ]; then
    echo "Warning: Target path '$target_path' does not exist yet."
    echo "Symbolic link will be created once the submodule is properly initialized."
else
    echo -e "Creating symbolic link '$link_path' -> '$target_path'"
    ln -s "$target_path" "$link_path"
fi


# Verify submodule directory exists after initialization
if [ ! -d "./extensions/pearai-submodule" ]; then
    echo "Error: pearai-submodule directory not found after git submodule initialization"
    echo "Attempting to fix by re-running submodule commands..."
    execute "git submodule update --init --recursive" "Failed to re-initialize git submodules"
    execute "git submodule update --recursive --remote" "Failed to re-update submodules"

    if [ ! -d "./extensions/pearai-submodule" ]; then
        echo "Submodule commands failed. Attempting direct clone as fallback..."

        # Try cleanup but don't exit on failure
        echo "Attempting to clean up any existing configuration (errors will be ignored)..."
        git submodule deinit -f ./extensions/pearai-submodule 2>/dev/null || true
        rm -rf .git/modules/extensions/pearai-submodule 2>/dev/null || true
        git rm -f ./extensions/pearai-submodule 2>/dev/null || true

        # Ensure the directory is removed if it exists
        rm -rf "./extensions/pearai-submodule" 2>/dev/null || true

        echo "Attempting direct clone from repository..."
        # Direct clone as fallback - this is the critical step
        if git clone https://github.com/trypear/pearai-submodule.git ./extensions/pearai-submodule; then
            echo "Successfully cloned pearai-submodule directly."
        else
            echo "Error: Failed to clone pearai-submodule repository."
            echo "Please check your internet connection and git configuration."
            exit 1
        fi
    fi
fi

echo -e "\nStep 4/6: Configuring pearai-submodule..."
# Change directory and continue with submodule setup
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

echo -e "\nStep 5/6: Configuring PearAI-Roo-Code..."
# ROO CODE
# Verify PearAI-Roo-Code directory exists
if [ ! -d "../PearAI-Roo-Code" ]; then
    echo "Error: PearAI-Roo-Code directory not found"
    echo "Attempting to fix by re-running submodule commands..."
    cd "$app_dir"
    execute "git submodule update --init --recursive" "Failed to re-initialize git submodules"
    execute "git submodule update --recursive --remote" "Failed to re-update submodules"

    if [ ! -d "./extensions/PearAI-Roo-Code" ]; then
        echo "Submodule commands failed. Attempting direct clone as fallback..."

        # Clean up any potential submodule configuration if it exists
        if git config --file .gitmodules --get-regexp '^submodule\..*PearAI-Roo-Code' > /dev/null 2>&1; then
            echo "Cleaning up existing submodule configuration..."
            git submodule deinit -f ./extensions/PearAI-Roo-Code 2>/dev/null || true
            rm -rf .git/modules/extensions/PearAI-Roo-Code 2>/dev/null || true
            git rm -f ./extensions/PearAI-Roo-Code 2>/dev/null || true
        fi

        echo "Attempting direct clone from repository..."
        # Direct clone as fallback
        if git clone https://github.com/trypear/PearAI-Roo-Code.git ./extensions/PearAI-Roo-Code; then
            echo "Successfully cloned PearAI-Roo-Code directly."
        else
            echo "Error: Failed to clone PearAI-Roo-Code repository."
            echo "Please check your internet connection and git configuration."
            exit 1
        fi
    fi
    execute "cd ./extensions/pearai-submodule" "Failed to return to pearai-submodule directory"
fi

execute "cd ../PearAI-Roo-Code" "Failed to change directory to extensions/PearAI-Roo-Code"
# Discard any potential changes or merge conflicts in the working directory or staging area,
# ensuring local branch matches remote branch exactly before checking out main
execute "git reset --hard" "Failed to reset --hard"
execute "git checkout main" "Failed to checkout main branch"
execute "git fetch origin" "Failed to fetch latest changes from origin"
# Make sure the submodule has the latest updates
execute "git pull origin main" "Failed to pull latest changes from origin/main"
execute "npm run install:all" "Failed to install dependencies for the PearAI-Roo-Code"
execute "npm run build" "Failed to build the PearAI-Roo-Code"

# Ensure we return to the app directory for final setup
if ! cd "$app_dir"; then
    echo "Error: Failed to return to application root directory"
    exit 1
fi

echo -e "\nStep 6/6: Setting up root application..."
pwd

# Final npm install in app directory
execute "npm install" "Failed to install dependencies with npm"

echo -e "\n========================================="
echo "🎉 PearAI Environment Setup Complete! 🎉"
echo "========================================="
