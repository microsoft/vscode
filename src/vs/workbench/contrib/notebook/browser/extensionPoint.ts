/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as nls from 'vs/nls';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { languagesExtPoint } from 'vs/workbench/services/mode/common/workbenchModeService';
import { NotebookSelector } from 'vs/workbench/contrib/notebook/common/notebookProvider';

namespace NotebookEditorContribution {
	export const viewType = 'viewType';
	export const displayName = 'displayName';
	export const selector = 'selector';
}


interface INotebookEditorContribution {
	readonly [NotebookEditorContribution.viewType]: string;
	readonly [NotebookEditorContribution.displayName]: string;
	readonly [NotebookEditorContribution.selector]?: readonly NotebookSelector[];
}

const notebookContribution: IJSONSchema = {
	description: nls.localize('contributes.notebook', 'Contributes notebook.'),
	type: 'array',
	defaultSnippets: [{ body: [{ viewType: '', displayName: '' }] }],
	items: {
		type: 'object',
		required: [
			NotebookEditorContribution.viewType,
			NotebookEditorContribution.displayName,
			NotebookEditorContribution.selector,
		],
		properties: {
			[NotebookEditorContribution.viewType]: {
				type: 'string',
				description: nls.localize('contributes.notebook.viewType', 'Unique identifier of the notebook.'),
			},
			[NotebookEditorContribution.displayName]: {
				type: 'string',
				description: nls.localize('contributes.notebook.displayName', 'Human readable name of the notebook.'),
			},
			[NotebookEditorContribution.selector]: {
				type: 'array',
				description: nls.localize('contributes.notebook.selector', 'Set of globs that the notebook is for.'),
				items: {
					type: 'object',
					properties: {
						filenamePattern: {
							type: 'string',
							description: nls.localize('contributes.notebook.selector.filenamePattern', 'Glob that the notebook is enabled for.'),
						},
					}
				}
			}
		}
	}
};

export const notebookExtensionPoint = ExtensionsRegistry.registerExtensionPoint<INotebookEditorContribution[]>({
	extensionPoint: 'notebookProvider',
	deps: [languagesExtPoint],
	jsonSchema: notebookContribution
});
