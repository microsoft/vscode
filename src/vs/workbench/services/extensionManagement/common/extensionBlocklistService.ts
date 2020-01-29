/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionBlocklistService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface IBlocklistConfiguration {
	allowedPublishers: string[];
	allowedPackages: string[];
	prohibitedPackages: string[];
}

export class ExtensionBlocklistService extends Disposable implements IExtensionBlocklistService {

	_serviceBrand: undefined;
	private _blocklist: IBlocklistConfiguration;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._blocklist = {
			allowedPublishers: [],
			allowedPackages: [],
			prohibitedPackages: []
		};

		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('extensions.blocklist')) {
				this._blocklist = this._configurationService.getValue('extensions.blocklist');
			}
		});
	}

	isPermitted(extension: { publisher: string; name: string; version: string }): boolean {
		const builtinPublishers = ['vscode', 'ms-vscode'];
		const allowedPublishers = builtinPublishers.concat(this._blocklist.allowedPublishers);

		return (allowedPublishers.indexOf(extension.publisher) !== -1 ||
			this._blocklist.allowedPackages.indexOf(extension.publisher + '.' + extension.name) !== -1) &&
			this._blocklist.prohibitedPackages.indexOf(extension.publisher + '.' + extension.name + '-' + extension.version) === -1;
	}

}

registerSingleton(IExtensionBlocklistService, ExtensionBlocklistService, true);
