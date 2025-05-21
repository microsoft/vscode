/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, isFalsyOrEmpty } from '../../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableFromEvent, observableSignalFromEvent, autorun } from '../../../../../base/common/observable.js';
import { basename, joinPath } from '../../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType, isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolDataSource } from '../../common/languageModelToolsService.js';
import { IRawToolSetContribution } from '../../common/tools/languageModelToolsContribution.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isValidBasename } from '../../../../../base/common/extpath.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { parse } from '../../../../../base/common/jsonc.js';
import * as json from '../../../../../base/common/json.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import * as JSONContributionRegistry from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { CompletionItem, CompletionItemKind, CompletionItemRanges } from '../../../../../editor/common/languages.js';
import { Range } from '../../../../../editor/common/core/range.js';


const toolSetSchemaId = 'vscode://schemas/toolsets';
const toolSetsSchema: IJSONSchema = {
	id: toolSetSchemaId,
	allowComments: true,
	allowTrailingCommas: true,
	defaultSnippets: [{
		label: localize('schema.default', "Empty tool set"),
		body: { '${1:toolSetName}': { 'tools': ['${2:toolName}'], 'description': '${3:description}', 'icon': '${4:$(tools)}' } }
	}],
	type: 'object',
	description: localize('toolsetSchema.json', 'User tool sets configuration'),

	additionalProperties: {
		type: 'object',
		required: ['tools'],
		additionalProperties: false,
		properties: {
			tools: {
				description: localize('schema.tools', "A list of tools to include in this tool set."),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			icon: {
				description: localize('schema.icon', "Icon to use for this tool set in the UI. Uses the `\\$(name)`-syntax, like `\\$(zap)`"),
				type: 'string'
			},
			description: {
				description: localize('schema.description', "A short description of this tool set."),
				type: 'string'
			},
		},
	}
};

const reg = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);
reg.registerSchema(toolSetSchemaId, toolSetsSchema);

abstract class RawToolSetsShape {

	static readonly suffix = '.toolsets.jsonc';

	static isToolSetFileName(uri: URI): boolean {
		return basename(uri).endsWith(RawToolSetsShape.suffix);
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

export class UserToolSetsContributions extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.userToolSets';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
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

		this._store.add(instantiationService.createInstance(ToolSetsFileValidation));
		this._store.add(instantiationService.createInstance(ToolsSetsCompletions));
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
					const rawObj = parse(content.value.toString());
					data = RawToolSetsShape.from(rawObj);

				} catch (err) {
					this._logService.trace(`Error reading tool set file ${entry.resource.toString()}:`, err);
					continue;
				}

				if (cts.token.isCancellationRequested) {
					store.dispose();
					break;
				}

