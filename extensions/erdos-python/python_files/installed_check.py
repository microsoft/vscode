# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import argparse
import json
import os
import pathlib
import sys
from typing import Dict, List, Optional, Sequence, Tuple, Union

LIB_ROOT = pathlib.Path(__file__).parent / "lib" / "python"
sys.path.insert(0, os.fspath(LIB_ROOT))

import tomli  # noqa: E402
from importlib_metadata import metadata  # noqa: E402
from packaging.requirements import Requirement  # noqa: E402

DEFAULT_SEVERITY = "3"  # 'Hint'
try:
    SEVERITY = int(os.getenv("VSCODE_MISSING_PGK_SEVERITY", DEFAULT_SEVERITY))
except ValueError:
    SEVERITY = int(DEFAULT_SEVERITY)


def parse_args(argv: Optional[Sequence[str]] = None):
    if argv is None:
        argv = sys.argv[1:]
    parser = argparse.ArgumentParser(
        description="Check for installed packages against requirements"
    )
    parser.add_argument("FILEPATH", type=str, help="Path to requirements.[txt, in]")

    return parser.parse_args(argv)


def parse_requirements(line: str) -> Optional[Requirement]:
    try:
        req = Requirement(line.strip("\\"))
        if req.marker is None or req.marker.evaluate():
            return req
    except Exception:
        pass
    return None


def process_requirements(req_file: pathlib.Path) -> List[Dict[str, Union[str, int]]]:
    diagnostics = []
    for n, line in enumerate(req_file.read_text(encoding="utf-8").splitlines()):
        if line.startswith(("#", "-", " ")) or line == "":
            continue

        req = parse_requirements(line)
        if req:
            try:
                # Check if package is installed
                metadata(req.name)
            except Exception:
                diagnostics.append(
                    {
                        "line": n,
                        "character": 0,
                        "endLine": n,
                        "endCharacter": len(req.name),
                        "package": req.name,
                        "code": "not-installed",
                        "severity": SEVERITY,
                    }
                )
    return diagnostics


def get_pos(lines: List[str], text: str) -> Tuple[int, int, int, int]:
    for n, line in enumerate(lines):
        index = line.find(text)
        if index >= 0:
            return n, index, n, index + len(text)
    return (0, 0, 0, 0)


def process_pyproject(req_file: pathlib.Path) -> List[Dict[str, Union[str, int]]]:
    diagnostics = []
    try:
        raw_text = req_file.read_text(encoding="utf-8")
        pyproject = tomli.loads(raw_text)
    except Exception:
        return diagnostics

    lines = raw_text.splitlines()
    reqs = pyproject.get("project", {}).get("dependencies", [])
    for raw_req in reqs:
        req = parse_requirements(raw_req)
        n, start, _, end = get_pos(lines, raw_req)
        if req:
            try:
                # Check if package is installed
                metadata(req.name)
            except Exception:
                diagnostics.append(
                    {
                        "line": n,
                        "character": start,
                        "endLine": n,
                        "endCharacter": end,
                        "package": req.name,
                        "code": "not-installed",
                        "severity": SEVERITY,
                    }
                )
    return diagnostics


def get_diagnostics(req_file: pathlib.Path) -> List[Dict[str, Union[str, int]]]:
    diagnostics = []
    if not req_file.exists():
        return diagnostics

    if req_file.name == "pyproject.toml":
        diagnostics = process_pyproject(req_file)
    else:
        diagnostics = process_requirements(req_file)

    return diagnostics


def main():
    args = parse_args()
    diagnostics = get_diagnostics(pathlib.Path(args.FILEPATH))
    print(json.dumps(diagnostics, ensure_ascii=False))


if __name__ == "__main__":
    main()
