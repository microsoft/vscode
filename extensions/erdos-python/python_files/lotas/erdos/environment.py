#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

from __future__ import annotations

import contextlib
import logging
import subprocess
import sys
from typing import TYPE_CHECKING, Any

from .environment_comm import (
    EnvironmentBackendMessageContent,
    EnvironmentFrontendEvent,
    InstallPackageRequest,
    InstallResult,
    ListPackagesRequest,
    PackageInfo,
    PackagesChangedParams,
    PackagesChangedPackageType,
    UninstallPackageRequest,
    UninstallResult,
)
from .erdos_comm import CommMessage, ErdosComm
from .utils import JsonRecord

if TYPE_CHECKING:
    from comm.base_comm import BaseComm

logger = logging.getLogger(__name__)


class EnvironmentService:
    """Manages Python package information and installation/uninstallation."""

    def __init__(self):
        self._comm: ErdosComm | None = None

    def on_comm_open(self, comm: BaseComm, _msg: JsonRecord) -> None:
        self._comm = ErdosComm(comm)
        self._comm.on_msg(self.handle_msg, EnvironmentBackendMessageContent)

    def handle_msg(self, msg: CommMessage[EnvironmentBackendMessageContent], _raw_msg: JsonRecord) -> None:
        """Handle messages received from the client via the erdos.environment comm."""
        request = msg.content.data

        if isinstance(request, ListPackagesRequest):
            if self._comm is not None:
                packages = self._list_packages(request.params.package_type.value)
                self._comm.send_result(data=packages)

        elif isinstance(request, InstallPackageRequest):
            if self._comm is not None:
                result = self._install_package(request.params.package_name, request.params.package_type.value)
                self._comm.send_result(data=result.dict())

        elif isinstance(request, UninstallPackageRequest):
            if self._comm is not None:
                result = self._uninstall_package(request.params.package_name, request.params.package_type.value)
                self._comm.send_result(data=result.dict())

        else:
            logger.warning(f"Unhandled request: {request}")

    def shutdown(self) -> None:
        if self._comm is not None:
            with contextlib.suppress(Exception):
                self._comm.close()

    def _list_packages(self, package_type: str) -> list[dict[str, Any]]:
        """List installed packages."""
        if package_type == "python":
            return self._list_python_packages()
        elif package_type == "r":
            # This is a Python runtime, so we can't list R packages
            logger.warning("R package listing not supported in Python runtime")
            return []
        else:
            logger.error(f"Unknown package type: {package_type}")
            return []

    def _list_python_packages(self) -> list[dict[str, Any]]:
        """List installed Python packages using pip list."""
        try:
            # Use pip list to get package information
            result = subprocess.run(
                [sys.executable, "-m", "pip", "list", "--format=json"],
                capture_output=True,
                text=True,
                check=True
            )
            
            import json
            packages_data = json.loads(result.stdout)
            
            packages = []
            for pkg_data in packages_data:
                # Get additional package information
                package_info = self._get_package_info(pkg_data["name"])
                
                packages.append({
                    "name": pkg_data["name"],
                    "version": pkg_data["version"],
                    "description": package_info.get("summary"),
                    "location": package_info.get("location"),
                    "is_loaded": None,  # Not applicable for Python
                    "priority": None,   # Not applicable for Python
                    "editable": package_info.get("editable", False),
                })
            
            return packages
        except Exception as e:
            logger.error(f"Failed to list Python packages: {e}")
            return []

    def _get_package_info(self, package_name: str) -> dict[str, Any]:
        """Get detailed information about a Python package."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "show", package_name],
                capture_output=True,
                text=True,
                check=True
            )
            
            info = {}
            for line in result.stdout.split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    info[key.strip().lower()] = value.strip()
            
            # Check if package is editable
            info["editable"] = "-e" in info.get("location", "")
            
            return info
        except Exception:
            return {}

    def _install_package(self, package_name: str, package_type: str) -> InstallResult:
        """Install a package."""
        if package_type == "python":
            return self._install_python_package(package_name)
        elif package_type == "r":
            return InstallResult(
                success=False,
                error="R package installation not supported in Python runtime"
            )
        else:
            return InstallResult(
                success=False,
                error=f"Unknown package type: {package_type}"
            )

    def _install_python_package(self, package_name: str) -> InstallResult:
        """Install a Python package using pip."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", package_name],
                capture_output=True,
                text=True,
                check=True
            )
            
            # Notify frontend that packages have changed
            self._notify_packages_changed(PackagesChangedPackageType.Python)
            
            return InstallResult(success=True, error=None)
        except subprocess.CalledProcessError as e:
            error_msg = f"Failed to install Python package {package_name}: {e.stderr}"
            logger.error(error_msg)
            return InstallResult(success=False, error=error_msg)
        except Exception as e:
            error_msg = f"Failed to install Python package {package_name}: {str(e)}"
            logger.error(error_msg)
            return InstallResult(success=False, error=error_msg)

    def _uninstall_package(self, package_name: str, package_type: str) -> UninstallResult:
        """Uninstall a package."""
        if package_type == "python":
            return self._uninstall_python_package(package_name)
        elif package_type == "r":
            return UninstallResult(
                success=False,
                error="R package uninstallation not supported in Python runtime"
            )
        else:
            return UninstallResult(
                success=False,
                error=f"Unknown package type: {package_type}"
            )

    def _uninstall_python_package(self, package_name: str) -> UninstallResult:
        """Uninstall a Python package using pip."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "uninstall", "-y", package_name],
                capture_output=True,
                text=True,
                check=True
            )
            
            # Notify frontend that packages have changed
            self._notify_packages_changed(PackagesChangedPackageType.Python)
            
            return UninstallResult(success=True, error=None)
        except subprocess.CalledProcessError as e:
            error_msg = f"Failed to uninstall Python package {package_name}: {e.stderr}"
            logger.error(error_msg)
            return UninstallResult(success=False, error=error_msg)
        except Exception as e:
            error_msg = f"Failed to uninstall Python package {package_name}: {str(e)}"
            logger.error(error_msg)
            return UninstallResult(success=False, error=error_msg)

    def _notify_packages_changed(self, package_type: PackagesChangedPackageType) -> None:
        """Notify the frontend that packages have changed."""
        if self._comm is not None:
            params = PackagesChangedParams(package_type=package_type)
            self._comm.send_event(
                name=EnvironmentFrontendEvent.PackagesChanged.value,
                payload=params.dict()
            )

