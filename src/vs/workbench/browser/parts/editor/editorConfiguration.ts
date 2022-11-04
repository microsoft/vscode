/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IEditorResolverService, RegisteredEditorInfo, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { coalesce } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';

export class DynamicEditorConfigurations extends Disposable implements IWorkbenchContribution {

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

	private readonly configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	private autoLockConfigurationNode: IConfigurationNode | undefined;
	private defaultBinaryEditorConfigurationNode: IConfigurationNode | undefined;
	private editorAssociationsConfigurationNode: IConfigurationNode | undefined;

	constructor(
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super();

		// Editor configurations are getting updated very aggressively
		// (atleast 20 times) while the extensions are getting registered.
		// As such push out the dynamic configuration until after extensions
		// are registered.
		(async () => {
			await extensionService.whenInstalledExtensionsRegistered();

			this.updateDynamicEditorConfigurations();
			this.registerListeners();
		})();
	}

	private registerListeners(): void {

		// Registered editors (debounced to reduce perf overhead)
		Event.debounce(this.editorResolverService.onDidChangeEditorRegistrations, (_, e) => e)(() => this.updateDynamicEditorConfigurations());
	}

	private updateDynamicEditorConfigurations(): void {
		const lockableEditors = [...this.editorResolverService.getEditors(), ...DynamicEditorConfigurations.AUTO_LOCK_EXTRA_EDITORS];
		const binaryEditorCandidates = this.editorResolverService.getEditors().filter(e => e.priority !== RegisteredEditorPriority.exclusive).map(e => e.id);

		// Build config from registered editors
		const autoLockGroupConfiguration: IJSONSchemaMap = Object.create(null);
		for (const editor of lockableEditors) {
			autoLockGroupConfiguration[editor.id] = {
				type: 'boolean',
				default: DynamicEditorConfigurations.AUTO_LOCK_DEFAULT_ENABLED.has(editor.id),
				description: editor.label
			};
		}

		// Build default config too
		const defaultAutoLockGroupConfiguration = Object.create(null);
		for (const editor of lockableEditors) {
			defaultAutoLockGroupConfiguration[editor.id] = DynamicEditorConfigurations.AUTO_LOCK_DEFAULT_ENABLED.has(editor.id);
		}

		// Register settng for auto locking groups
		const oldAutoLockConfigurationNode = this.autoLockConfigurationNode;
		this.autoLockConfigurationNode = {
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

		// Registers setting for default binary editors
		const oldDefaultBinaryEditorConfigurationNode = this.defaultBinaryEditorConfigurationNode;
		this.defaultBinaryEditorConfigurationNode = {
			...workbenchConfigurationNodeBase,
			properties: {
				'workbench.editor.defaultBinaryEditor': {
					type: 'string',
					default: '',
					// This allows for intellisense autocompletion
					enum: [...binaryEditorCandidates, ''],
					description: localize('workbench.editor.defaultBinaryEditor', "The default editor for files detected as binary. If undefined the user will be presented with a picker."),
				}
			}
		};

		// Registers setting for editorAssociations
		const oldEditorAssociationsConfigurationNode = this.editorAssociationsConfigurationNode;
		this.editorAssociationsConfigurationNode = {
			...workbenchConfigurationNodeBase,
			properties: {
				'workbench.editorAssociations': {
					type: 'object',
					markdownDescription: localize('editor.editorAssociations', "Configure glob patterns to editors (e.g. `\"*.hex\": \"hexEditor.hexEdit\"`). These have precedence over the default behavior."),
					patternProperties: {
						'.*': {
							type: 'string',
							enum: binaryEditorCandidates,
						}
					}
				}
			}
		};

		this.configurationRegistry.updateConfigurations({
			add: [
				this.autoLockConfigurationNode,
				this.defaultBinaryEditorConfigurationNode,
				this.editorAssociationsConfigurationNode
			],
			remove: coalesce([
				oldAutoLockConfigurationNode,
				oldDefaultBinaryEditorConfigurationNode,
				oldEditorAssociationsConfigurationNode
			])
		});
	}
}
