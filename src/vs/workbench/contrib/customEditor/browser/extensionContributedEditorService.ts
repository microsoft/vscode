/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { firstOrDefault, insert } from 'vs/base/common/arrays';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { EditorAssociations, editorsAssociationsSettingId } from 'vs/workbench/browser/editor';
import { IEditorInput } from 'vs/workbench/common/editor';
import { CustomEditorInfo } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride, IOpenEditorOverrideEntry } from 'vs/workbench/services/editor/common/editorService';

export interface IExtensionContributedEditorHandler {
	/**
	 * Given a list of associations for a given resource, returns whihc overrides that contribution point can handle
	 * @param resource The URI of the current resource you want the overrides of
	 * @param currentEditor The current editor
	 */
	getEditorOverrides(resource: URI, currentEditor: IEditorInput | undefined): IOpenEditorOverrideEntry[];
	open(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined;
}

export interface IExtensionContributedEditorService {
	readonly _serviceBrand: undefined;
	contributedEditorOverride(handler: IExtensionContributedEditorHandler): IDisposable;
	getAssociationsForResource(resource: URI): EditorAssociations;
}

export class ExtensionContributedEditorService extends Disposable {
	readonly _serviceBrand: undefined;

	private readonly extensionContributedEditors: IExtensionContributedEditorHandler[] = [];
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(this.editorService.overrideOpenEditor({
			getEditorOverrides: (resource: URI, options: IEditorOptions | undefined, group: IEditorGroup | undefined) => {
				const currentEditor = group && firstOrDefault(this.editorService.findEditors(resource, group));

				// Merge all overrides from all contributions together
				const overrides: IOpenEditorOverrideEntry[] = [];
				for (const contribution of this.extensionContributedEditors) {
					overrides.push(...contribution.getEditorOverrides(resource, currentEditor));
				}
				return overrides;
			},
			open: (editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup) => {
				// Try all extension contributed editor handlers and return the first one that states it can handle a given override
				for (const extensionContributedEditorHandler of this.extensionContributedEditors) {
					const currentEditor = editor.resource && firstOrDefault(this.editorService.findEditors(editor.resource, group));
					const overrides = editor.resource ? extensionContributedEditorHandler.getEditorOverrides(editor.resource, currentEditor) : [];
					if (overrides.find(override => override.id === options?.override)) {
						return extensionContributedEditorHandler.open(editor, options, group);
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

	getAssociationsForResource(resource: URI): EditorAssociations {
		const rawAssociations = this.configurationService.getValue<EditorAssociations>(editorsAssociationsSettingId) || [];
		return rawAssociations.filter(association => CustomEditorInfo.selectorMatches(association, resource));
	}
}

export const IExtensionContributedEditorService = createDecorator<IExtensionContributedEditorService>('extensionContributedEditorService');
registerSingleton(IExtensionContributedEditorService, ExtensionContributedEditorService);
