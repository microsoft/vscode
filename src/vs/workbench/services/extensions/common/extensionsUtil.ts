/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionIdentifierMap, IExtensionDescription, IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { localize } from 'vs/nls';
import { ILogService } from 'vs/platform/log/common/log';
import * as semver from 'vs/base/common/semver/semver';

// TODO: @sandy081 merge this with deduping in extensionsScannerService.ts
export function dedupExtensions(system: IExtensionDescription[], user: IExtensionDescription[], development: IExtensionDescription[], logService: ILogService): IExtensionDescription[] {
	const result = new ExtensionIdentifierMap<IExtensionDescription>();
	system.forEach((systemExtension) => {
		const extension = result.get(systemExtension.identifier);
		if (extension) {
			logService.warn(localize('overwritingExtension', "Overwriting extension {0} with {1}.", extension.extensionLocation.fsPath, systemExtension.extensionLocation.fsPath));
		}
		result.set(systemExtension.identifier, systemExtension);
	});
	user.forEach((userExtension) => {
		const extension = result.get(userExtension.identifier);
		if (extension) {
			if (extension.isBuiltin) {
				if (semver.gte(extension.version, userExtension.version)) {
					logService.warn(`Skipping extension ${userExtension.extensionLocation.path} in favour of the builtin extension ${extension.extensionLocation.path}.`);
					return;
				}
				// Overwriting a builtin extension inherits the `isBuiltin` property and it doesn't show a warning
				(<IRelaxedExtensionDescription>userExtension).isBuiltin = true;
			} else {
				logService.warn(localize('overwritingExtension', "Overwriting extension {0} with {1}.", extension.extensionLocation.fsPath, userExtension.extensionLocation.fsPath));
			}
		} else if (userExtension.isBuiltin) {
			logService.warn(`Skipping obsolete builtin extension ${userExtension.extensionLocation.path}`);
			return;
		}
		result.set(userExtension.identifier, userExtension);
	});
	development.forEach(developedExtension => {
		logService.info(localize('extensionUnderDevelopment', "Loading development extension at {0}", developedExtension.extensionLocation.fsPath));
		const extension = result.get(developedExtension.identifier);
		if (extension) {
			if (extension.isBuiltin) {
				// Overwriting a builtin extension inherits the `isBuiltin` property
				(<IRelaxedExtensionDescription>developedExtension).isBuiltin = true;
			}
		}
		result.set(developedExtension.identifier, developedExtension);
	});
	return Array.from(result.values());
}
