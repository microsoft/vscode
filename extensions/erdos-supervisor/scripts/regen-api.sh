# ------------------------------------------------------------
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# ------------------------------------------------------------

# This script regenerates the KernelBridge API client in the Erdos adapter,
# using an updated version of the KernelBridge API definition.

# Ensure that the openapi-generator-cli is installed
if ! command -v openapi-generator &> /dev/null
then
	echo "openapi-generator-cli could not be found. Please install it with 'npm install @openapitools/openapi-generator-cli -g'"
	exit
fi

# Find the directory of this script
SCRIPTDIR=$(cd "$(dirname -- "${BASH_SOURCE[0]}")"; pwd -P)

# Use the kernelbridge.json in the extension root
KERNELBRIDGE_JSON_PATH=$(realpath "${SCRIPTDIR}/../kernelbridge.json")

if [ ! -f "${KERNELBRIDGE_JSON_PATH}" ]; then
	echo "kernelbridge.json API definition not found"
	exit
fi

# Enter the directory of the KernelBridge client source code and generate the API client
pushd "${SCRIPTDIR}/../src/kcclient"

# Generate the API client
openapi-generator generate -i "${KERNELBRIDGE_JSON_PATH}" -g typescript-node

# Update copyright headers
find . -name "*.ts" -exec sed -i '' 's/founders@lotas\.ai/founders@lotas\.ai/g' {} \;
find . -name "*.ts" -exec sed -i '' '1,15s/\* Contact: founders@lotas\.ai/\* Copyright (C) 2025 Lotas Inc. All rights reserved./g' {} \;

# Return to the original directory
popd
