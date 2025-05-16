/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, isFalsyOrEmpty } from '../../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { basename, joinPath } from '../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../languageModelToolsService.js';
import { toolsParametersSchemaSchemaId } from './languageModelToolsParametersSchema.js';

export interface IRawToolContribution {
	name: string;
	displayName: string;
	modelDescription: string;
	toolReferenceName?: string;
	icon?: string | { light: string; dark: string };
	when?: string;
	tags?: string[];
	userDescription?: string;
	inputSchema?: IJSONSchema;
	canBeReferencedInPrompt?: boolean;
}

const languageModelToolsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawToolContribution[]>({
	extensionPoint: 'languageModelTools',
	activationEventsGenerator: (contributions: IRawToolContribution[], result) => {
		for (const contrib of contributions) {
			result.push(`onLanguageModelTool:${contrib.name}`);
		}
	},
	jsonSchema: {
		description: localize('vscode.extension.contributes.tools', 'Contributes a tool that can be invoked by a language model in a chat session, or from a standalone command. Registered tools can be used by all extensions.'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{
				body: {
					name: '${1}',
					modelDescription: '${2}',
					inputSchema: {
						type: 'object',
						properties: {
							'${3:name}': {
								type: 'string',
								description: '${4:description}'
							}
						}
					},
				}
			}],
			required: ['name', 'displayName', 'modelDescription'],
			properties: {
				name: {
					description: localize('toolName', "A unique name for this tool. This name must be a globally unique identifier, and is also used as a name when presenting this tool to a language model."),
					type: 'string',
					// [\\w-]+ is OpenAI's requirement for tool names
					pattern: '^(?!copilot_|vscode_)[\\w-]+$'
				},
				toolReferenceName: {
					markdownDescription: localize('toolName2', "If {0} is enabled for this tool, the user may use '#' with this name to invoke the tool in a query. Otherwise, the name is not required. Name must not contain whitespace.", '`canBeReferencedInPrompt`'),
					type: 'string',
					pattern: '^[\\w-]+$'
				},
				displayName: {
					description: localize('toolDisplayName', "A human-readable name for this tool that may be used to describe it in the UI."),
					type: 'string'
				},
				userDescription: {
					description: localize('toolUserDescription', "A description of this tool that may be shown to the user."),
					type: 'string'
				},
				modelDescription: {
					description: localize('toolModelDescription', "A description of this tool that may be used by a language model to select it."),
					type: 'string'
				},
				inputSchema: {
					description: localize('parametersSchema', "A JSON schema for the input this tool accepts. The input must be an object at the top level. A particular language model may not support all JSON schema features. See the documentation for the language model family you are using for more information."),
					$ref: toolsParametersSchemaSchemaId
				},
				canBeReferencedInPrompt: {
					markdownDescription: localize('canBeReferencedInPrompt', "If true, this tool shows up as an attachment that the user can add manually to their request. Chat participants will receive the tool in {0}.", '`ChatRequest#toolReferences`'),
					type: 'boolean'
				},
				icon: {
					markdownDescription: localize('icon', "An icon that represents this tool. Either a file path, an object with file paths for dark and light themes, or a theme icon reference, like `$(zap)`"),
					anyOf: [{
						type: 'string'
					},
					{
						type: 'object',
						properties: {
							light: {
								description: localize('icon.light', 'Icon path when a light theme is used'),
								type: 'string'
							},
							dark: {
								description: localize('icon.dark', 'Icon path when a dark theme is used'),
								type: 'string'
							}
						}
					}]
				},
				when: {
					markdownDescription: localize('condition', "Condition which must be true for this tool to be enabled. Note that a tool may still be invoked by another extension even when its `when` condition is false."),
					type: 'string'
				},
				tags: {
					description: localize('toolTags', "A set of tags that roughly describe the tool's capabilities. A tool user may use these to filter the set of tools to just ones that are relevant for the task at hand, or they may want to pick a tag that can be used to identify just the tools contributed by this extension."),
					type: 'array',
					items: {
						type: 'string',
						pattern: '^(?!copilot_|vscode_)'
					}
				}
			}
		}
	}
});

