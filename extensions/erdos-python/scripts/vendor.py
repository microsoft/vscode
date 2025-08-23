#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional


def main() -> None:
    destination = Path("python_files/erdos/erdos/_vendor/")

    namespace = "erdos.erdos._vendor"

    requirements_file = Path("python_files/erdos_requirements/requirements.txt")

    patches_dir = Path("scripts/patches")

    substitutions = [
        {
            "match": r"\('pygments\.lexers\.",
            "replace": r"('erdos.erdos._vendor.pygments.lexers.",
        }
    ]

    print("Clean existing libraries")
    if destination.exists():
        for item in destination.iterdir():
            if item.is_dir() and not item.is_symlink():
                shutil.rmtree(item)
            else:
                item.unlink()

    print("Download vendored libraries")
    run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "-t",
            str(destination),
            "--no-cache-dir",
            "--implementation",
            "py",
            "--no-deps",
            "--require-hashes",
            "--only-binary",
            ":all:",
            "-r",
            str(requirements_file),
        ],
    )

    vendored_libs = detect_vendored_libs(destination)

    if patches_dir:
        print("Apply patches")
        for patch_file in patches_dir.glob("*.patch"):
            run(
                [
                    "git",
                    "apply",
                    "--ignore-whitespace",
                    "--verbose",
                    str(patch_file),
                ],
            )

    print("Rewrite imports")
    rewrite_imports(
        destination,
        namespace,
        vendored_libs,
        substitutions,
    )


class VendoringError(Exception):
    pass


def run(args: List[str], cwd: Optional[str] = None) -> None:
    cmd = " ".join(map(shlex.quote, args))
    print(f"Running {cmd}")
    p = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        cwd=cwd,
    )
    assert p.stdout
    while True:
        retcode = p.poll()
        line = p.stdout.readline().rstrip()

        if line:
            print(line)

        if retcode is not None:
            break
    if retcode:
        raise VendoringError(f"Command exited with non-zero exit code: {retcode}")


def detect_vendored_libs(destination: Path) -> List[str]:
    vendored_libs = []
    for item in destination.iterdir():
        if item.is_dir():
            vendored_libs.append(item.name)
        else:
            if not item.name.endswith(".py"):
                print(f"Got unexpected non-Python file: {item}")
                continue
            vendored_libs.append(item.name[:-3])
    return vendored_libs


def rewrite_imports(
    destination: Path,
    namespace: str,
    vendored_libs: List[str],
    substitutions: List[Dict[str, str]],
) -> None:
    for item in destination.iterdir():
        if item.is_dir():
            rewrite_imports(item, namespace, vendored_libs, substitutions)
        elif item.name.endswith(".py"):
            rewrite_file_imports(item, namespace, vendored_libs, substitutions)


def rewrite_file_imports(
    item: Path,
    namespace: str,
    vendored_libs: List[str],
    substitutions: List[Dict[str, str]],
) -> None:
    text = item.read_text(encoding="utf-8")

    for di in substitutions:
        pattern, substitution = di["match"], di["replace"]
        text = re.sub(pattern, substitution, text)

    if namespace != "":
        for lib in vendored_libs:
            text = re.sub(
                rf"^(\s*)import {lib}(\s|$)",
                rf"\1from {namespace} import {lib}\2",
                text,
                flags=re.MULTILINE,
            )
            text = re.sub(
                rf"^(\s*)import {lib}(\.\S+)(?=\s+as)",
                rf"\1import {namespace}.{lib}\2",
                text,
                flags=re.MULTILINE,
            )

            match = re.search(
                rf"^\s*(import {lib}\.\S+)",
                text,
                flags=re.MULTILINE,
            )
            if match:
                line_number = text.count("\n", 0, match.start()) + 1
                raise VendoringError(
                    "Encountered import that cannot be transformed for a namespace.\n"
                    f'File "{item}", line {line_number}\n'
                    f"  {match.group(1)}\n"
                    "\n"
                    "You will need to add a patch, that adapts the code to avoid a "
                    "`import dotted.name` style import here; since those cannot be "
                    "transformed for importing via a namespace."
                )

            text = re.sub(
                rf"^(\s*)from {lib}(\.|\s)",
                rf"\1from {namespace}.{lib}\2",
                text,
                flags=re.MULTILINE,
            )

    item.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()




















