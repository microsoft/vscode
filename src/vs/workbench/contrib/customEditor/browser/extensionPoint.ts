/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as nls from 'vs/nls';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { languagesExtPoint } from 'vs/workbench/services/mode/common/workbenchModeService';

interface IWebviewEditorsExtensionPoint {
	readonly viewType: string;
	readonly displayName: string;
	readonly filePatterns?: readonly string[];
}

const webviewEditorsContribution: IJSONSchema = {
	description: nls.localize('vscode.extension.contributes.webviewEditors', 'Contributes webview editors.'),
	type: 'array',
	defaultSnippets: [{ body: [{ viewType: '', displayName: '' }] }],
	items: {
		type: 'object',
		required: [
			'viewType',
			'displayName'
		],
		properties: {
			viewType: {
				description: nls.localize('vscode.extension.contributes.webviewEditors-viewType', 'XXX.'),
				type: 'string'
			},
			displayName: {
				description: nls.localize('vscode.extension.contributes.webviewEditors-displayName', 'XXX.'),
				type: 'string'
			},
			filePatterns: {
				type: 'array',
				description: nls.localize('vscode.extension.contributes.webviewEditors-filenamePatterns', 'XXX.'),
			}
		}
	}
};

export const webviewEditorsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IWebviewEditorsExtensionPoint[]>({
	extensionPoint: 'webviewEditors',
	deps: [languagesExtPoint],
	jsonSchema: webviewEditorsContribution
});
