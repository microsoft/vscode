/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import * as glob from '../../../../../base/common/glob.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, dispose, isDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { basename, dirname, extUri, joinPath, relativePath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { Command, isLocation } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileKind, FileType, IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { PromptsConfig } from '../../../../../platform/prompts/common/config.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { getExcludes, IFileQuery, ISearchComplete, ISearchConfiguration, ISearchService, QueryType } from '../../../../services/search/common/search.js';
import { IChatRequestVariableValue, IDynamicVariable } from '../../common/chatVariables.js';
import { IChatWidget } from '../chat.js';
import { ChatWidget, IChatWidgetContrib } from '../chatWidget.js';
import { ChatFileReference } from './chatDynamicVariables/chatFileReference.js';

export const dynamicVariableDecorationType = 'chat-dynamic-variable';

/**
 * Type of dynamic variables. Can be either a file reference or
 * another dynamic variable (e.g., a `#sym`, `#kb`, etc.).
 */
type TDynamicVariable = IDynamicVariable | ChatFileReference;

export class ChatDynamicVariableModel extends Disposable implements IChatWidgetContrib {
	public static readonly ID = 'chatDynamicVariableModel';

	private _variables: TDynamicVariable[] = [];
	get variables(): ReadonlyArray<TDynamicVariable> {
		return [...this._variables];
	}

	get id() {
		return ChatDynamicVariableModel.ID;
	}

	private decorationData: { id: string; text: string }[] = [];

	constructor(
		private readonly widget: IChatWidget,
		@ILabelService private readonly labelService: ILabelService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(widget.inputEditor.onDidChangeModelContent(e => {

			const removed: TDynamicVariable[] = [];
			let didChange = false;

			// Don't mutate entries in _variables, since they will be returned from the getter
			this._variables = coalesce(this._variables.map((ref, idx): TDynamicVariable | null => {
				const model = widget.inputEditor.getModel();

				if (!model) {
					removed.push(ref);
					return null;
				}

				const data = this.decorationData[idx];
				const newRange = model.getDecorationRange(data.id);

				if (!newRange) {
					// gone
					removed.push(ref);
					return null;
				}

				const newText = model.getValueInRange(newRange);
				if (newText !== data.text) {

					this.widget.inputEditor.executeEdits(this.id, [{
						range: newRange,
						text: '',
					}]);
					this.widget.refreshParsedInput();

					removed.push(ref);
					return null;
				}

				if (newRange.equalsRange(ref.range)) {
					// all good
					return ref;
				}

				didChange = true;

				if (ref instanceof ChatFileReference) {
					ref.range = newRange;
					return ref;
				} else {
					return { ...ref, range: newRange };
				}
			}));

			// cleanup disposable variables
			dispose(removed.filter(isDisposable));

			if (didChange || removed.length > 0) {
				this.widget.refreshParsedInput();
			}

			this.updateDecorations();
		}));
	}

	getInputState(): any {
		return this.variables
			.map((variable: TDynamicVariable) => {
				// return underlying `IDynamicVariable` object for file references
				if (variable instanceof ChatFileReference) {
					return variable.reference;
				}

				return variable;
			});
	}

	setInputState(s: any): void {
		if (!Array.isArray(s)) {
			s = [];
		}

		this.disposeVariables();
		this._variables = [];

		for (const variable of s) {
			if (!isDynamicVariable(variable)) {
				continue;
			}

			this.addReference(variable);
		}
	}

	addReference(ref: IDynamicVariable): void {
		// use `ChatFileReference` for file references and `IDynamicVariable` for other variables
		const promptSnippetsEnabled = PromptsConfig.enabled(this.configService);
		const variable = (ref.id === 'vscode.file' && promptSnippetsEnabled)
			? this.instantiationService.createInstance(ChatFileReference, ref)
			: ref;

		this._variables.push(variable);
		this.updateDecorations();
		this.widget.refreshParsedInput();

		// if the `prompt snippets` feature is enabled, and file is a `prompt snippet`,
		// start resolving nested file references immediately and subscribe to updates
		if (variable instanceof ChatFileReference && variable.isPromptFile) {
			// subscribe to variable changes
			variable.onUpdate(() => {
				this.updateDecorations();
			});
			// start resolving the file references
			variable.start();
		}
	}

	private updateDecorations(): void {

		const decorationIds = this.widget.inputEditor.setDecorationsByType('chat', dynamicVariableDecorationType, this._variables.map((r): IDecorationOptions => ({
			range: r.range,
			hoverMessage: this.getHoverForReference(r)
		})));

		this.decorationData = [];
		for (let i = 0; i < decorationIds.length; i++) {
			this.decorationData.push({
				id: decorationIds[i],
				text: this.widget.inputEditor.getModel()!.getValueInRange(this._variables[i].range)
			});
		}
	}