export interface IRawToolSetContribution {
	name: string;
	referenceName?: string;
	description: string;
	icon?: string;
	tools: string[];
}

const languageModelToolSetsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawToolSetContribution[]>({
	extensionPoint: 'languageModelToolSets',
	deps: [languageModelToolsExtensionPoint],
	jsonSchema: {
		description: localize('vscode.extension.contributes.toolSets', 'Contributes a set of language model tools that can be used together.'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{
				body: {
					name: '${1}',
					description: '${2}',
					tools: ['${3}']
				}
			}],
			required: ['name', 'description', 'tools'],
			properties: {
				name: {
					description: localize('toolSetName', "A name for this tool set."),
					type: 'string',
				},
				referenceName: {
					description: localize('toolSetReferenceName', "A name that users can use to reference this tool set. Name must not contain whitespace."),
					type: 'string',
					pattern: '^[\\w-]+$'
				},
				description: {
					description: localize('toolSetDescription', "A description of this tool set."),
					type: 'string'
				},
				icon: {
					markdownDescription: localize('toolSetIcon', "An icon that represents this tool set, like `$(zap)`"),
					type: 'string'
				},
				tools: {
					description: localize('toolSetTools', "An array of tool names that are part of this set."),
					type: 'array',
					items: {
						type: 'string'
					}
				}
			}
		}
	}
});

function toToolKey(extensionIdentifier: ExtensionIdentifier, toolName: string) {
	return `${extensionIdentifier.value}/${toolName}`;
}

function toToolSetKey(extensionIdentifier: ExtensionIdentifier, toolName: string) {
	return `toolset:${extensionIdentifier.value}/${toolName}`;
}

