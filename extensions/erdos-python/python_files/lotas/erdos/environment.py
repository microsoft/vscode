#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

from __future__ import annotations

import contextlib
import logging
import os
import subprocess
import sys
from typing import TYPE_CHECKING, Any, List

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
        # Store active comm channels by comm_id to respond on correct channel
        self._comms: dict[str, ErdosComm] = {}

    def on_comm_open(self, comm: BaseComm, _msg: JsonRecord) -> None:
        erdos_comm = ErdosComm(comm)
        self._comms[comm.comm_id] = erdos_comm
        erdos_comm.on_msg(lambda msg, raw_msg: self.handle_msg(msg, raw_msg, erdos_comm), EnvironmentBackendMessageContent)

    def handle_msg(self, msg: CommMessage[EnvironmentBackendMessageContent], _raw_msg: JsonRecord, comm: ErdosComm) -> None:
        """Handle messages received from the client via the erdos.environment comm."""
        request = msg.content.data

        if isinstance(request, ListPackagesRequest):
            packages = self._list_packages(request.params.package_type.value)
            comm.send_result(data=packages)

        elif isinstance(request, InstallPackageRequest):
            result = self._install_package(
                request.params.package_name, 
                request.params.package_type.value,
                request.params.environment_type
            )
            comm.send_result(data=result.dict())

        elif isinstance(request, UninstallPackageRequest):
            result = self._uninstall_package(
                request.params.package_name, 
                request.params.package_type.value,
                request.params.environment_type
            )
            comm.send_result(data=result.dict())

        else:
            logger.warning(f"Unhandled request: {request}")

    def shutdown(self) -> None:
        for comm in self._comms.values():
            with contextlib.suppress(Exception):
                comm.close()
        self._comms.clear()

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
            for i, pkg_data in enumerate(packages_data):
                packages.append({
                    "name": pkg_data["name"],
                    "version": pkg_data["version"],
                    "description": None,  # Not available from pip list
                    "location": None,     # Not available from pip list
                    "is_loaded": None,    # Not applicable for Python
                    "priority": None,     # Not applicable for Python
                    "editable": False,    # Not available from pip list
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

    def _install_package(self, package_name: str, package_type: str, environment_type: str | None = None) -> InstallResult:
        """Install a package."""
        
        if package_type == "python":
            return self._install_python_package(package_name, environment_type)
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

    def _install_python_package(self, package_name: str, environment_type: str | None = None) -> InstallResult:
        """Install a Python package using the appropriate method for the current environment."""
        try:
            # Always use environment type information - no fallback to inference
            if not environment_type:
                error_msg = f"Environment type is required for Python package installation but was not provided for package {package_name}"
                logger.error(error_msg)
                return InstallResult(success=False, error=error_msg)
            
            install_cmd = self._get_install_command_from_env_type(package_name, environment_type)
            
            result = subprocess.run(
                install_cmd,
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

    def _get_install_command(self, package_name: str) -> List[str]:
        """Get the appropriate installation command for the current Python environment."""
        # Check if we're in a conda environment
        if self._is_conda_environment():
            # Try conda first, but fall back to conda's pip if package not found
            return ["conda", "install", "-y", "-c", "conda-forge", package_name]
        
        # Check if we're in a virtual environment
        if self._is_virtual_environment():
            return [sys.executable, "-m", "pip", "install", package_name]
        
        # Check if we can install to user directory
        if self._should_use_user_install():
            return [sys.executable, "-m", "pip", "install", "--user", package_name]
        
        # Last resort: try with --break-system-packages if available
        if self._supports_break_system_packages():
            return [sys.executable, "-m", "pip", "install", "--break-system-packages", package_name]
        
        # Default fallback (will likely fail on externally managed environments)
        return [sys.executable, "-m", "pip", "install", package_name]

    def _get_uninstall_command(self, package_name: str) -> List[str]:
        """Get the appropriate uninstallation command for the current Python environment."""
        # Check if we're in a conda environment
        if self._is_conda_environment():
            return ["conda", "remove", "-y", package_name]
        
        # Check if we're in a virtual environment (safe to uninstall directly)
        if self._is_virtual_environment():
            return [sys.executable, "-m", "pip", "uninstall", "-y", package_name]
        
        # For system environments, may need --break-system-packages for externally managed systems
        if self._supports_break_system_packages():
            return [sys.executable, "-m", "pip", "uninstall", "-y", "--break-system-packages", package_name]
        
        # Default fallback
        return [sys.executable, "-m", "pip", "uninstall", "-y", package_name]

    def _is_conda_environment(self) -> bool:
        """Check if we're running in a conda environment."""
        return (
            "CONDA_DEFAULT_ENV" in os.environ or
            "CONDA_PREFIX" in os.environ or
            os.path.exists(os.path.join(sys.prefix, "conda-meta"))
        )

    def _is_virtual_environment(self) -> bool:
        """Check if we're running in a virtual environment."""
        return (
            hasattr(sys, "real_prefix") or  # virtualenv
            (hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix)  # venv
        )

    def _should_use_user_install(self) -> bool:
        """Check if we should use --user flag for pip install."""
        # Don't use --user in virtual environments or conda environments
        if self._is_virtual_environment() or self._is_conda_environment():
            return False
        
        # Use --user if we can't write to the system site-packages
        try:
            import site
            system_site_packages = site.getsitepackages()[0] if site.getsitepackages() else None
            if system_site_packages and not os.access(system_site_packages, os.W_OK):
                return True
        except (ImportError, IndexError, AttributeError):
            pass
        
        return False

    def _supports_break_system_packages(self) -> bool:
        """Check if pip supports --break-system-packages flag."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--help"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return "--break-system-packages" in result.stdout
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            return False

    def _install_with_conda_fallback(self, package_name: str) -> InstallResult:
        """Try to install with conda, fall back to pip if conda fails."""
        # First try conda
        try:
            conda_cmd = ["conda", "install", "-y", "-c", "conda-forge", package_name]
            
            result = subprocess.run(
                conda_cmd,
                capture_output=True,
                text=True,
                check=True
            )
            
            # Notify frontend that packages have changed
            self._notify_packages_changed(PackagesChangedPackageType.Python)
            return InstallResult(success=True, error=None)
            
        except subprocess.CalledProcessError as conda_error:
            # Fall back to pip in the conda environment
            try:
                pip_cmd = [sys.executable, "-m", "pip", "install", package_name]
                
                result = subprocess.run(
                    pip_cmd,
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                # Notify frontend that packages have changed
                self._notify_packages_changed(PackagesChangedPackageType.Python)
                return InstallResult(success=True, error=None)
                
            except subprocess.CalledProcessError as pip_error:
                combined_error = f"Conda install failed: {conda_error.stderr}. Pip install failed: {pip_error.stderr}"
                logger.error(combined_error)
                return InstallResult(success=False, error=combined_error)

    def _uninstall_with_conda_fallback(self, package_name: str) -> UninstallResult:
        """Try to uninstall with conda, fall back to pip if conda fails."""
        # First try conda
        try:
            conda_cmd = ["conda", "remove", "-y", package_name]
            
            result = subprocess.run(
                conda_cmd,
                capture_output=True,
                text=True,
                check=True
            )
            
            # Notify frontend that packages have changed
            self._notify_packages_changed(PackagesChangedPackageType.Python)
            return UninstallResult(success=True, error=None)
            
        except subprocess.CalledProcessError as conda_error:
            # Fall back to pip in the conda environment
            try:
                pip_cmd = [sys.executable, "-m", "pip", "uninstall", "-y", package_name]
                
                result = subprocess.run(
                    pip_cmd,
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                # Notify frontend that packages have changed
                self._notify_packages_changed(PackagesChangedPackageType.Python)
                return UninstallResult(success=True, error=None)
                
            except subprocess.CalledProcessError as pip_error:
                combined_error = f"Conda uninstall failed: {conda_error.stderr}. Pip uninstall failed: {pip_error.stderr}"
                logger.error(combined_error)
                return UninstallResult(success=False, error=combined_error)

    def _uninstall_package(self, package_name: str, package_type: str, environment_type: str | None = None) -> UninstallResult:
        """Uninstall a package."""
        if package_type == "python":
            return self._uninstall_python_package(package_name, environment_type)
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

    def _uninstall_python_package(self, package_name: str, environment_type: str | None = None) -> UninstallResult:
        """Uninstall a Python package using the appropriate method for the current environment."""
        try:
            # Always use environment type information - no fallback to inference
            if not environment_type:
                error_msg = f"Environment type is required for Python package uninstallation but was not provided for package {package_name}"
                logger.error(error_msg)
                return UninstallResult(success=False, error=error_msg)
            
            uninstall_cmd = self._get_uninstall_command_from_env_type(package_name, environment_type)
            
            result = subprocess.run(
                uninstall_cmd,
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

    def _get_install_command_from_env_type(self, package_name: str, environment_type: str) -> List[str]:
        """Get the appropriate installation command based on environment type."""
        
        # Handle exact values from Python extension API: 'Conda', 'VirtualEnvironment', 'Unknown'
        if environment_type == 'Conda':
            return ["conda", "install", "-y", "-c", "conda-forge", package_name]
        elif environment_type == 'VirtualEnvironment':
            # Python extension returns 'VirtualEnvironment' for all virtual environments
            return [sys.executable, "-m", "pip", "install", package_name]
        elif environment_type == 'Unknown':
            # Unknown environment type - use pip with appropriate flags
            if self._should_use_user_install():
                return [sys.executable, "-m", "pip", "install", "--user", package_name]
            elif self._supports_break_system_packages():
                return [sys.executable, "-m", "pip", "install", "--break-system-packages", package_name]
            else:
                return [sys.executable, "-m", "pip", "install", package_name]
        else:
            # This should never happen since Python extension API only returns 'Conda', 'VirtualEnvironment', 'Unknown'
            error_msg = f"Unexpected environment type: {environment_type}. Expected 'Conda', 'VirtualEnvironment', or 'Unknown'"
            logger.error(error_msg)
            raise ValueError(error_msg)

    def _get_uninstall_command_from_env_type(self, package_name: str, environment_type: str) -> List[str]:
        """Get the appropriate uninstallation command based on environment type."""
        
        # Handle exact values from Python extension API: 'Conda', 'VirtualEnvironment', 'Unknown'
        if environment_type == 'Conda':
            return ["conda", "remove", "-y", package_name]
        elif environment_type == 'VirtualEnvironment':
            # Python extension returns 'VirtualEnvironment' for all virtual environments
            return [sys.executable, "-m", "pip", "uninstall", "-y", package_name]
        elif environment_type == 'Unknown':
            # Unknown environment type - might need special handling
            if self._supports_break_system_packages():
                return [sys.executable, "-m", "pip", "uninstall", "-y", "--break-system-packages", package_name]
            else:
                return [sys.executable, "-m", "pip", "uninstall", "-y", package_name]
        else:
            # This should never happen since Python extension API only returns 'Conda', 'VirtualEnvironment', 'Unknown'
            error_msg = f"Unexpected environment type for uninstall: {environment_type}. Expected 'Conda', 'VirtualEnvironment', or 'Unknown'"
            logger.error(error_msg)
            raise ValueError(error_msg)

    def _notify_packages_changed(self, package_type: PackagesChangedPackageType) -> None:
        """Notify all active frontends that packages have changed."""
        params = PackagesChangedParams(package_type=package_type)
        for comm in self._comms.values():
            comm.send_event(
                name=EnvironmentFrontendEvent.PackagesChanged.value,
                payload=params.dict()
            )

