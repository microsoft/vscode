# /// script
# requires-python = "==3.9.*"
# dependencies = [
#     "pip<24", # NOTE: pip-tools is not compatible with pip >=24. https://github.com/jazzband/pip-tools/issues/2176
#     "pip-tools",
# ]
# ///
"""
This script generates pinned requirements files for ipykernel.

We bundle ipykernel with Erdos. However, ipykernel depends on pyzmq which is compiled for
specific CPython versions. Bundling the entirety of ipykernel for each supported CPython version
takes up a lot of storage space (~458MB in a local test for CPython >=3.8,<=3.13).

Our solution is to split the requirements into three groups:

1. `py3-requirements.txt` for pure Python >=3.8.
2. `cp3-requirements.txt` for CPython >=3.8.
3. `cpx-requirements.txt` for specific versions of CPython >=3.8,<=3.13.

Each of these requirements files are `pip install`ed into separate directories, which are
selectively added to the user's Python search path based on the current interpreter.
"""

import os
import sys
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Set

from pip._internal.cli.cmdoptions import make_target_python
from pip._internal.req.req_install import InstallRequirement
from pip._vendor.packaging.requirements import Requirement
from piptools.cache import DependencyCache
from piptools.exceptions import NoCandidateFound
from piptools.locations import CACHE_DIR
from piptools.repositories.local import LocalRequirementsRepository
from piptools.repositories.pypi import PyPIRepository
from piptools.resolver import BacktrackingResolver
from piptools.utils import comment, key_from_ireq
from piptools.writer import OutputWriter

_FILE = Path(__file__).absolute().relative_to(Path.cwd())
_COMMAND = f"python {_FILE}" + " ".join(sys.argv[1:])


def main(
    requirement: str,
    python_versions: List[str],
    output_dir: Path,
    max_rounds: int,
    cache_dir: str,
) -> None:
    # TODO: Figure out how to enable pip/piptools debug logs.
    #       The script works for now but might be hard to debug in future without debug logs.

    minimum_python_version = min(
        python_versions, key=lambda x: tuple(map(int, x.split(".")))
    )

    # Create the constraints, as they would usually be parsed from a requirements.in file.
    install_req = InstallRequirement(
        req=Requirement(requirement),
        # The final requirements files will include this string as a comment, for example:
        # '# comes from: python scripts/pip-compile-ipykernel.py'.
        comes_from=_COMMAND,
        user_supplied=True,
    )
    constraints = [install_req]

    # NOTE: If we want to take existing requirements.txt file(s) into account, we need to
    #       set this from the existing file, see piptools.script.compile:cli.
    #       Leaving this out for now since the workflow thus far has been to generate totally new
    #       requirements.txt files each time. It's also not obvious how we'd merge the requirements
    #       files produced by this script.
    existing_constraints = {}

    # Common `pip install` arguments across all of our calls.
    base_pip_args = [
        "--cache-dir",
        cache_dir,
        "--only-binary",
        ":all:",
    ]

    # Resolve the requirements of our main dependency for the minimum supported CPython version.
    resolve_pip_args = [
        *base_pip_args,
        "--implementation",
        "cp",
        "--python-version",
        minimum_python_version,
        "--abi",
        "cp" + minimum_python_version.replace(".", ""),
    ]
    resolver = make_resolver(
        resolve_pip_args, constraints, cache_dir, existing_constraints
    )
    remaining_reqs = resolver.resolve(max_rounds=max_rounds)

    # Split the resolved requirements into the three groups described at the top of the file.
    # First, filter pure Python requirements.
    py3_pip_args = [
        *base_pip_args,
        "--implementation",
        "py",
        "--python-version",
        minimum_python_version,
        "--abi",
        "none",
    ]
    py3_reqs = set(
        filter_compatible_requirements(
            remaining_reqs,
            py3_pip_args,
            existing_constraints=existing_constraints,
            cache_dir=cache_dir,
        )
    )
    remaining_reqs -= py3_reqs

    # Filter requirements for the minimum supported CPython version.
    cp3_pip_args = [
        *base_pip_args,
        "--implementation",
        "cp",
        "--python-version",
        minimum_python_version,
        "--abi",
        "abi3",
    ]
    cp3_reqs = set(
        filter_compatible_requirements(
            remaining_reqs,
            cp3_pip_args,
            existing_constraints=existing_constraints,
            cache_dir=cache_dir,
        )
    )
    remaining_reqs -= cp3_reqs

    # Filter requirements for each supported CPython version.
    # This is more of a check to ensure that the dependency is compatible with all supported versions.
    cpx_pip_args = {
        python_version: [
            *base_pip_args,
            "--implementation",
            "cp",
            "--python-version",
            python_version,
            "--abi",
            "cp" + python_version.replace(".", ""),
        ]
        for python_version in python_versions
    }
    cpx_reqs = set()
    for python_version in python_versions:
        _cpx_reqs = set(
            filter_compatible_requirements(
                remaining_reqs,
                cpx_pip_args[python_version],
                existing_constraints=existing_constraints,
                cache_dir=cache_dir,
            )
        )
        if cpx_reqs and cpx_reqs != _cpx_reqs:
            raise ValueError("Inconsistent cpx_reqs")
        cpx_reqs = _cpx_reqs
    remaining_reqs -= cpx_reqs

    if remaining_reqs:
        raise ValueError(f"Unaccounted for requirements: {remaining_reqs}")

    # Write the requirements.txt files.
    for reqs, pip_args, output_file in [
        (py3_reqs, py3_pip_args, "py3-requirements.txt"),
        (cp3_reqs, cp3_pip_args, "cp3-requirements.txt"),
        (cpx_reqs, cpx_pip_args[minimum_python_version], "cpx-requirements.txt"),
    ]:
        write_output(
            reqs=reqs,
            pip_args=pip_args,
            constraints=constraints,
            output_path=output_dir / output_file,
            cache_dir=cache_dir,
            existing_constraints=existing_constraints,
        )


