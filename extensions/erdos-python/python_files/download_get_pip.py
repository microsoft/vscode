# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import json
import pathlib
import urllib.request as url_lib

from packaging.version import parse as version_parser

EXTENSION_ROOT = pathlib.Path(__file__).parent.parent
GET_PIP_DEST = EXTENSION_ROOT / "python_files"
PIP_PACKAGE = "pip"
PIP_VERSION = "latest"  # Can be "latest", or specific version "23.1.2"


def _get_package_data():
    json_uri = f"https://pypi.org/pypi/{PIP_PACKAGE}/json"
    # Response format: https://warehouse.readthedocs.io/api-reference/json/#project
    # Release metadata format: https://github.com/pypa/interoperability-peps/blob/master/pep-0426-core-metadata.rst
    with url_lib.urlopen(json_uri) as response:
        return json.loads(response.read())


def _download_and_save(root, version):
    root = pathlib.Path.cwd() if root is None or root == "." else pathlib.Path(root)
    url = f"https://raw.githubusercontent.com/pypa/get-pip/{version}/public/get-pip.py"
    print(url)
    with url_lib.urlopen(url) as response:
        data = response.read()
        get_pip_file = root / "get-pip.py"
        get_pip_file.write_bytes(data)


def main(root):
    data = _get_package_data()

    if PIP_VERSION == "latest":
        # Pick latest 5 versions to try and get-pip
        sorted_versions = sorted(data["releases"].keys(), key=version_parser, reverse=True)[:5]
        downloaded = False
        while sorted_versions:
            use_version = sorted_versions.pop(0)
            try:
                print(f"Trying version: get-pip == {use_version}")
                _download_and_save(root, use_version)
                downloaded = True
                break
            except Exception as e:
                print(f"Failed to download get-pip == {use_version}: {e}")
                print(f"NExt attempt(s) with versions: {sorted_versions}")
        if not downloaded:
            raise Exception("Failed to download get-pip.py")
    else:
        use_version = PIP_VERSION
        _download_and_save(root, use_version)


if __name__ == "__main__":
    main(GET_PIP_DEST)