	private getHoverForReference(ref: IDynamicVariable): IMarkdownString | undefined {
		const value = ref.data;
		if (URI.isUri(value)) {
			return new MarkdownString(this.labelService.getUriLabel(value, { relative: true }));
		} else if (isLocation(value)) {
			const prefix = ref.fullName ? ` ${ref.fullName}` : '';
			const rangeString = `#${value.range.startLineNumber}-${value.range.endLineNumber}`;
			return new MarkdownString(prefix + this.labelService.getUriLabel(value.uri, { relative: true }) + rangeString);
		} else {
			return undefined;
		}
	}

	/**
	 * Dispose all existing variables.
	 */
	private disposeVariables(): void {
		for (const variable of this._variables) {
			if (isDisposable(variable)) {
				variable.dispose();
			}
		}
	}

	public override dispose() {
		this.disposeVariables();
		super.dispose();
	}
}

/**
 * Loose check to filter objects that are obviously missing data
 */
function isDynamicVariable(obj: any): obj is IDynamicVariable {
	return obj &&
		typeof obj.id === 'string' &&
		Range.isIRange(obj.range) &&
		'data' in obj;
}

ChatWidget.CONTRIBS.push(ChatDynamicVariableModel);


export async function createFilesAndFolderQuickPick(accessor: ServicesAccessor): Promise<URI | undefined> {
	const quickInputService = accessor.get(IQuickInputService);
	const searchService = accessor.get(ISearchService);
	const configurationService = accessor.get(IConfigurationService);
	const workspaceService = accessor.get(IWorkspaceContextService);
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);
	const modelService = accessor.get(IModelService);
	const languageService = accessor.get(ILanguageService);
	const historyService = accessor.get(IHistoryService);

	type ResourcePick = IQuickPickItem & { resource: URI; kind: FileKind };

	const workspaces = workspaceService.getWorkspace().folders.map(folder => folder.uri);

	const defaultItems: ResourcePick[] = [];
	(await getTopLevelFolders(workspaces, fileService)).forEach(uri => defaultItems.push(createQuickPickItem(uri, FileKind.FOLDER)));
	historyService.getHistory().filter(a => a.resource).slice(0, 30).forEach(uri => defaultItems.push(createQuickPickItem(uri.resource!, FileKind.FILE)));
	defaultItems.sort((a, b) => extUri.compare(a.resource, b.resource));

	const quickPick = quickInputService.createQuickPick<ResourcePick>();
	quickPick.placeholder = 'Search folder by name';
	quickPick.items = defaultItems;

	return await new Promise<URI | undefined>(_resolve => {

		const disposables = new DisposableStore();
		const resolve = (res: URI | undefined) => {
			_resolve(res);
			disposables.dispose();
			quickPick.dispose();
		};

		disposables.add(quickPick.onDidChangeValue(async value => {
			if (value === '') {
				quickPick.items = defaultItems;
				return;
			}

			const picks: ResourcePick[] = [];

			await Promise.all(workspaces.map(async workspace => {
				const result = await searchFilesAndFolders(
					workspace,
					value,
					true,
					undefined,
					undefined,
					configurationService,
					searchService
				);

				for (const folder of result.folders) {
					picks.push(createQuickPickItem(folder, FileKind.FOLDER));
				}
				for (const file of result.files) {
					picks.push(createQuickPickItem(file, FileKind.FILE));
				}
			}));

			quickPick.items = picks.sort((a, b) => extUri.compare(a.resource, b.resource));
		}));

		disposables.add(quickPick.onDidAccept((e) => {
			const value = (quickPick.selectedItems[0] as any)?.resource;
			resolve(value);
		}));

		disposables.add(quickPick.onDidHide(() => {
			resolve(undefined);
		}));

		quickPick.show();
	});

	function createQuickPickItem(resource: URI, kind: FileKind): ResourcePick {
		return {
			resource,
			kind,
			id: resource.toString(),
			alwaysShow: true,
			label: basename(resource),
			description: labelService.getUriLabel(dirname(resource), { relative: true }),
			iconClasses: kind === FileKind.FILE ? getIconClasses(modelService, languageService, resource, FileKind.FILE) : undefined,
			iconClass: kind === FileKind.FOLDER ? ThemeIcon.asClassName(Codicon.folder) : undefined
		};
	}
}

export async function getTopLevelFolders(workspaces: URI[], fileService: IFileService): Promise<URI[]> {
	const folders: URI[] = [];
	for (const workspace of workspaces) {
		const fileSystemProvider = fileService.getProvider(workspace.scheme);
		if (!fileSystemProvider) {
			continue;
		}

		const entries = await fileSystemProvider.readdir(workspace);
		for (const [name, type] of entries) {
			const entryResource = joinPath(workspace, name);
			if (type === FileType.Directory) {
				folders.push(entryResource);
			}
		}
	}

	return folders;
}