class CustomRepository(PyPIRepository):
    def __init__(self, pip_args: List[str], cache_dir: str):
        super().__init__(pip_args, cache_dir)

        # Replace _finder with one that takes a TargetPython using the passed options,
        # else it defaults to the current interpreter instead of using pip_args.
        self._target_python = make_target_python(self.options)
        self._finder = self._command._build_package_finder(
            self.options, self.session, self._target_python
        )


class CustomOutputWriter(OutputWriter):
    def write_header(self) -> Iterator[str]:
        # Overridden to include this script in the header.
        if self.emit_header:
            yield comment("#")
            yield comment(
                f"# This file is autogenerated by {_FILE} with Python "
                f"{sys.version_info.major}.{sys.version_info.minor}"
            )
            yield comment("# by the following command:")
            yield comment("#")
            yield comment(f"#    {_COMMAND}")
            yield comment("#")


def make_repository(
    pip_args: List[str],
    cache_dir: str,
    existing_constraints: Dict[str, InstallRequirement],
) -> LocalRequirementsRepository:
    """Helper to create a `LocalRequirementsRepository`."""
    pypi_repository = CustomRepository(pip_args, cache_dir)
    repository = LocalRequirementsRepository(existing_constraints, pypi_repository)  # type: ignore
    return repository


def make_resolver(
    pip_args: List[str],
    constraints: Iterable[InstallRequirement],
    cache_dir: str,
    existing_constraints: Dict[str, InstallRequirement],
) -> BacktrackingResolver:
    """Helper to create a `BacktrackingResolver`."""
    repository = make_repository(pip_args, cache_dir, existing_constraints)
    resolver = BacktrackingResolver(
        constraints=constraints,
        existing_constraints=existing_constraints,
        repository=repository,
        prereleases=repository.finder.allow_all_prereleases,
        cache=DependencyCache(cache_dir),
        clear_caches=False,
        allow_unsafe=False,
        unsafe_packages=set(),
    )
    return resolver


def filter_compatible_requirements(
    install_reqs: Set[InstallRequirement],
    pip_args: List[str],
    existing_constraints: Dict[str, InstallRequirement],
    cache_dir: str,
) -> Iterable[InstallRequirement]:
    """Yield requirements that have an installation candidate that matches the given pip_args."""
    repository = make_repository(pip_args, cache_dir, existing_constraints)
    for req in sorted(install_reqs, key=lambda x: x.name or ""):
        assert req.name
        try:
            repository.find_best_match(
                req, prereleases=repository.finder.allow_all_prereleases
            )
        except NoCandidateFound:
            continue
        yield req


def write_output(
    reqs: Set[InstallRequirement],
    pip_args: List[str],
    constraints: Iterable[InstallRequirement],
    output_path: str,
    cache_dir: str,
    existing_constraints: Dict[str, InstallRequirement],
) -> None:
    """Helper to write a requirements.txt file."""
    resolver = make_resolver(pip_args, constraints, cache_dir, existing_constraints)
    hashes = resolver.resolve_hashes(reqs)
    repository = resolver.repository
    with open(output_path, "w+b") as output_file:
        # This uses hardcoded default values from piptools.script.options for simplicity.
        # We can pass values from the command-line if needed in future.
        writer = CustomOutputWriter(
            output_file,
            # click_ctx was used in OutputWriter.write_header but we've overridden it.
            click_ctx=None,  # type: ignore
            dry_run=False,
            emit_header=True,
            emit_index_url=True,
            emit_trusted_host=True,
            annotate=True,
            annotation_style="split",
            strip_extras=False,
            generate_hashes=True,
            default_index_url=repository.DEFAULT_INDEX_URL,
            index_urls=repository.finder.index_urls,
            trusted_hosts=repository.finder.trusted_hosts,
            format_control=repository.finder.format_control,
            linesep=os.linesep,
            allow_unsafe=False,
            find_links=repository.finder.find_links,
            emit_find_links=True,
            emit_options=True,
        )
        writer.write(
            results=reqs,
            unsafe_packages=resolver.unsafe_packages,
            unsafe_requirements=resolver.unsafe_constraints,
            markers={
                key_from_ireq(ireq): ireq.markers
                for ireq in constraints
                if ireq.markers
            },
            hashes=hashes,
        )


if __name__ == "__main__":
    main(
        requirement="ipykernel",
        python_versions=["3.9", "3.10", "3.11", "3.12", "3.13"],
        output_dir=Path("./python_files/ipykernel_requirements/"),
        max_rounds=10,
        cache_dir=CACHE_DIR,
    )
