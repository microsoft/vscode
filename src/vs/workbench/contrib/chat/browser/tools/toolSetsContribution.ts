/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFalsyOrEmpty } from '../../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableFromEvent, observableSignalFromEvent, autorun, transaction } from '../../../../../base/common/observable.js';
import { basename, joinPath } from '../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType, isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';
import { IRawToolSetContribution } from '../../common/tools/languageModelToolsContribution.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon, getAllCodicons } from '../../../../../base/common/codicons.js';
import { isValidBasename } from '../../../../../base/common/extpath.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { parse } from '../../../../../base/common/jsonc.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import * as JSONContributionRegistry from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatViewId } from '../chat.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';


const toolEnumValues: string[] = [];
const toolEnumDescriptions: string[] = [];

const toolSetSchemaId = 'vscode://schemas/toolsets';
const toolSetsSchema: IJSONSchema = {
	id: toolSetSchemaId,
	allowComments: true,
	allowTrailingCommas: true,
	defaultSnippets: [{
		label: localize('schema.default', "Empty tool set"),
		body: { '${1:toolSetName}': { 'tools': ['${2:someTool}', '${3:anotherTool}'], 'description': '${4:description}', 'icon': '${5:tools}' } }
	}],
	type: 'object',
	description: localize('toolsetSchema.json', 'User tool sets configuration'),

	additionalProperties: {
		type: 'object',
		required: ['tools'],
		additionalProperties: false,
		properties: {
			tools: {
				description: localize('schema.tools', "A list of tools or tool sets to include in this tool set. Cannot be empty and must reference tools the way they are referenced in prompts."),
				type: 'array',
				minItems: 1,
				items: {
					type: 'string',
					enum: toolEnumValues,
					enumDescriptions: toolEnumDescriptions,
				}
			},
			icon: {
				description: localize('schema.icon', 'Icon to use for this tool set in the UI. Uses the "\\$(name)"-syntax, like "\\$(zap)"'),
				type: 'string',
				enum: Array.from(getAllCodicons(), icon => icon.id),
				markdownEnumDescriptions: Array.from(getAllCodicons(), icon => `$(${icon.id})`),
			},
			description: {
				description: localize('schema.description', "A short description of this tool set."),
				type: 'string'
			},
		},
	}
};

const reg = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);


abstract class RawToolSetsShape {

	static readonly suffix = '.toolsets.jsonc';

	static isToolSetFileName(uri: URI): boolean {
		return basename(uri).endsWith(RawToolSetsShape.suffix);
	}

