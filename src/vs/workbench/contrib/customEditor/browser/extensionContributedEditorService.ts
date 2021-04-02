/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { insert } from 'vs/base/common/arrays';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride, IOpenEditorOverrideEntry } from 'vs/workbench/services/editor/common/editorService';

export interface IExtensionContributedEditorHandler {
	getEditorOverrides(resource: URI, options: IEditorOptions | undefined, group: IEditorGroup | undefined): IOpenEditorOverrideEntry[];
	open(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined;
}

export interface IExtensionContributedEditorService {
	readonly _serviceBrand: undefined;
	contributedEditorOverride(handler: IExtensionContributedEditorHandler): IDisposable;
}

export class ExtensionContributedEditorService extends Disposable {
	readonly _serviceBrand: undefined;

	private readonly extensionContributedEditors: IExtensionContributedEditorHandler[] = [];
	constructor(
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();

		this._register(this.editorService.overrideOpenEditor({
			getEditorOverrides: (resource: URI, options: IEditorOptions | undefined, group: IEditorGroup | undefined) => {
				// Merge all overrides from all contributions together
				const overrides: IOpenEditorOverrideEntry[] = [];
				for (const contribution of this.extensionContributedEditors) {
					overrides.push(...contribution.getEditorOverrides(resource, options, group));
				}
				return overrides;
			},
			open: (editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => {
				// Try all extension contributed editor handlers and return the first one that returns something
				for (const extensionContributedEditorHandler of this.extensionContributedEditors) {
					const result = extensionContributedEditorHandler.open(editor, options, group);
					if (result) {
						return result;
					}
				}
				return;
			}
		}));
	}

	contributedEditorOverride(handler: IExtensionContributedEditorHandler): IDisposable {
		const remove = insert(this.extensionContributedEditors, handler);
		return toDisposable(() => remove());
	}
}

export const IExtensionContributedEditorService = createDecorator<IExtensionContributedEditorService>('extensionContributedEditorService');
registerSingleton(IExtensionContributedEditorService, ExtensionContributedEditorService);
