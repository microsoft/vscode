/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IExtensionPointDescriptor } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const terminalContributionsDescriptor: IExtensionPointDescriptor = {
	extensionPoint: 'terminal',
	defaultExtensionKind: 'workspace',
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.terminal', 'Contributes terminal functionality.'),
		type: 'object',
		properties: {
			types: {
				type: 'array',
				description: nls.localize('vscode.extension.contributes.terminal.types', "Defines additional terminal types that the user can create."),
				items: {
					type: 'object',
					required: ['command', 'title'],
					properties: {
						command: {
							description: nls.localize('vscode.extension.contributes.terminal.types.command', "Command to execute when the user creates this type of terminal."),
							type: 'string',
						},
						title: {
							description: nls.localize('vscode.extension.contributes.terminal.types.title', "Title for this type of terminal."),
							type: 'string',
						},
					},
				},
			},
		},
	},
};
