# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import json
import pathlib

EXT_ROOT = pathlib.Path(__file__).parent.parent
PACKAGE_JSON_PATH = EXT_ROOT / "package.json"


def main(package_json: pathlib.Path) -> None:
    package = json.loads(package_json.read_text(encoding="utf-8"))
    package["enableTelemetry"] = True

    # Overwrite package.json with new data add a new-line at the end of the file.
    package_json.write_text(
        json.dumps(package, indent=4, ensure_ascii=False) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main(PACKAGE_JSON_PATH)
