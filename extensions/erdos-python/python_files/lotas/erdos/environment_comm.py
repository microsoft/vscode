#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

#
# AUTO-GENERATED from environment.json; do not edit.
#

# flake8: noqa

# For forward declarations
from __future__ import annotations

import enum
from typing import Any, List, Literal, Optional, Union

from ._vendor.pydantic import BaseModel, Field, StrictBool, StrictFloat, StrictInt, StrictStr

@enum.unique
class ListPackagesPackageType(str, enum.Enum):
    """
    Possible values for PackageType in ListPackages
    """

    R = "r"

    Python = "python"


@enum.unique
class InstallPackagePackageType(str, enum.Enum):
    """
    Possible values for PackageType in InstallPackage
    """

    R = "r"

    Python = "python"


@enum.unique
class UninstallPackagePackageType(str, enum.Enum):
    """
    Possible values for PackageType in UninstallPackage
    """

    R = "r"

    Python = "python"


class PackageInfo(BaseModel):
    """
    Items in Result
    """

    name: StrictStr = Field(
        description="Package name",
    )

    version: StrictStr = Field(
        description="Package version",
    )

    description: Optional[StrictStr] = Field(
        default=None,
        description="Package description",
    )

    location: Optional[StrictStr] = Field(
        default=None,
        description="Package installation location",
    )

    is_loaded: Optional[StrictBool] = Field(
        default=None,
        description="Whether package is currently loaded (R only)",
    )

    priority: Optional[StrictStr] = Field(
        default=None,
        description="Package priority (R only)",
    )

    editable: Optional[StrictBool] = Field(
        default=None,
        description="Whether package is editable install (Python only)",
    )



class InstallResult(BaseModel):
    """
    Result in Methods
    """

    success: StrictBool = Field(
        description="Whether installation was successful",
    )

    error: Optional[StrictStr] = Field(
        default=None,
        description="Error message if installation failed",
    )



class UninstallResult(BaseModel):
    """
    Result in Methods
    """

    success: StrictBool = Field(
        description="Whether uninstallation was successful",
    )

    error: Optional[StrictStr] = Field(
        default=None,
        description="Error message if uninstallation failed",
    )



@enum.unique
class PackagesChangedPackageType(str, enum.Enum):
    """
    Possible values for PackageType in PackagesChanged
    """

    R = "r"

    Python = "python"


@enum.unique
class EnvironmentBackendRequest(str, enum.Enum):
    """
    An enumeration of all the possible requests that can be sent to the backend environment comm.
    """

    # List installed packages for the current runtime
    ListPackages = "list_packages"

    # Install a package
    InstallPackage = "install_package"

    # Uninstall a package
    UninstallPackage = "uninstall_package"

class ListPackagesParams(BaseModel):
    """
    Returns array of installed packages with their versions and metadata
    """

    package_type: ListPackagesPackageType = Field(
        description="Type of packages to list",
    )

class ListPackagesRequest(BaseModel):
    """
    Returns array of installed packages with their versions and metadata
    """

    params: ListPackagesParams = Field(
        description="Parameters to the ListPackages method",
    )

    method: Literal[EnvironmentBackendRequest.ListPackages] = Field(
        description="The JSON-RPC method name (list_packages)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class InstallPackageParams(BaseModel):
    """
    Installs a package using the appropriate package manager
    """

    package_name: StrictStr = Field(
        description="Name of package to install",
    )

    package_type: InstallPackagePackageType = Field(
        description="Type of package manager to use",
    )

class InstallPackageRequest(BaseModel):
    """
    Installs a package using the appropriate package manager
    """

    params: InstallPackageParams = Field(
        description="Parameters to the InstallPackage method",
    )

    method: Literal[EnvironmentBackendRequest.InstallPackage] = Field(
        description="The JSON-RPC method name (install_package)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class UninstallPackageParams(BaseModel):
    """
    Uninstalls a package using the appropriate package manager
    """

    package_name: StrictStr = Field(
        description="Name of package to uninstall",
    )

    package_type: UninstallPackagePackageType = Field(
        description="Type of package manager to use",
    )

class UninstallPackageRequest(BaseModel):
    """
    Uninstalls a package using the appropriate package manager
    """

    params: UninstallPackageParams = Field(
        description="Parameters to the UninstallPackage method",
    )

    method: Literal[EnvironmentBackendRequest.UninstallPackage] = Field(
        description="The JSON-RPC method name (uninstall_package)",
    )

    jsonrpc: str = Field(
        default="2.0",        description="The JSON-RPC version specifier",
    )

class EnvironmentBackendMessageContent(BaseModel):
    comm_id: str
    data: Union[
        ListPackagesRequest,
        InstallPackageRequest,
        UninstallPackageRequest,
    ] = Field(..., discriminator="method")

@enum.unique
class EnvironmentFrontendEvent(str, enum.Enum):
    """
    An enumeration of all the possible events that can be sent to the frontend environment comm.
    """

    # Notify when packages have changed
    PackagesChanged = "packages_changed"

class PackagesChangedParams(BaseModel):
    """
    Notify when packages have changed
    """

    package_type: PackagesChangedPackageType = Field(
        description="Type of packages that changed",
    )

PackageInfo.update_forward_refs()

InstallResult.update_forward_refs()

UninstallResult.update_forward_refs()

ListPackagesParams.update_forward_refs()

ListPackagesRequest.update_forward_refs()

InstallPackageParams.update_forward_refs()

InstallPackageRequest.update_forward_refs()

UninstallPackageParams.update_forward_refs()

UninstallPackageRequest.update_forward_refs()

PackagesChangedParams.update_forward_refs()