export async function searchFilesAndFolders(
	workspace: URI,
	pattern: string,
	fuzzyMatch: boolean,
	token: CancellationToken | undefined,
	cacheKey: string | undefined,
	configurationService: IConfigurationService,
	searchService: ISearchService
): Promise<{ folders: URI[]; files: URI[] }> {
	const segmentMatchPattern = caseInsensitiveGlobPattern(fuzzyMatch ? fuzzyMatchingGlobPattern(pattern) : continousMatchingGlobPattern(pattern));

	const searchExcludePattern = getExcludes(configurationService.getValue<ISearchConfiguration>({ resource: workspace })) || {};
	const searchOptions: IFileQuery = {
		folderQueries: [{
			folder: workspace,
			disregardIgnoreFiles: configurationService.getValue<boolean>('explorer.excludeGitIgnore'),
		}],
		type: QueryType.File,
		shouldGlobMatchFilePattern: true,
		cacheKey,
		excludePattern: searchExcludePattern,
		sortByScore: true,
	};

	let searchResult: ISearchComplete | undefined;
	try {
		searchResult = await searchService.fileSearch({ ...searchOptions, filePattern: `{**/${segmentMatchPattern}/**,${pattern}}` }, token);
	} catch (e) {
		if (!isCancellationError(e)) {
			throw e;
		}
	}

	if (!searchResult || token?.isCancellationRequested) {
		return { files: [], folders: [] };
	}

	const fileResources = searchResult.results.map(result => result.resource);
	const folderResources = getMatchingFoldersFromFiles(fileResources, workspace, segmentMatchPattern);

	return { folders: folderResources, files: fileResources };
}

function fuzzyMatchingGlobPattern(pattern: string): string {
	if (!pattern) {
		return '*';
	}
	return '*' + pattern.split('').join('*') + '*';
}

function continousMatchingGlobPattern(pattern: string): string {
	if (!pattern) {
		return '*';
	}
	return '*' + pattern + '*';
}

function caseInsensitiveGlobPattern(pattern: string): string {
	let caseInsensitiveFilePattern = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (/[a-zA-Z]/.test(char)) {
			caseInsensitiveFilePattern += `[${char.toLowerCase()}${char.toUpperCase()}]`;
		} else {
			caseInsensitiveFilePattern += char;
		}
	}
	return caseInsensitiveFilePattern;
}


// TODO: remove this and have support from the search service
function getMatchingFoldersFromFiles(resources: URI[], workspace: URI, segmentMatchPattern: string): URI[] {
	const uniqueFolders = new ResourceSet();
	for (const resource of resources) {
		const relativePathToRoot = relativePath(workspace, resource);
		if (!relativePathToRoot) {
			throw new Error('Resource is not a child of the workspace');
		}

		let dirResource = workspace;
		const stats = relativePathToRoot.split('/').slice(0, -1);
		for (const stat of stats) {
			dirResource = dirResource.with({ path: `${dirResource.path}/${stat}` });
			uniqueFolders.add(dirResource);
		}
	}

	const matchingFolders: URI[] = [];
	for (const folderResource of uniqueFolders) {
		const stats = folderResource.path.split('/');
		const dirStat = stats[stats.length - 1];
		if (!dirStat || !glob.match(segmentMatchPattern, dirStat)) {
			continue;
		}

		matchingFolders.push(folderResource);
	}

	return matchingFolders;
}


export interface IAddDynamicVariableContext {
	id: string;
	widget: IChatWidget;
	range: IRange;
	variableData: IChatRequestVariableValue;
	command?: Command;
}

function isAddDynamicVariableContext(context: any): context is IAddDynamicVariableContext {
	return 'widget' in context &&
		'range' in context &&
		'variableData' in context;
}

export class AddDynamicVariableAction extends Action2 {
	static readonly ID = 'workbench.action.chat.addDynamicVariable';

	constructor() {
		super({
			id: AddDynamicVariableAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const context = args[0];
		if (!isAddDynamicVariableContext(context)) {
			return;
		}

		let range = context.range;
		const variableData = context.variableData;

		const doCleanup = () => {
			// Failed, remove the dangling variable prefix
			context.widget.inputEditor.executeEdits('chatInsertDynamicVariableWithArguments', [{ range: context.range, text: `` }]);
		};

		// If this completion item has no command, return it directly
		if (context.command) {
			// Invoke the command on this completion item along with its args and return the result
			const commandService = accessor.get(ICommandService);
			const selection: string | undefined = await commandService.executeCommand(context.command.id, ...(context.command.arguments ?? []));
			if (!selection) {
				doCleanup();
				return;
			}

			// Compute new range and variableData
			const insertText = ':' + selection;
			const insertRange = new Range(range.startLineNumber, range.endColumn, range.endLineNumber, range.endColumn + insertText.length);
			range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + insertText.length);
			const editor = context.widget.inputEditor;
			const success = editor.executeEdits('chatInsertDynamicVariableWithArguments', [{ range: insertRange, text: insertText + ' ' }]);
			if (!success) {
				doCleanup();
				return;
			}
		}

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			id: context.id,
			range: range,
			isFile: true,
			data: variableData
		});
	}
}
registerAction2(AddDynamicVariableAction);
