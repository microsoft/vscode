#!/usr/bin/env bash
# Installs npm dependencies for all VS Code extensions that need them
# This ensures all extensions have their node_modules before building

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSIONS_DIR="$(cd "$SCRIPT_DIR/../extensions" && pwd)"

verbose=false
if [ "$1" = "--verbose" ] || [ "$1" = "-v" ]; then
    verbose=true
fi

echo -e "\033[36mInstalling extension dependencies...\033[0m"

extensions_to_install=()

# Find all extensions with package.json that have dependencies but no node_modules
for ext_dir in "$EXTENSIONS_DIR"/*; do
    if [ -d "$ext_dir" ] && [ -f "$ext_dir/package.json" ]; then
        ext_name=$(basename "$ext_dir")
        
        # Check if package.json has dependencies or devDependencies
        has_deps=$(node -e "
            const pkg = require('$ext_dir/package.json');
            console.log(!!(pkg.dependencies || pkg.devDependencies));
        " 2>/dev/null || echo "false")
        
        # Check if node_modules exists
        has_node_modules=false
        if [ -d "$ext_dir/node_modules" ]; then
            has_node_modules=true
        fi
        
        if [ "$has_deps" = "true" ] && [ "$has_node_modules" = "false" ]; then
            extensions_to_install+=("$ext_name")
        fi
    fi
done

if [ ${#extensions_to_install[@]} -eq 0 ]; then
    echo -e "\033[32m✓ All extensions already have dependencies installed\033[0m"
    exit 0
fi

echo -e "\033[33mFound ${#extensions_to_install[@]} extension(s) needing dependencies:\033[0m"
for ext in "${extensions_to_install[@]}"; do
    echo "  - $ext"
done
echo ""

failed=()
succeeded=0

for ext in "${extensions_to_install[@]}"; do
    ext_path="$EXTENSIONS_DIR/$ext"
    
    if [ "$verbose" = true ]; then
        echo -e "\033[36mInstalling $ext...\033[0m"
        (cd "$ext_path" && npm install)
        succeeded=$((succeeded + 1))
    else
        echo -n "Installing $ext..."
        if (cd "$ext_path" && npm install --silent > /dev/null 2>&1); then
            echo -e " \033[32m✓\033[0m"
            succeeded=$((succeeded + 1))
        else
            echo -e " \033[31m✗\033[0m"
            failed+=("$ext")
            echo -e "\033[33mWarning: Failed to install dependencies for $ext\033[0m" >&2
        fi
    fi
done

echo ""
echo -e "\033[36mInstallation complete:\033[0m"
echo -e "  \033[32mSucceeded: $succeeded\033[0m"

if [ ${#failed[@]} -gt 0 ]; then
    echo -e "  \033[31mFailed: ${#failed[@]}\033[0m"
    echo -e "  \033[31mFailed extensions: ${failed[*]}\033[0m"
    exit 1
else
    echo -e "\033[32m✓ All extension dependencies installed successfully\033[0m"
    exit 0
fi