export class LanguageModelToolsExtensionPointHandler extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.toolsExtensionPointHandler';

	private _registrationDisposables = new DisposableMap<string>();

	constructor(
		@IProductService productService: IProductService,
		@IExtensionService extensionService: IExtensionService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		languageModelToolsExtensionPoint.setHandler((_extensions, delta) => {
			for (const extension of delta.added) {
				for (const rawTool of extension.value) {
					if (!rawTool.name || !rawTool.modelDescription || !rawTool.displayName) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool without name, modelDescription, and displayName: ${JSON.stringify(rawTool)}`);
						continue;
					}

					if (!rawTool.name.match(/^[\w-]+$/)) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with invalid id: ${rawTool.name}. The id must match /^[\\w-]+$/.`);
						continue;
					}

					if (rawTool.canBeReferencedInPrompt && !rawTool.toolReferenceName) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with 'canBeReferencedInPrompt' set without a 'toolReferenceName': ${JSON.stringify(rawTool)}`);
						continue;
					}

					if ((rawTool.name.startsWith('copilot_') || rawTool.name.startsWith('vscode_')) && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with name starting with "vscode_" or "copilot_"`);
						continue;
					}

					if (rawTool.tags?.some(tag => tag.startsWith('copilot_') || tag.startsWith('vscode_')) && !isProposedApiEnabled(extension.description, 'chatParticipantPrivate')) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with tags starting with "vscode_" or "copilot_"`);
					}

					const rawIcon = rawTool.icon;
					let icon: IToolData['icon'] | undefined;
					if (typeof rawIcon === 'string') {
						icon = ThemeIcon.fromString(rawIcon) ?? {
							dark: joinPath(extension.description.extensionLocation, rawIcon),
							light: joinPath(extension.description.extensionLocation, rawIcon)
						};
					} else if (rawIcon) {
						icon = {
							dark: joinPath(extension.description.extensionLocation, rawIcon.dark),
							light: joinPath(extension.description.extensionLocation, rawIcon.light)
						};
					}

					// If OSS and the product.json is not set up, fall back to checking api proposal
					const isBuiltinTool = productService.defaultChatAgent?.chatExtensionId ?
						ExtensionIdentifier.equals(extension.description.identifier, productService.defaultChatAgent.chatExtensionId) :
						isProposedApiEnabled(extension.description, 'chatParticipantPrivate');
					const tool: IToolData = {
						...rawTool,
						source: { type: 'extension', label: extension.description.displayName ?? extension.description.name, extensionId: extension.description.identifier, isExternalTool: !isBuiltinTool },
						inputSchema: rawTool.inputSchema,
						id: rawTool.name,
						icon,
						when: rawTool.when ? ContextKeyExpr.deserialize(rawTool.when) : undefined,
						alwaysDisplayInputOutput: !isBuiltinTool,
					};
					const disposable = _languageModelToolsService.registerToolData(tool);
					this._registrationDisposables.set(toToolKey(extension.description.identifier, rawTool.name), disposable);
				}
			}

			for (const extension of delta.removed) {
				for (const tool of extension.value) {
					this._registrationDisposables.deleteAndDispose(toToolKey(extension.description.identifier, tool.name));
				}
			}
		});

		languageModelToolSetsExtensionPoint.setHandler((_extensions, delta) => {

			for (const extension of delta.added) {

				if (!isProposedApiEnabled(extension.description, 'contribLanguageModelToolSets')) {
					extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register language model tools because the 'contribLanguageModelToolSets' API proposal is not enabled.`);
					continue;
				}

				const source: ToolDataSource = {
					type: 'extension',
					extensionId: extension.description.identifier,
					label: extension.description.displayName ?? extension.description.name,
					isExternalTool: !productService.defaultChatAgent?.chatExtensionId || !ExtensionIdentifier.equals(extension.description.identifier, productService.defaultChatAgent.chatExtensionId)
				};

				for (const toolSet of extension.value) {

					if (isFalsyOrWhitespace(toolSet.name)) {
						extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty name`);
						continue;
					}

					if (isFalsyOrEmpty(toolSet.tools)) {
						extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array`);
						continue;
					}

					const obj = _languageModelToolsService.createToolSet(
						source,
						toToolSetKey(extension.description.identifier, toolSet.name),
						toolSet.name,
						{ icon: toolSet.icon ? ThemeIcon.fromString(toolSet.icon) : undefined, toolReferenceName: toolSet.referenceName, description: toolSet.description }
					);

					let actualToolCount = 0;

					for (const toolName of toolSet.tools) {
						const toolObj = _languageModelToolsService.getToolByName(toolName);
						if (!toolObj) {
							extension.collector.warn(`Tool set '${toolSet.name}' CANNOT find tool by name: ${toolName}`);
							continue;
						}
						obj.tools.add(toolObj);
						actualToolCount += 1;
					}

					if (actualToolCount === 0) {
						extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array (none of the tools were found)`);
						obj.dispose();
						continue;
					}

					this._registrationDisposables.set(toToolSetKey(extension.description.identifier, toolSet.name), obj);
				}
			}

			for (const extension of delta.removed) {
				for (const toolSet of extension.value) {
					this._registrationDisposables.deleteAndDispose(toToolSetKey(extension.description.identifier, toolSet.name));
				}
			}
		});

		Promise.allSettled([
			extensionService.whenInstalledExtensionsRegistered,
			lifecycleService.when(LifecyclePhase.Restored)
		]).then(() => this._initToolSets());
	}

	private _initToolSets(): void {

		const promptFolder = observableFromEvent(this, this._userDataProfileService.onDidChangeCurrentProfile, () => this._userDataProfileService.currentProfile.promptsHome);

		const toolsSig = observableSignalFromEvent(this, this._languageModelToolsService.onDidChangeTools);
		const fileEventSig = observableSignalFromEvent(this, Event.filter(this._fileService.onDidFilesChange, e => e.affects(promptFolder.get())));

		const store = this._store.add(new DisposableStore());

		this._store.add(autorun(async r => {

			store.clear();

			toolsSig.read(r); // SIGNALS
			fileEventSig.read(r);

			const uri = promptFolder.read(r);

			const cts = new CancellationTokenSource();
			store.add(toDisposable(() => cts.dispose(true)));

			const stat = await this._fileService.resolve(uri);

			if (cts.token.isCancellationRequested) {
				store.clear();
			}

			for (const entry of stat.children ?? []) {

				if (!entry.isFile || !RawToolSetsShape.isToolSetFileName(entry.resource)) {
					// not interesting
					continue;
				}

				// watch this file
				store.add(this._fileService.watch(entry.resource));

				let data: RawToolSetsShape | undefined;
				try {
					const content = await this._fileService.readFile(entry.resource, undefined, cts.token);
					const rawObj = JSON.parse(content.value.toString());
					data = RawToolSetsShape.from(rawObj);

				} catch (err) {
					this._logService.error(`Error reading tool set file ${entry.resource.toString()}:`, err);
					continue;
				}

				if (cts.token.isCancellationRequested) {
					store.dispose();
					break;
				}

				for (const [name, value] of data.entries) {

					const tools = coalesce(value.tools.map(toolName => this._languageModelToolsService.getToolByName(toolName)));

					if (tools.length !== value.tools.length) {
						// NOT all tools found (too strict?)
						continue;
					}

					const toolset = this._languageModelToolsService.createToolSet(
						{ type: 'user', file: entry.resource, label: basename(entry.resource) },
						`user/${entry.resource.toString()}/${name}`,
						name,
						{
							// toolReferenceName: value.referenceName,
							icon: value.icon ? ThemeIcon.fromString(value.icon) : undefined,
							description: value.description
						}
					);
					store.add(toolset);
					tools.forEach(toolset.tools.add, toolset.tools);
				}
			}
		}));
	}

}

abstract class RawToolSetsShape {

	static isToolSetFileName(uri: URI): boolean {
		return basename(uri).endsWith('.toolset.json');
	}

	static from(data: unknown) {
		if (!isObject(data)) {
			throw new Error(`Invalid tool set data`);
		}

		const map = new Map<string, Exclude<IRawToolSetContribution, 'name'>>();

		for (const [name, value] of Object.entries(data as RawToolSetsShape)) {

			if (isFalsyOrWhitespace(name)) {
				throw new Error(`Tool set name cannot be empty`);
			}
			if (isFalsyOrEmpty(value.tools)) {
				throw new Error(`Tool set '${name}' cannot have an empty tools array`);
			}

			map.set(name, {
				name,
				tools: value.tools,
				referenceName: value.referenceName,
				description: value.description,
				icon: value.icon,
			});
		}

		return new class extends RawToolSetsShape { }(map);
	}


	entries: ReadonlyMap<string, Exclude<IRawToolSetContribution, 'name'>>;

	private constructor(entries: Map<string, Exclude<IRawToolSetContribution, 'name'>>) {
		this.entries = Object.freeze(new Map(entries));
	}
}


// --- render

class LanguageModelToolDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.languageModelTools;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contribs = manifest.contributes?.languageModelTools ?? [];
		if (!contribs.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('toolTableName', "Name"),
			localize('toolTableDisplayName', "Display Name"),
			localize('toolTableDescription', "Description"),
		];

		const rows: IRowData[][] = contribs.map(t => {
			return [
				new MarkdownString(`\`${t.name}\``),
				t.displayName,
				t.userDescription ?? t.modelDescription,
			];
		});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'languageModelTools',
	label: localize('langModelTools', "Language Model Tools"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(LanguageModelToolDataRenderer),
});


class LanguageModelToolSetDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.languageModelToolSets;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const contribs = manifest.contributes?.languageModelToolSets ?? [];
		if (!contribs.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('name', "Name"),
			localize('reference', "Reference Name"),
			localize('tools', "Tools"),
			localize('descriptions', "Description"),
		];

		const rows: IRowData[][] = contribs.map(t => {
			return [
				new MarkdownString(`\`${t.name}\``),
				t.referenceName ? new MarkdownString(`\`#${t.referenceName}\``) : 'none',
				t.tools.join(', '),
				t.description,
			];
		});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'languageModelToolSets',
	label: localize('langModelToolSets', "Language Model Tool Sets"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(LanguageModelToolSetDataRenderer),
});
