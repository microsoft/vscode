/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buffer } from './zip';

export type ExtensionKind = 'ui' | 'workspace' | 'web';

export interface IExtensionManifest {
	readonly name: string;
	readonly displayName?: string;
	readonly publisher: string;
	readonly version: string;
	readonly engines: { readonly vscode: string };
	readonly description?: string;
	readonly main?: string;
	readonly browser?: string;
	readonly icon?: string;
	readonly categories?: string[];
	readonly keywords?: string[];
	readonly activationEvents?: string[];
	readonly extensionDependencies?: string[];
	readonly extensionPack?: string[];
	readonly extensionKind?: ExtensionKind | ExtensionKind[];
	readonly contributes?: any;
	readonly repository?: { url: string; };
	readonly bugs?: { url: string; };
	readonly enableProposedApi?: boolean;
	readonly api?: string;
	readonly scripts?: { [key: string]: string; };
	readonly capabilities?: any;
}

export function getManifest(vsix: string): Promise<IExtensionManifest> {
	return buffer(vsix, 'extension/package.json')
		.then(buffer => {
			try {
				return JSON.parse(buffer.toString('utf8'));
			} catch (err) {
				throw new Error('VSIX invalid: package.json is not a JSON file.');
			}
		});
}
