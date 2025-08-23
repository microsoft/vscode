# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import datetime
import json

import freezegun
import pytest
import update_ext_version


CURRENT_YEAR = datetime.datetime.now().year
TEST_DATETIME = f"{CURRENT_YEAR}-03-14 01:23:45"

# The build ID is calculated via:
#     "1" + datetime.datetime.strptime(TEST_DATETIME,"%Y-%m-%d %H:%M:%S").strftime('%j%H%M')
EXPECTED_BUILD_ID = "10730123"


def create_package_json(directory, version):
    """Create `package.json` in `directory` with a specified version of `version`."""
    package_json = directory / "package.json"
    package_json.write_text(json.dumps({"version": version}), encoding="utf-8")
    return package_json


def run_test(tmp_path, version, args, expected):
    package_json = create_package_json(tmp_path, version)
    update_ext_version.main(package_json, args)
    package = json.loads(package_json.read_text(encoding="utf-8"))
    assert expected == update_ext_version.parse_version(package["version"])


@pytest.mark.parametrize(
    "version, args",
    [
        ("2000.1.0", []),  # Wrong year for CalVer
        (f"{CURRENT_YEAR}.0.0-rc", []),
        (f"{CURRENT_YEAR}.1.0-rc", ["--release"]),
        (f"{CURRENT_YEAR}.0.0-rc", ["--release", "--build-id", "-1"]),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release", "--for-publishing", "--build-id", "-1"],
        ),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release", "--for-publishing", "--build-id", "999999999999"],
        ),
        (f"{CURRENT_YEAR}.1.0-rc", ["--build-id", "-1"]),
        (f"{CURRENT_YEAR}.1.0-rc", ["--for-publishing", "--build-id", "-1"]),
        (f"{CURRENT_YEAR}.1.0-rc", ["--for-publishing", "--build-id", "999999999999"]),
    ],
)
def test_invalid_args(tmp_path, version, args):
    with pytest.raises(ValueError):
        run_test(tmp_path, version, args, None)


@pytest.mark.parametrize(
    "version, args, expected",
    [
        (
            f"{CURRENT_YEAR}.1.0-rc",
            ["--build-id", "12345"],
            (f"{CURRENT_YEAR}", "1", "12345", "rc"),
        ),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release", "--build-id", "12345"],
            (f"{CURRENT_YEAR}", "0", "12345", ""),
        ),
        (
            f"{CURRENT_YEAR}.1.0-rc",
            ["--for-publishing", "--build-id", "12345"],
            (f"{CURRENT_YEAR}", "1", "12345", ""),
        ),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release", "--for-publishing", "--build-id", "12345"],
            (f"{CURRENT_YEAR}", "0", "12345", ""),
        ),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release", "--build-id", "999999999999"],
            (f"{CURRENT_YEAR}", "0", "999999999999", ""),
        ),
        (
            f"{CURRENT_YEAR}.1.0-rc",
            ["--build-id", "999999999999"],
            (f"{CURRENT_YEAR}", "1", "999999999999", "rc"),
        ),
        (
            f"{CURRENT_YEAR}.1.0-rc",
            [],
            (f"{CURRENT_YEAR}", "1", EXPECTED_BUILD_ID, "rc"),
        ),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release"],
            (f"{CURRENT_YEAR}", "0", "0", ""),
        ),
        (
            f"{CURRENT_YEAR}.1.0-rc",
            ["--for-publishing"],
            (f"{CURRENT_YEAR}", "1", EXPECTED_BUILD_ID, ""),
        ),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release", "--for-publishing"],
            (f"{CURRENT_YEAR}", "0", "0", ""),
        ),
        (
            f"{CURRENT_YEAR}.0.0-rc",
            ["--release"],
            (f"{CURRENT_YEAR}", "0", "0", ""),
        ),
        (
            f"{CURRENT_YEAR}.1.0-rc",
            [],
            (f"{CURRENT_YEAR}", "1", EXPECTED_BUILD_ID, "rc"),
        ),
    ],
)
@freezegun.freeze_time(f"{CURRENT_YEAR}-03-14 01:23:45")
def test_update_ext_version(tmp_path, version, args, expected):
    run_test(tmp_path, version, args, expected)