				for (const [name, value] of data.entries) {

					const tools = coalesce(value.tools.map(toolName => this._languageModelToolsService.getToolByName(toolName)));

					if (tools.length === 0) {
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

class ToolCompletionItem implements CompletionItem {

	readonly label: string;
	readonly filterText: string;
	readonly insertText: string;
	readonly sortText: string | undefined;
	readonly detail: string;
	readonly range: CompletionItemRanges;
	readonly kind = CompletionItemKind.Tool;

	constructor(tool: IToolData, range: CompletionItemRanges) {
		this.label = tool.toolReferenceName ?? tool.id;
		this.range = range;
		this.filterText = `"${tool.toolReferenceName}"`;
		this.insertText = `"${tool.toolReferenceName}"`;
		this.range = range;
		this.detail = localize('tool_source_completion', "{0}: {1}", tool.source.label, tool.displayName);

		const data = ToolDataSource.classify(tool.source);
		this.sortText = `${data.ordinal}/${data.label}/${this.label}/${tool.tags?.join() ?? ''}`;
	}
}

class ToolsSetsCompletions extends Disposable {

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
	) {
		super();

		this._register(languageFeaturesService.completionProvider.register(
			{
				scheme: userDataProfileService.currentProfile.promptsHome.scheme,
				pattern: `${userDataProfileService.currentProfile.promptsHome.fsPath}/*${RawToolSetsShape.suffix}`,
				language: 'jsonc',
			},
			{
				_debugDisplayName: 'Tool Sets Completions',

				provideCompletionItems(model, position, context, token) {

					const offset = model.getOffsetAt(position);

					const jsonLoc = json.getLocation(model.getValue(), offset);

					if (!jsonLoc.matches(['*', 'tools', '*'])) {
						return undefined;
					}

					const usedToolNames = new Set<string>();
					visitTools(model.getValue(), (toolName) => usedToolNames.add(toolName));

					let replaceRange = Range.fromPositions(position);
					if (jsonLoc.previousNode) {
						const start = model.getPositionAt(jsonLoc.previousNode.offset);
						const end = model.getPositionAt(jsonLoc.previousNode.offset + jsonLoc.previousNode.length);
						replaceRange = Range.fromPositions(start, end);
					}

					const insertRange = Range.fromPositions(replaceRange.getStartPosition(), position);
					const range: CompletionItemRanges = { replace: replaceRange, insert: insertRange };
					const suggestions: ToolCompletionItem[] = [];

					for (const tool of toolsService.getTools()) {
						if (tool.canBeReferencedInPrompt && tool.toolReferenceName && !usedToolNames.has(tool.toolReferenceName)) {
							suggestions.push(new ToolCompletionItem(tool, range));
						}
					}
					return { suggestions };
				}
			}
		));
	}
}

class ToolSetsFileValidation extends Disposable {

	constructor(
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IModelService modelService: IModelService,
	) {
		super();

		const map = this._store.add(new DisposableMap<ITextModel>());
		const handleNewModel = (model: ITextModel) => {
			if (RawToolSetsShape.isToolSetFileName(model.uri)) {
				map.set(model, this._setupValidation(model));
			}
		};

		this._store.add(modelService.onModelRemoved(model => map.deleteAndDispose(model)));
		this._store.add(modelService.onModelAdded(handleNewModel));
		modelService.getModels().forEach(handleNewModel);
	}

	private _setupValidation(model: ITextModel): IDisposable {

		const markerOwner = 'chatToolSetValidation';
		const store = new DisposableStore();

		const validate = () => {

			const newMarker: IMarkerData[] = [];

			if (model.isAttachedToEditor()) {

				const text = model.getValue();
				const toolsService = this._toolsService;
				visitTools(text, (toolName, offset, length) => {
					if (!toolsService.getToolByName(toolName)) {
						const start = model.getPositionAt(offset);
						const end = model.getPositionAt(offset + length);
						newMarker.push({
							severity: MarkerSeverity.Warning,
							startLineNumber: start.lineNumber,
							startColumn: start.column,
							endLineNumber: end.lineNumber,
							endColumn: end.column,
							message: localize('toolNotFound', "Tool '{0}' not found.", toolName),
						});
					}
				});
			}

			this._markerService.changeOne(markerOwner, model.uri, newMarker);
		};

		const validateSoon = store.add(new RunOnceScheduler(() => validate(), 1000));

		store.add(model.onDidChangeContent(() => validateSoon.schedule()));
		store.add(model.onDidChangeAttached(() => validateSoon.schedule(0)));
		store.add(this._toolsService.onDidChangeTools(() => validateSoon.schedule(0)));
		validate();
		return store;
	}
}


function visitTools(text: string, onTool: (toolName: string, offset: number, length: number) => void): void {
	let _inTools = false;
	let _inToolsArray = false;
	json.visit(text, {
		onObjectProperty(property: string) {
			_inTools = property === 'tools';
		},
		onArrayBegin() {
			_inToolsArray = _inTools;
		},
		onArrayEnd() {
			_inToolsArray = false;
		},
		onLiteralValue(value: string, offset: number, length: number) {
			if (_inToolsArray) {
				onTool(value, offset, length);
			}
		}
	});
}

// ---- actions

export class ConfigureToolSets extends Action2 {

	static readonly ID = 'chat.configureToolSets';

	constructor() {
		super({
			id: ConfigureToolSets.ID,
			title: localize2('chat.configureToolSets', 'Configure Tool Sets...'),
			category: CHAT_CATEGORY,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {

		const toolsService = accessor.get(ILanguageModelToolsService);
		const quickInputService = accessor.get(IQuickInputService);
		const editorService = accessor.get(IEditorService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const fileService = accessor.get(IFileService);
		const textFileService = accessor.get(ITextFileService);

		const picks: ((IQuickPickItem & { toolset?: IToolSet }) | IQuickPickSeparator)[] = [];

		for (const toolSet of toolsService.toolSets.get()) {
			if (toolSet.source.type !== 'user') {
				continue;
			}

			picks.push({
				label: toolSet.displayName,
				toolset: toolSet,
				tooltip: toolSet.description,
				iconClass: ThemeIcon.asClassName(toolSet.icon)
			});
		}

		if (picks.length !== 0) {
			picks.push({ type: 'separator' });
		}

		picks.push({
			label: localize('chat.configureToolSets.add', 'Add Tool Sets File...'),
			alwaysShow: true,
			iconClass: ThemeIcon.asClassName(Codicon.tools)
		});


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
					'// \t\t\t"toolName"',
					'// \t\t],',
					'// \t\t"description": "description",',
					'// \t\t"icon": "$(tools)"',
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