	static from(data: unknown, logService: ILogService) {
		if (!isObject(data)) {
			throw new Error(`Invalid tool set data`);
		}

		const map = new Map<string, Exclude<IRawToolSetContribution, 'name'>>();

		for (const [name, value] of Object.entries(data as RawToolSetsShape)) {

			if (isFalsyOrWhitespace(name)) {
				logService.error(`Tool set name cannot be empty`);
			}
			if (isFalsyOrEmpty(value.tools)) {
				logService.error(`Tool set '${name}' cannot have an empty tools array`);
			}

			map.set(name, {
				name,
				tools: value.tools,
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

export class UserToolSetsContributions extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.userToolSets';

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		Promise.allSettled([
			extensionService.whenInstalledExtensionsRegistered,
			lifecycleService.when(LifecyclePhase.Restored)
		]).then(() => this._initToolSets());

		const toolsObs = observableFromEvent(this, _languageModelToolsService.onDidChangeTools, () => Array.from(_languageModelToolsService.getTools()));
		const store = this._store.add(new DisposableStore());

		this._store.add(autorun(r => {
			const tools = toolsObs.read(r);
			const toolSets = this._languageModelToolsService.toolSets.read(r);


			type ToolDesc = {
				name: string;
				sourceLabel: string;
				sourceOrdinal: number;
				description?: string;
			};

			const data: ToolDesc[] = [];
			for (const tool of tools) {
				if (tool.canBeReferencedInPrompt) {
					data.push({
						name: tool.toolReferenceName ?? tool.displayName,
						sourceLabel: ToolDataSource.classify(tool.source).label,
						sourceOrdinal: ToolDataSource.classify(tool.source).ordinal,
						description: tool.userDescription ?? tool.modelDescription
					});
				}
			}
			for (const toolSet of toolSets) {
				data.push({
					name: toolSet.referenceName,
					sourceLabel: ToolDataSource.classify(toolSet.source).label,
					sourceOrdinal: ToolDataSource.classify(toolSet.source).ordinal,
					description: toolSet.description
				});
			}

			toolEnumValues.length = 0;
			toolEnumDescriptions.length = 0;

			data.sort((a, b) => {
				if (a.sourceOrdinal !== b.sourceOrdinal) {
					return a.sourceOrdinal - b.sourceOrdinal;
				}
				if (a.sourceLabel !== b.sourceLabel) {
					return a.sourceLabel.localeCompare(b.sourceLabel);
				}
				return a.name.localeCompare(b.name);
			});

			for (const item of data) {
				toolEnumValues.push(item.name);
				toolEnumDescriptions.push(localize('tool.description', "{1} ({0})\n\n{2}", item.sourceLabel, item.name, item.description));
			}

			store.clear(); // reset old schema
			reg.registerSchema(toolSetSchemaId, toolSetsSchema, store);
		}));

	}

	private _initToolSets(): void {

		const promptFolder = observableFromEvent(this, this._userDataProfileService.onDidChangeCurrentProfile, () => this._userDataProfileService.currentProfile.promptsHome);

		const toolsSig = observableSignalFromEvent(this, this._languageModelToolsService.onDidChangeTools);
		const fileEventSig = observableSignalFromEvent(this, Event.filter(this._fileService.onDidFilesChange, e => e.affects(promptFolder.get())));

		const store = this._store.add(new DisposableStore());

		const getFilesInFolder = async (folder: URI) => {
			try {
				return (await this._fileService.resolve(folder)).children ?? [];
			} catch (err) {
				return []; // folder does not exist or cannot be read
			}
		};

		this._store.add(autorun(async r => {

			store.clear();

			toolsSig.read(r); // SIGNALS
			fileEventSig.read(r);

			const uri = promptFolder.read(r);

			const cts = new CancellationTokenSource();
			store.add(toDisposable(() => cts.dispose(true)));

			const entries = await getFilesInFolder(uri);

			if (cts.token.isCancellationRequested) {
				return;
			}

			for (const entry of entries) {

				if (!entry.isFile || !RawToolSetsShape.isToolSetFileName(entry.resource)) {
					// not interesting
					continue;
				}

				// watch this file
				store.add(this._fileService.watch(entry.resource));

				let data: RawToolSetsShape | undefined;
				try {
					const content = await this._fileService.readFile(entry.resource, undefined, cts.token);
					const rawObj = parse(content.value.toString());
					data = RawToolSetsShape.from(rawObj, this._logService);

				} catch (err) {
					this._logService.error(`Error reading tool set file ${entry.resource.toString()}:`, err);
					continue;
				}

				if (cts.token.isCancellationRequested) {
					return;
				}

				for (const [name, value] of data.entries) {

					const tools: IToolData[] = [];
					const toolSets: ToolSet[] = [];
					value.tools.forEach(name => {
						const tool = this._languageModelToolsService.getToolByName(name);
						if (tool) {
							tools.push(tool);
							return;
						}
						const toolSet = this._languageModelToolsService.getToolSetByName(name);
						if (toolSet) {
							toolSets.push(toolSet);
							return;
						}
					});

					if (tools.length === 0 && toolSets.length === 0) {
						// NO tools in this set
						continue;
					}

					const toolset = this._languageModelToolsService.createToolSet(
						{ type: 'user', file: entry.resource, label: basename(entry.resource) },
						`user/${entry.resource.toString()}/${name}`,
						name,
						{
							// toolReferenceName: value.referenceName,
							icon: value.icon ? ThemeIcon.fromId(value.icon) : undefined,
							description: value.description
						}
					);

					transaction(tx => {
						store.add(toolset);
						tools.forEach(tool => store.add(toolset.addTool(tool, tx)));
						toolSets.forEach(toolSet => store.add(toolset.addToolSet(toolSet, tx)));
					});
				}
			}
		}));
	}
}

// ---- actions

export class ConfigureToolSets extends Action2 {

	static readonly ID = 'chat.configureToolSets';

	constructor() {
		super({
			id: ConfigureToolSets.ID,
			title: localize2('chat.configureToolSets', 'Configure Tool Sets...'),
			shortTitle: localize('chat.configureToolSets.short', "Tool Sets"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.Tools.toolsCount.greater(0)),
			menu: {
				id: CHAT_CONFIG_MENU_ID,
				when: ContextKeyExpr.equals('view', ChatViewId),
				order: 11,
				group: '2_level'
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {

		const toolsService = accessor.get(ILanguageModelToolsService);
		const quickInputService = accessor.get(IQuickInputService);
		const editorService = accessor.get(IEditorService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const fileService = accessor.get(IFileService);
		const textFileService = accessor.get(ITextFileService);

		const picks: ((IQuickPickItem & { toolset?: ToolSet }) | IQuickPickSeparator)[] = [];

		picks.push({
			label: localize('chat.configureToolSets.add', 'Create new tool sets file...'),
			alwaysShow: true,
			iconClass: ThemeIcon.asClassName(Codicon.plus)
		});

		for (const toolSet of toolsService.toolSets.get()) {
			if (toolSet.source.type !== 'user') {
				continue;
			}

			picks.push({
				label: toolSet.referenceName,
				toolset: toolSet,
				tooltip: toolSet.description,
				iconClass: ThemeIcon.asClassName(toolSet.icon)
			});
		}

		const pick = await quickInputService.pick(picks, {
			canPickMany: false,
			placeHolder: localize('chat.configureToolSets.placeholder', 'Select a tool set to configure'),
		});

		if (!pick) {
			return; // user cancelled
		}

		let resource: URI | undefined;

		if (!pick.toolset) {

			const name = await quickInputService.input({
				placeHolder: localize('input.placeholder', "Type tool sets file name"),
				validateInput: async (input) => {
					if (!input) {
						return localize('bad_name1', "Invalid file name");
					}
					if (!isValidBasename(input)) {
						return localize('bad_name2', "'{0}' is not a valid file name", input);
					}
					return undefined;
				}
			});

			if (isFalsyOrWhitespace(name)) {
				return; // user cancelled
			}

			resource = joinPath(userDataProfileService.currentProfile.promptsHome, `${name}${RawToolSetsShape.suffix}`);

			if (!await fileService.exists(resource)) {
				await textFileService.write(resource, [
					'// Place your tool sets here...',
					'// Example:',
					'// {',
					'// \t"toolSetName": {',
					'// \t\t"tools": [',
					'// \t\t\t"someTool",',
					'// \t\t\t"anotherTool"',
					'// \t\t],',
					'// \t\t"description": "description",',
					'// \t\t"icon": "tools"',
					'// \t}',
					'// }',
				].join('\n'));
			}

		} else {
			assertType(pick.toolset.source.type === 'user');
			resource = pick.toolset.source.file;
		}

		await editorService.openEditor({ resource, options: { pinned: true } });
	}
}
