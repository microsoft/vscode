/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBuiltinExtensionsScannerService, IScannedExtension, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';

export class BuiltinExtensionsScannerService implements IBuiltinExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	private readonly builtinExtensions: IScannedExtension[] = [];

	constructor(
	) {
		if (isWeb) {
			// Find builtin extensions by checking for DOM
			const builtinExtensionsElement = document.getElementById('vscode-workbench-builtin-extensions');
			const builtinExtensionsElementAttribute = builtinExtensionsElement ? builtinExtensionsElement.getAttribute('data-settings') : undefined;
			if (builtinExtensionsElementAttribute) {
				try {
					const builtinExtensions: IScannedExtension[] = JSON.parse(builtinExtensionsElementAttribute);
					this.builtinExtensions = builtinExtensions.map(e => <IScannedExtension>{
						location: URI.revive(e.location),
						type: ExtensionType.System,
						packageJSON: e.packageJSON,
						packageNLSUrl: URI.revive(e.packageNLSUrl),
						readmeUrl: URI.revive(e.readmeUrl),
						changelogUrl: URI.revive(e.changelogUrl),
					});
				} catch (error) { /* ignore error*/ }
			}
		}
	}

	async scanBuiltinExtensions(): Promise<IScannedExtension[]> {
		if (isWeb) {
			return this.builtinExtensions;
		}
		throw new Error('not supported');
	}
}
