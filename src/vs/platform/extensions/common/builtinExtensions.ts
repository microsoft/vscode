/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from 'vs/base/common/platform';
import { IExtension } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';

let builtinExtensions: IExtension[] = [];

// Web
if (isWeb) {

	// Built time configuration (do NOT modify)
	builtinExtensions = { /*BUILD->INSERT_BUILTIN_EXTENSIONS*/ } as IExtension[];

	// Running out of sources
	if (Object.keys(builtinExtensions).length === 0) {
		// Find builtin extensions by checking for DOM
		const builtinExtensionsElement = document.getElementById('vscode-workbench-builtin-extensions');
		const builtinExtensionsElementAttribute = builtinExtensionsElement ? builtinExtensionsElement.getAttribute('data-settings') : undefined;
		if (builtinExtensionsElementAttribute) {
			builtinExtensions = JSON.parse(builtinExtensionsElementAttribute);
		}
	}
}

// Unknown
else {
	throw new Error('Unable to resolve builtin extensions');
}

builtinExtensions = builtinExtensions.map(extension => ({
	...extension,
	location: URI.revive(extension.location),
	readmeUrl: URI.revive(extension.readmeUrl),
	changelogUrl: URI.revive(extension.changelogUrl),
}));

export default builtinExtensions;
