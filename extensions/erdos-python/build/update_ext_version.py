# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import datetime
import json
import pathlib
import sys
from typing import Sequence, Tuple, Union

EXT_ROOT = pathlib.Path(__file__).parent.parent
PACKAGE_JSON_PATH = EXT_ROOT / "package.json"


def build_arg_parse() -> argparse.ArgumentParser:
    """Builds the arguments parser."""
    parser = argparse.ArgumentParser(
        description="This script updates the python extension micro version based on the release or pre-release channel."
    )
    parser.add_argument(
        "--release",
        action="store_true",
        help="Treats the current build as a release build.",
    )
    parser.add_argument(
        "--build-id",
        action="store",
        type=int,
        default=None,
        help="If present, will be used as a micro version.",
        required=False,
    )
    parser.add_argument(
        "--for-publishing",
        action="store_true",
        help="Removes `-dev` or `-rc` suffix.",
    )
    return parser


def is_even(v: Union[int, str]) -> bool:
    """Returns True if `v` is even."""
    return not int(v) % 2


def micro_build_number() -> str:
    """Generates the micro build number.
    The format is `1<Julian day><hour><minute>`.
    """
    return f"1{datetime.datetime.now(tz=datetime.timezone.utc).strftime('%j%H%M')}"


def parse_version(version: str) -> Tuple[str, str, str, str]:
    """Parse a version string into a tuple of version parts."""
    major, minor, parts = version.split(".", maxsplit=2)
    try:
        micro, suffix = parts.split("-", maxsplit=1)
    except ValueError:
        micro = parts
        suffix = ""
    return major, minor, micro, suffix


def main(package_json: pathlib.Path, argv: Sequence[str]) -> None:
    parser = build_arg_parse()
    args = parser.parse_args(argv)

    package = json.loads(package_json.read_text(encoding="utf-8"))

    major, minor, micro, suffix = parse_version(package["version"])

    current_year = datetime.datetime.now().year
    current_month = datetime.datetime.now().month
    int_major = int(major)
    valid_major = (
        int_major
        == current_year  # Between JAN-DEC major version should be current year
        or (
            int_major == current_year - 1 and current_month == 1
        )  # After new years the check is relaxed for JAN to allow releases of previous year DEC
        or (
            int_major == current_year + 1 and current_month == 12
        )  # Before new years the check is relaxed for DEC to allow pre-releases of next year JAN
    )
    if not valid_major:
        raise ValueError(
            f"Major version [{major}] must be the current year [{current_year}].",
            f"If changing major version after new year's, change to {current_year}.1.0",
            "Minor version must be updated based on release or pre-release channel.",
        )

    if args.release and not is_even(minor):
        raise ValueError(
            f"Release version should have EVEN numbered minor version: {package['version']}"
        )
    elif not args.release and is_even(minor):
        raise ValueError(
            f"Pre-Release version should have ODD numbered minor version: {package['version']}"
        )

    print(f"Updating build FROM: {package['version']}")
    if args.build_id:
        # If build id is provided it should fall within the 0-INT32 max range
        # that the max allowed value for publishing to the Marketplace.
        if args.build_id < 0 or (args.for_publishing and args.build_id > ((2**32) - 1)):
            raise ValueError(f"Build ID must be within [0, {(2**32) - 1}]")

        package["version"] = ".".join((major, minor, str(args.build_id)))
    elif args.release:
        package["version"] = ".".join((major, minor, micro))
    else:
        # micro version only updated for pre-release.
        package["version"] = ".".join((major, minor, micro_build_number()))

    if not args.for_publishing and not args.release and len(suffix):
        package["version"] += "-" + suffix
    print(f"Updating build TO: {package['version']}")

    # Overwrite package.json with new data add a new-line at the end of the file.
    package_json.write_text(
        json.dumps(package, indent=4, ensure_ascii=False) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main(PACKAGE_JSON_PATH, sys.argv[1:])
