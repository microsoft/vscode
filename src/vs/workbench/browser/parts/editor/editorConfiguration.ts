/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IEditorResolverService, RegisteredEditorInfo, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class DynamicEditorGroupAutoLockConfiguration extends Disposable implements IWorkbenchContribution {

	private static readonly AUTO_LOCK_DEFAULT_ENABLED = new Set<string>(['terminalEditor']);

	private static readonly AUTO_LOCK_EXTRA_EDITORS: RegisteredEditorInfo[] = [

		// Any webview editor is not a registered editor but we
		// still want to support auto-locking for them, so we
		// manually add them here...
		{
			id: 'mainThreadWebview-markdown.preview',
			label: localize('markdownPreview', "Markdown Preview"),
			priority: RegisteredEditorPriority.builtin
		}
	];

	private configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	private configurationDisposable = this._register(new MutableDisposable());

	constructor(
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IExtensionService extensionService: IExtensionService
	) {
		super();

		// Defer setup of config registration until extensions are
		// registered so that our first registration includes all
		// of them.
		// Related: 
		(async () => {
			await extensionService.whenInstalledExtensionsRegistered();

			this.updateConfiguration();
			this.registerListeners();
		})();
	}

	private registerListeners(): void {

		// Registered editors
		this._register(this.editorResolverService.onDidChangeEditorRegistrations(() => this.updateConfiguration()));
	}

	private updateConfiguration(): void {
		const editors = [...this.editorResolverService.getEditors(), ...DynamicEditorGroupAutoLockConfiguration.AUTO_LOCK_EXTRA_EDITORS];

		// Build config from registered editors
		const autoLockGroupConfiguration: IJSONSchemaMap = Object.create(null);
		for (const editor of editors) {
			autoLockGroupConfiguration[editor.id] = {
				type: 'boolean',
				default: DynamicEditorGroupAutoLockConfiguration.AUTO_LOCK_DEFAULT_ENABLED.has(editor.id),
				description: editor.label
			};
		}

		// Build default config too
		const defaultAutoLockGroupConfiguration = Object.create(null);
		for (const editor of editors) {
			defaultAutoLockGroupConfiguration[editor.id] = DynamicEditorGroupAutoLockConfiguration.AUTO_LOCK_DEFAULT_ENABLED.has(editor.id);
		}

		const configurationNode: IConfigurationNode = {
			...workbenchConfigurationNodeBase,
			properties: {
				'workbench.editor.autoLockGroups': {
					type: 'object',
					description: localize('workbench.editor.autoLockGroups', "If an editor matching one of the listed types is opened as the first in an editor group and more than one group is open, the group is automatically locked. Locked groups will only be used for opening editors when explicitly chosen by user gesture (e.g. drag and drop), but not by default. Consequently the active editor in a locked group is less likely to be replaced accidentally with a different editor."),
					properties: autoLockGroupConfiguration,
					default: defaultAutoLockGroupConfiguration,
					additionalProperties: false
				}
			}
		};

		// Register configuration disposing any previous registration
		this.configurationDisposable.dispose();
		this.configurationRegistry.registerConfiguration(configurationNode);
		this.configurationDisposable.value = toDisposable(() => this.configurationRegistry.deregisterConfigurations([configurationNode]));
	}
}
