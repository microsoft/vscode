#!/bin/bash
#
# Script to build VSCode RPM package from source
# This script handles modifying the dependency check to allow new dependencies

set -e  # Exit on any error

# Set proper umask for RPM building (0022 = files:644, dirs:755)
umask 0022

# Display step information
info() {
	echo -e "\033[1;34m[INFO]\033[0m $1"
}

# Display errors
error() {
	echo -e "\033[1;31m[ERROR]\033[0m $1"
	exit 1
}

# Check required tools
check_dependencies() {
	info "Checking for required tools..."

	# Check for git
	if ! command -v git &> /dev/null; then
		error "Git is required but not installed. Please install git and try again."
	fi

	# Check for npm
	if ! command -v npm &> /dev/null; then
		error "npm is required but not installed. Please install nodejs and npm and try again."
	fi

	# Check for node
	if ! command -v node &> /dev/null; then
		error "node is required but not installed. Please install nodejs and try again."
	fi

	# Check for rpmbuild
	if ! command -v rpmbuild &> /dev/null; then
		error "rpmbuild is required but not installed. Please install rpm-build package and try again."
	fi

	# Check for tsc (TypeScript compiler)
	if ! command -v tsc &> /dev/null && ! command -v npx &> /dev/null; then
		error "TypeScript compiler (tsc) or npx is required but not installed. Please install typescript."
	fi
}

# Modify the dependencies generator to disable failure on new dependencies
modify_deps_generator() {
	info "Modifying dependencies generator to allow new dependencies..."

	# Path to dependencies generator TypeScript file
	DEPS_GENERATOR="build/linux/dependencies-generator.ts"

	if [ ! -f "$DEPS_GENERATOR" ]; then
		error "Dependencies generator file not found at $DEPS_GENERATOR"
	fi

	# Replace the FAIL_BUILD_FOR_NEW_DEPENDENCIES flag from true to false
	# Using sed to modify the file in place
	if [[ "$OSTYPE" == "darwin"* ]]; then
		# macOS requires an empty string for -i
		sed -i '' 's/const FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = true;/const FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = false;/' "$DEPS_GENERATOR"
	else
		# Linux/Unix
		sed -i 's/const FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = true;/const FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = false;/' "$DEPS_GENERATOR"
	fi

	info "Dependencies generator modified successfully."
}

# Install npm dependencies
install_dependencies() {
	info "Installing npm dependencies..."
	npm ci || npm install
}

# Compile TypeScript files
compile_typescript() {
	info "Compiling TypeScript files..."
	npx tsc --build ./build/tsconfig.build.json
}

# Compile the project
compile_project() {
	info "Compiling VSCode..."
	npm run compile
}


# Build Linux client
build_linux_client() {
	info "Building Linux client..."
	npm run gulp vscode-linux-x64-min-ci
}

# Prepare RPM package
prepare_rpm() {
	info "Preparing RPM package..."
	npm run gulp vscode-linux-x64-prepare-rpm
}

# Build RPM package
build_rpm() {
	info "Building RPM package..."
	npm run gulp vscode-linux-x64-build-rpm
}

# Copy RPM to the current directory
copy_rpm() {
	info "Copying RPM to current directory..."
	mkdir -p ./dist
	find .build/linux/rpm -name "*.rpm" -type f -exec cp {} ./dist/ \;

	RPMS=$(find ./dist -name "*.rpm" | wc -l)
	if [ "$RPMS" -gt 0 ]; then
		info "RPM packages have been copied to ./dist directory"
		ls -latr ./dist/*.rpm
	else
		error "No RPM packages were found"
	fi
}

# Main function to run the build process
main() {
	info "Starting VSCode RPM build process..."

	# Set proper umask for RPM building (0022 = files:644, dirs:755)
	umask 0022

	check_dependencies
	modify_deps_generator
	install_dependencies
	compile_typescript
	compile_project
	build_linux_client
	prepare_rpm
	build_rpm
	copy_rpm

	info "VSCode RPM build completed successfully!"
}

# Execute main function
main "$@"
