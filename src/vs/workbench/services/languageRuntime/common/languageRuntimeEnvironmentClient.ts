/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';
import { ErdosEnvironmentComm, PackagesChangedEvent, ListPackagesPackageType, InstallPackagePackageType, UninstallPackagePackageType, PackageInfo, InstallResult, UninstallResult } from './erdosEnvironmentComm.js';

export class EnvironmentClientInstance extends Disposable {
	private readonly _comm: ErdosEnvironmentComm;

	public readonly languageId: string;

	constructor(
		private readonly _instance: IRuntimeClientInstance<any, any>,
		languageId: string
	) {
		super();

		this.languageId = languageId;

		this._comm = this._register(new ErdosEnvironmentComm(this._instance));

		this.onDidPackagesChange = this._comm.onDidPackagesChanged;
		this.onDidClose = this._comm.onDidClose;
	}

	async listPackages(packageType: 'r' | 'python'): Promise<PackageInfo[]> {
		const enumType = packageType === 'r' ? ListPackagesPackageType.R : ListPackagesPackageType.Python;
		return this._comm.listPackages(enumType);
	}

	async installPackage(packageName: string, packageType: 'r' | 'python', environmentType?: string): Promise<InstallResult> {
		const enumType = packageType === 'r' ? InstallPackagePackageType.R : InstallPackagePackageType.Python;
		return this._comm.installPackage(packageName, enumType, environmentType);
	}

	async uninstallPackage(packageName: string, packageType: 'r' | 'python', environmentType?: string): Promise<UninstallResult> {
		const enumType = packageType === 'r' ? UninstallPackagePackageType.R : UninstallPackagePackageType.Python;
		return this._comm.uninstallPackage(packageName, enumType, environmentType);
	}

	onDidPackagesChange: Event<PackagesChangedEvent>;

	onDidClose: Event<void>;
}
