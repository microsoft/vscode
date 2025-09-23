/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

//
// AUTO-GENERATED from environment.json; do not edit.
//

import { Event } from '../../../../base/common/event.js';
import { ErdosBaseComm, ErdosCommOptions } from './erdosBaseComm.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';

export interface PackageInfo {
	name: string;

	version: string;

	description?: string;

	location?: string;

	is_loaded?: boolean;

	priority?: string;

	editable?: boolean;

}

export interface InstallResult {
	success: boolean;

	error?: string;

}

export interface UninstallResult {
	success: boolean;

	error?: string;

}

export enum ListPackagesPackageType {
	R = 'r',
	Python = 'python'
}

export enum InstallPackagePackageType {
	R = 'r',
	Python = 'python'
}

export enum UninstallPackagePackageType {
	R = 'r',
	Python = 'python'
}

export interface ListPackagesParams {
	package_type: ListPackagesPackageType;
}

export interface InstallPackageParams {
	package_name: string;

	package_type: InstallPackagePackageType;
}

export interface UninstallPackageParams {
	package_name: string;

	package_type: UninstallPackagePackageType;
}

export enum PackagesChangedPackageType {
	R = 'r',
	Python = 'python'
}

export interface PackagesChangedParams {
	package_type: PackagesChangedPackageType;
}

export interface PackagesChangedEvent {
	package_type: PackagesChangedPackageType;

}

export enum EnvironmentFrontendEvent {
	PackagesChanged = 'packages_changed'
}

export enum EnvironmentBackendRequest {
	ListPackages = 'list_packages',
	InstallPackage = 'install_package',
	UninstallPackage = 'uninstall_package'
}

export class ErdosEnvironmentComm extends ErdosBaseComm {
	constructor(
		instance: IRuntimeClientInstance<any, any>,
		options?: ErdosCommOptions<EnvironmentBackendRequest>,
	) {
		super(instance, options);
		this.onDidPackagesChanged = super.createEventEmitter('packages_changed', ['package_type']);
	}

	listPackages(packageType: ListPackagesPackageType): Promise<Array<PackageInfo>> {
		return super.performRpc('list_packages', ['package_type'], [packageType]);
	}

	installPackage(packageName: string, packageType: InstallPackagePackageType): Promise<InstallResult> {
		return super.performRpc('install_package', ['package_name', 'package_type'], [packageName, packageType]);
	}

	uninstallPackage(packageName: string, packageType: UninstallPackagePackageType): Promise<UninstallResult> {
		return super.performRpc('uninstall_package', ['package_name', 'package_type'], [packageName, packageType]);
	}


	onDidPackagesChanged: Event<PackagesChangedEvent>;
}

