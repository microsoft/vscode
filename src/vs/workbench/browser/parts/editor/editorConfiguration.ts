/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationNode, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IEditorResolverService, RegisteredEditorInfo, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IJSONSchemaMap } from '../../../../base/common/jsonSchema.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Event } from '../../../../base/common/event.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ByteSize, getLargeFileConfirmationLimit } from '../../../../platform/files/common/files.js';

export class DynamicEditorConfigurations extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.dynamicEditorConfigurations';

	private static readonly AUTO_LOCK_DEFAULT_ENABLED = new Set<string>([
		'terminalEditor',
		'mainThreadWebview-simpleBrowser.view',
		'mainThreadWebview-browserPreview',
		'workbench.editor.processExplorer'
	]);

	private static readonly AUTO_LOCK_EXTRA_EDITORS: RegisteredEditorInfo[] = [

		// List some editor input identifiers that are not
		// registered yet via the editor resolver infrastructure

		{
			id: 'workbench.input.interactive',
			label: localize('interactiveWindow', 'Interactive Window'),
			priority: RegisteredEditorPriority.builtin
		},
		{
			id: 'mainThreadWebview-markdown.preview',
			label: localize('markdownPreview', "Markdown Preview"),
			priority: RegisteredEditorPriority.builtin
		},
		{
			id: 'mainThreadWebview-simpleBrowser.view',
			label: localize('simpleBrowser', "Simple Browser"),
			priority: RegisteredEditorPriority.builtin
		},
		{
			id: 'mainThreadWebview-browserPreview',
			label: localize('livePreview', "Live Preview"),
			priority: RegisteredEditorPriority.builtin
		}
	];

	private static readonly AUTO_LOCK_REMOVE_EDITORS = new Set<string>([

		// List some editor types that the above `AUTO_LOCK_EXTRA_EDITORS`
		// already covers to avoid duplicates.

		'vscode-interactive-input',
		'interactive',
		'vscode.markdown.preview.editor'
	]);

	private readonly configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	private autoLockConfigurationNode: IConfigurationNode | undefined;
	private defaultBinaryEditorConfigurationNode: IConfigurationNode | undefined;
	private editorAssociationsConfigurationNode: IConfigurationNode | undefined;
	private editorLargeFileConfirmationConfigurationNode: IConfigurationNode | undefined;

	constructor(
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
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
		this._register(Event.debounce(this.editorResolverService.onDidChangeEditorRegistrations, (_, e) => e)(() => this.updateDynamicEditorConfigurations()));
	}

	private updateDynamicEditorConfigurations(): void {
		const lockableEditors = [...this.editorResolverService.getEditors(), ...DynamicEditorConfigurations.AUTO_LOCK_EXTRA_EDITORS].filter(e => !DynamicEditorConfigurations.AUTO_LOCK_REMOVE_EDITORS.has(e.id));
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

		// Register setting for auto locking groups
		const oldAutoLockConfigurationNode = this.autoLockConfigurationNode;
		this.autoLockConfigurationNode = {
			...workbenchConfigurationNodeBase,
			properties: {
				'workbench.editor.autoLockGroups': {
					type: 'object',
					description: localize('workbench.editor.autoLockGroups', "If an editor matching one of the listed types is opened as the first in an editor group and more than one group is open, the group is automatically locked. Locked groups will only be used for opening editors when explicitly chosen by a user gesture (for example drag and drop), but not by default. Consequently, the active editor in a locked group is less likely to be replaced accidentally with a different editor."),
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
					description: localize('workbench.editor.defaultBinaryEditor', "The default editor for files detected as binary. If undefined, the user will be presented with a picker."),
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
					markdownDescription: localize('editor.editorAssociations', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors (for example `\"*.hex\": \"hexEditor.hexedit\"`). These have precedence over the default behavior."),
					patternProperties: {
						'.*': {
							type: 'string',
							enum: binaryEditorCandidates,
						}
					}
				}
			}
		};

		// Registers setting for large file confirmation based on environment
		const oldEditorLargeFileConfirmationConfigurationNode = this.editorLargeFileConfirmationConfigurationNode;
		this.editorLargeFileConfirmationConfigurationNode = {
			...workbenchConfigurationNodeBase,
			properties: {
				'workbench.editorLargeFileConfirmation': {
					type: 'number',
					default: getLargeFileConfirmationLimit(this.environmentService.remoteAuthority) / ByteSize.MB,
					minimum: 1,
					scope: ConfigurationScope.RESOURCE,
					markdownDescription: localize('editorLargeFileSizeConfirmation', "Controls the minimum size of a file in MB before asking for confirmation when opening in the editor. Note that this setting may not apply to all editor types and environments."),
				}
			}
		};

		this.configurationRegistry.updateConfigurations({
			add: [
				this.autoLockConfigurationNode,
				this.defaultBinaryEditorConfigurationNode,
				this.editorAssociationsConfigurationNode,
				this.editorLargeFileConfirmationConfigurationNode
			],
			remove: coalesce([
				oldAutoLockConfigurationNode,
				oldDefaultBinaryEditorConfigurationNode,
				oldEditorAssociationsConfigurationNode,
				oldEditorLargeFileConfirmationConfigurationNode
			])
		});
	}
}
