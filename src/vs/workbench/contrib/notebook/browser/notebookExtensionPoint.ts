/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as nls from 'vs/nls';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { NotebookEditorPriority, ContributedNotebookRendererEntrypoint, RendererMessagingSpec } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const NotebookEditorContribution = Object.freeze({
	type: 'type',
	displayName: 'displayName',
	selector: 'selector',
	priority: 'priority',
});

export interface INotebookEditorContribution {
	readonly [NotebookEditorContribution.type]: string;
	readonly [NotebookEditorContribution.displayName]: string;
	readonly [NotebookEditorContribution.selector]?: readonly { filenamePattern?: string; excludeFileNamePattern?: string }[];
	readonly [NotebookEditorContribution.priority]?: string;
}

const NotebookRendererContribution = Object.freeze({
	id: 'id',
	displayName: 'displayName',
	mimeTypes: 'mimeTypes',
	entrypoint: 'entrypoint',
	hardDependencies: 'dependencies',
	optionalDependencies: 'optionalDependencies',
	requiresMessaging: 'requiresMessaging',
});

export interface INotebookRendererContribution {
	readonly [NotebookRendererContribution.id]?: string;
	readonly [NotebookRendererContribution.displayName]: string;
	readonly [NotebookRendererContribution.mimeTypes]?: readonly string[];
	readonly [NotebookRendererContribution.entrypoint]: ContributedNotebookRendererEntrypoint;
	readonly [NotebookRendererContribution.hardDependencies]: readonly string[];
	readonly [NotebookRendererContribution.optionalDependencies]: readonly string[];
	readonly [NotebookRendererContribution.requiresMessaging]: RendererMessagingSpec;
}

const NotebookPreloadContribution = Object.freeze({
	type: 'type',
	entrypoint: 'entrypoint',
});

export interface INotebookPreloadContribution {
	readonly [NotebookPreloadContribution.type]: string;
	readonly [NotebookPreloadContribution.entrypoint]: string;
}

const notebookProviderContribution: IJSONSchema = {
	description: nls.localize('contributes.notebook.provider', 'Contributes notebook document provider.'),
	type: 'array',
	defaultSnippets: [{ body: [{ type: '', displayName: '', 'selector': [{ 'filenamePattern': '' }] }] }],
	items: {
		type: 'object',
		required: [
			NotebookEditorContribution.type,
			NotebookEditorContribution.displayName,
			NotebookEditorContribution.selector,
		],
		properties: {
			[NotebookEditorContribution.type]: {
				type: 'string',
				description: nls.localize('contributes.notebook.provider.viewType', 'Type of the notebook.'),
			},
			[NotebookEditorContribution.displayName]: {
				type: 'string',
				description: nls.localize('contributes.notebook.provider.displayName', 'Human readable name of the notebook.'),
			},
			[NotebookEditorContribution.selector]: {
				type: 'array',
				description: nls.localize('contributes.notebook.provider.selector', 'Set of globs that the notebook is for.'),
				items: {
					type: 'object',
					properties: {
						filenamePattern: {
							type: 'string',
							description: nls.localize('contributes.notebook.provider.selector.filenamePattern', 'Glob that the notebook is enabled for.'),
						},
						excludeFileNamePattern: {
							type: 'string',
							description: nls.localize('contributes.notebook.selector.provider.excludeFileNamePattern', 'Glob that the notebook is disabled for.')
						}
					}
				}
			},
			[NotebookEditorContribution.priority]: {
				type: 'string',
				markdownDeprecationMessage: nls.localize('contributes.priority', 'Controls if the custom editor is enabled automatically when the user opens a file. This may be overridden by users using the `workbench.editorAssociations` setting.'),
				enum: [
					NotebookEditorPriority.default,
					NotebookEditorPriority.option,
				],
				markdownEnumDescriptions: [
					nls.localize('contributes.priority.default', 'The editor is automatically used when the user opens a resource, provided that no other default custom editors are registered for that resource.'),
					nls.localize('contributes.priority.option', 'The editor is not automatically used when the user opens a resource, but a user can switch to the editor using the `Reopen With` command.'),
				],
				default: 'default'
			}
		}
	}
};

const defaultRendererSnippet = Object.freeze({ id: '', displayName: '', mimeTypes: [''], entrypoint: '' });

const notebookRendererContribution: IJSONSchema = {
	description: nls.localize('contributes.notebook.renderer', 'Contributes notebook output renderer provider.'),
	type: 'array',
	defaultSnippets: [{ body: [defaultRendererSnippet] }],
	items: {
		defaultSnippets: [{ body: defaultRendererSnippet }],
		allOf: [
			{
				type: 'object',
				required: [
					NotebookRendererContribution.id,
					NotebookRendererContribution.displayName,
				],
				properties: {
					[NotebookRendererContribution.id]: {
						type: 'string',
						description: nls.localize('contributes.notebook.renderer.viewType', 'Unique identifier of the notebook output renderer.'),
					},
					[NotebookRendererContribution.displayName]: {
						type: 'string',
						description: nls.localize('contributes.notebook.renderer.displayName', 'Human readable name of the notebook output renderer.'),
					},
					[NotebookRendererContribution.hardDependencies]: {
						type: 'array',
						uniqueItems: true,
						items: { type: 'string' },
						markdownDescription: nls.localize('contributes.notebook.renderer.hardDependencies', 'List of kernel dependencies the renderer requires. If any of the dependencies are present in the `NotebookKernel.preloads`, the renderer can be used.'),
					},
					[NotebookRendererContribution.optionalDependencies]: {
						type: 'array',
						uniqueItems: true,
						items: { type: 'string' },
						markdownDescription: nls.localize('contributes.notebook.renderer.optionalDependencies', 'List of soft kernel dependencies the renderer can make use of. If any of the dependencies are present in the `NotebookKernel.preloads`, the renderer will be preferred over renderers that don\'t interact with the kernel.'),
					},
					[NotebookRendererContribution.requiresMessaging]: {
						default: 'never',
						enum: [
							'always',
							'optional',
							'never',
						],
						enumDescriptions: [
							nls.localize('contributes.notebook.renderer.requiresMessaging.always', 'Messaging is required. The renderer will only be used when it\'s part of an extension that can be run in an extension host.'),
							nls.localize('contributes.notebook.renderer.requiresMessaging.optional', 'The renderer is better with messaging available, but it\'s not requried.'),
							nls.localize('contributes.notebook.renderer.requiresMessaging.never', 'The renderer does not require messaging.'),
						],
						description: nls.localize('contributes.notebook.renderer.requiresMessaging', 'Defines how and if the renderer needs to communicate with an extension host, via `createRendererMessaging`. Renderers with stronger messaging requirements may not work in all environments.'),
					},
				}
			},
			{
				oneOf: [
					{
						required: [
							NotebookRendererContribution.entrypoint,
							NotebookRendererContribution.mimeTypes,
						],
						properties: {
							[NotebookRendererContribution.mimeTypes]: {
								type: 'array',
								description: nls.localize('contributes.notebook.selector', 'Set of globs that the notebook is for.'),
								items: {
									type: 'string'
								}
							},
							[NotebookRendererContribution.entrypoint]: {
								description: nls.localize('contributes.notebook.renderer.entrypoint', 'File to load in the webview to render the extension.'),
								type: 'string',
							},
						}
					},
					{
						required: [
							NotebookRendererContribution.entrypoint,
						],
						properties: {
							[NotebookRendererContribution.entrypoint]: {
								description: nls.localize('contributes.notebook.renderer.entrypoint', 'File to load in the webview to render the extension.'),
								type: 'object',
								required: ['extends', 'path'],
								properties: {
									extends: {
										type: 'string',
										description: nls.localize('contributes.notebook.renderer.entrypoint.extends', 'Existing renderer that this one extends.'),
									},
									path: {
										type: 'string',
										description: nls.localize('contributes.notebook.renderer.entrypoint', 'File to load in the webview to render the extension.'),
									},
								}
							},
						}
					}
				]
			}
		]
	}
};

const notebookPreloadContribution: IJSONSchema = {
	description: nls.localize('contributes.preload.provider', 'Contributes notebook preloads.'),
	type: 'array',
	defaultSnippets: [{ body: [{ type: '', entrypoint: '' }] }],
	items: {
		type: 'object',
		required: [
			NotebookPreloadContribution.type,
			NotebookPreloadContribution.entrypoint
		],
		properties: {
			[NotebookPreloadContribution.type]: {
				type: 'string',
				description: nls.localize('contributes.preload.provider.viewType', 'Type of the notebook.'),
			},
			[NotebookPreloadContribution.entrypoint]: {
				type: 'string',
				description: nls.localize('contributes.preload.entrypoint', 'Path to file loaded in the webview.'),
			},
		}
	}
};

export const notebooksExtensionPoint = ExtensionsRegistry.registerExtensionPoint<INotebookEditorContribution[]>({
	extensionPoint: 'notebooks',
	jsonSchema: notebookProviderContribution
});

export const notebookRendererExtensionPoint = ExtensionsRegistry.registerExtensionPoint<INotebookRendererContribution[]>({
	extensionPoint: 'notebookRenderer',
	jsonSchema: notebookRendererContribution
});

export const notebookPreloadExtensionPoint = ExtensionsRegistry.registerExtensionPoint<INotebookPreloadContribution[]>({
	extensionPoint: 'notebookPreload',
	jsonSchema: notebookPreloadContribution,
});
