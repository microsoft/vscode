/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, groupBy } from '../../../../../base/common/arrays.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import * as glob from '../../../../../base/common/glob.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { basename, dirname, joinPath, relativePath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { Command, isLocation } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileType, IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { PromptsConfig } from '../../../../../platform/prompts/common/config.js';
import { IQuickAccessOptions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { getExcludes, IFileQuery, ISearchComplete, ISearchConfiguration, ISearchService, QueryType } from '../../../../services/search/common/search.js';
import { ISymbolQuickPickItem } from '../../../search/browser/symbolsQuickAccess.js';
import { IDiagnosticVariableEntryFilterData } from '../../common/chatModel.js';
import { IChatRequestProblemsVariable, IChatRequestVariableValue, IDynamicVariable } from '../../common/chatVariables.js';
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

	constructor(
		private readonly widget: IChatWidget,
		@ILabelService private readonly labelService: ILabelService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(widget.inputEditor.onDidChangeModelContent(e => {
			e.changes.forEach(c => {
				// Don't mutate entries in _variables, since they will be returned from the getter
				this._variables = coalesce(this._variables.map(ref => {
					const intersection = Range.intersectRanges(ref.range, c.range);
					if (intersection && !intersection.isEmpty()) {
						// The reference text was changed, it's broken.
						// But if the whole reference range was deleted (eg history navigation) then don't try to change the editor.
						if (!Range.containsRange(c.range, ref.range)) {
							const rangeToDelete = new Range(ref.range.startLineNumber, ref.range.startColumn, ref.range.endLineNumber, ref.range.endColumn - 1);
							this.widget.inputEditor.executeEdits(this.id, [{
								range: rangeToDelete,
								text: '',
							}]);
							this.widget.refreshParsedInput();
						}

						// dispose the reference if possible before dropping it off
						if ('dispose' in ref && typeof ref.dispose === 'function') {
							ref.dispose();
						}

						return null;
					} else if (Range.compareRangesUsingStarts(ref.range, c.range) > 0) {
						const delta = c.text.length - c.rangeLength;
						ref.range = {
							startLineNumber: ref.range.startLineNumber,
							startColumn: ref.range.startColumn + delta,
							endLineNumber: ref.range.endLineNumber,
							endColumn: ref.range.endColumn + delta,
						};

						return ref;
					}

					return ref;
				}));
			});

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
		this.widget.inputEditor.setDecorationsByType('chat', dynamicVariableDecorationType, this._variables.map((r): IDecorationOptions => ({
			range: r.range,
			hoverMessage: this.getHoverForReference(r)
		})));
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
			if ('dispose' in variable && typeof variable.dispose === 'function') {
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

interface SelectAndInsertActionContext {
	widget: IChatWidget;
	range: IRange;
}

function isSelectAndInsertActionContext(context: any): context is SelectAndInsertActionContext {
	return 'widget' in context && 'range' in context;
}

export class SelectAndInsertFileAction extends Action2 {
	static readonly Name = 'files';
	static readonly Item = {
		label: localize('allFiles', 'All Files'),
		description: localize('allFilesDescription', 'Search for relevant files in the workspace and provide context from them'),
	};
	static readonly ID = 'workbench.action.chat.selectAndInsertFile';

	constructor() {
		super({
			id: SelectAndInsertFileAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const textModelService = accessor.get(ITextModelService);
		const logService = accessor.get(ILogService);
		const quickInputService = accessor.get(IQuickInputService);

		const context = args[0];
		if (!isSelectAndInsertActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `file`
			context.widget.inputEditor.executeEdits('chatInsertFile', [{ range: context.range, text: `` }]);
		};

		let options: IQuickAccessOptions | undefined;
		// TODO: have dedicated UX for this instead of using the quick access picker
		const picks = await quickInputService.quickAccess.pick('', options);
		if (!picks?.length) {
			logService.trace('SelectAndInsertFileAction: no file selected');
			doCleanup();
			return;
		}

		const editor = context.widget.inputEditor;
		const range = context.range;

		// Handle the special case of selecting all files
		if (picks[0] === SelectAndInsertFileAction.Item) {
			const text = `#${SelectAndInsertFileAction.Name}`;
			const success = editor.executeEdits('chatInsertFile', [{ range, text: text + ' ' }]);
			if (!success) {
				logService.trace(`SelectAndInsertFileAction: failed to insert "${text}"`);
				doCleanup();
			}
			return;
		}

		// Handle the case of selecting a specific file
		const resource = (picks[0] as unknown as { resource: unknown }).resource as URI;
		if (!textModelService.canHandleResource(resource)) {
			logService.trace('SelectAndInsertFileAction: non-text resource selected');
			doCleanup();
			return;
		}

		const fileName = basename(resource);
		const text = `#file:${fileName}`;
		const success = editor.executeEdits('chatInsertFile', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertFileAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			id: 'vscode.file',
			isFile: true,
			prefix: 'file',
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: resource
		});
	}
}
registerAction2(SelectAndInsertFileAction);

export class SelectAndInsertFolderAction extends Action2 {
	static readonly Name = 'folder';
	static readonly ID = 'workbench.action.chat.selectAndInsertFolder';

	constructor() {
		super({
			id: SelectAndInsertFolderAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const logService = accessor.get(ILogService);

		const context = args[0];
		if (!isSelectAndInsertActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `folder`
			context.widget.inputEditor.executeEdits('chatInsertFolder', [{ range: context.range, text: `` }]);
		};

		const folder = await createFolderQuickPick(accessor);
		if (!folder) {
			logService.trace('SelectAndInsertFolderAction: no folder selected');
			doCleanup();
			return;
		}

		const editor = context.widget.inputEditor;
		const range = context.range;

		const folderName = basename(folder);
		const text = `#folder:${folderName}`;
		const success = editor.executeEdits('chatInsertFolder', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertFolderAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			id: 'vscode.folder',
			isFile: false,
			isDirectory: true,
			prefix: 'folder',
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: folder
		});
	}

}
registerAction2(SelectAndInsertFolderAction);

export async function createFolderQuickPick(accessor: ServicesAccessor): Promise<URI | undefined> {
	const quickInputService = accessor.get(IQuickInputService);
	const searchService = accessor.get(ISearchService);
	const configurationService = accessor.get(IConfigurationService);
	const workspaceService = accessor.get(IWorkspaceContextService);
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);

	const workspaces = workspaceService.getWorkspace().folders.map(folder => folder.uri);
	const topLevelFolderItems = (await getTopLevelFolders(workspaces, fileService)).map(createQuickPickItem);

	const quickPick = quickInputService.createQuickPick();
	quickPick.placeholder = 'Search folder by name';
	quickPick.items = topLevelFolderItems;

	return await new Promise<URI | undefined>(_resolve => {

		const disposables = new DisposableStore();
		const resolve = (res: URI | undefined) => {
			_resolve(res);
			disposables.dispose();
			quickPick.dispose();
		};

		disposables.add(quickPick.onDidChangeValue(async value => {
			if (value === '') {
				quickPick.items = topLevelFolderItems;
				return;
			}

			const workspaceFolders = await Promise.all(
				workspaces.map(workspace =>
					searchFolders(
						workspace,
						value,
						true,
						undefined,
						undefined,
						configurationService,
						searchService
					)
				));

			quickPick.items = workspaceFolders.flat().map(createQuickPickItem);
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

	function createQuickPickItem(folder: URI): IQuickPickItem & { resource: URI } {
		return {
			type: 'item',
			id: folder.toString(),
			resource: folder,
			alwaysShow: true,
			label: basename(folder),
			description: labelService.getUriLabel(dirname(folder), { relative: true }),
			iconClass: ThemeIcon.asClassName(Codicon.folder),
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

export async function searchFolders(
	workspace: URI,
	pattern: string,
	fuzzyMatch: boolean,
	token: CancellationToken | undefined,
	cacheKey: string | undefined,
	configurationService: IConfigurationService,
	searchService: ISearchService
): Promise<URI[]> {
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
	};

	let folderResults: ISearchComplete | undefined;
	try {
		folderResults = await searchService.fileSearch({ ...searchOptions, filePattern: `**/${segmentMatchPattern}/**` }, token);
	} catch (e) {
		if (!isCancellationError(e)) {
			throw e;
		}
	}

	if (!folderResults || token?.isCancellationRequested) {
		return [];
	}

	const folderResources = getMatchingFoldersFromFiles(folderResults.results.map(result => result.resource), workspace, segmentMatchPattern);
	return folderResources;
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

export class SelectAndInsertSymAction extends Action2 {
	static readonly Name = 'symbols';
	static readonly ID = 'workbench.action.chat.selectAndInsertSym';

	constructor() {
		super({
			id: SelectAndInsertSymAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const textModelService = accessor.get(ITextModelService);
		const logService = accessor.get(ILogService);
		const quickInputService = accessor.get(IQuickInputService);

		const context = args[0];
		if (!isSelectAndInsertActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `sym`
			context.widget.inputEditor.executeEdits('chatInsertSym', [{ range: context.range, text: `` }]);
		};

		// TODO: have dedicated UX for this instead of using the quick access picker
		const picks = await quickInputService.quickAccess.pick('#', { enabledProviderPrefixes: ['#'] });
		if (!picks?.length) {
			logService.trace('SelectAndInsertSymAction: no symbol selected');
			doCleanup();
			return;
		}

		const editor = context.widget.inputEditor;
		const range = context.range;

		// Handle the case of selecting a specific file
		const symbol = (picks[0] as ISymbolQuickPickItem).symbol;
		if (!symbol || !textModelService.canHandleResource(symbol.location.uri)) {
			logService.trace('SelectAndInsertSymAction: non-text resource selected');
			doCleanup();
			return;
		}

		const text = `#sym:${symbol.name}`;
		const success = editor.executeEdits('chatInsertSym', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertSymAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			id: 'vscode.symbol',
			prefix: 'symbol',
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: symbol.location
		});
	}
}
registerAction2(SelectAndInsertSymAction);

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
			prefix: 'file',
			data: variableData
		});
	}
}
registerAction2(AddDynamicVariableAction);

export async function createMarkersQuickPick(accessor: ServicesAccessor, level: 'problem' | 'file', onBackgroundAccept?: (item: IDiagnosticVariableEntryFilterData[]) => void): Promise<IDiagnosticVariableEntryFilterData | undefined> {
	const markers = accessor.get(IMarkerService).read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
	if (!markers.length) {
		return;
	}

	const uriIdentityService = accessor.get(IUriIdentityService);
	const labelService = accessor.get(ILabelService);
	const grouped = groupBy(markers, (a, b) => uriIdentityService.extUri.compare(a.resource, b.resource));

	const severities = new Set<MarkerSeverity>();
	type MarkerPickItem = IQuickPickItem & { resource?: URI; entry: IDiagnosticVariableEntryFilterData };
	const items: (MarkerPickItem | IQuickPickSeparator)[] = [];

	let pickCount = 0;
	for (const group of grouped) {
		const resource = group[0].resource;
		if (level === 'problem') {
			items.push({ type: 'separator', label: labelService.getUriLabel(resource, { relative: true }) });
			for (const marker of group) {
				pickCount++;
				severities.add(marker.severity);
				items.push({
					type: 'item',
					resource: marker.resource,
					label: marker.message,
					description: localize('markers.panel.at.ln.col.number', "[Ln {0}, Col {1}]", '' + marker.startLineNumber, '' + marker.startColumn),
					entry: IDiagnosticVariableEntryFilterData.fromMarker(marker),
				});
			}
		} else if (level === 'file') {
			const entry = { filterUri: resource };
			pickCount++;
			items.push({
				type: 'item',
				resource,
				label: IDiagnosticVariableEntryFilterData.label(entry),
				description: group[0].message + (group.length > 1 ? localize('problemsMore', '+ {0} more', group.length - 1) : ''),
				entry,
			});
			for (const marker of group) {
				severities.add(marker.severity);
			}
		} else {
			assertNever(level);
		}
	}

	if (pickCount < 2) { // single error in a URI
		return items.find((i): i is MarkerPickItem => i.type === 'item')?.entry;
	}

	if (level === 'file') {
		items.unshift({ type: 'separator', label: localize('markers.panel.files', 'Files') });
	}

	items.unshift({ type: 'item', label: localize('markers.panel.allErrors', 'All Problems'), entry: { filterSeverity: MarkerSeverity.Info } });

	const quickInputService = accessor.get(IQuickInputService);
	const store = new DisposableStore();
	const quickPick = store.add(quickInputService.createQuickPick<MarkerPickItem>({ useSeparators: true }));
	quickPick.canAcceptInBackground = !onBackgroundAccept;
	quickPick.placeholder = localize('pickAProblem', 'Pick a problem to attach...');
	quickPick.items = items;

	return new Promise<IDiagnosticVariableEntryFilterData | undefined>(resolve => {
		store.add(quickPick.onDidHide(() => resolve(undefined)));
		store.add(quickPick.onDidAccept(ev => {
			if (ev.inBackground) {
				onBackgroundAccept?.(quickPick.selectedItems.map(i => i.entry));
			} else {
				resolve(quickPick.selectedItems[0]?.entry);
				quickPick.dispose();
			}
		}));
		quickPick.show();
	}).finally(() => store.dispose());
}

export class SelectAndInsertProblemAction extends Action2 {
	static readonly Name = 'problems';
	static readonly ID = 'workbench.action.chat.selectAndInsertProblems';

	constructor() {
		super({
			id: SelectAndInsertProblemAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const logService = accessor.get(ILogService);
		const context = args[0];
		if (!isSelectAndInsertActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `problem`
			context.widget.inputEditor.executeEdits('chatInsertProblems', [{ range: context.range, text: `` }]);
		};

		const pick = await createMarkersQuickPick(accessor, 'file');
		if (!pick) {
			doCleanup();
			return;
		}

		const editor = context.widget.inputEditor;
		const originalRange = context.range;
		const insertText = `#${SelectAndInsertProblemAction.Name}:${pick.filterUri ? basename(pick.filterUri) : MarkerSeverity.toString(pick.filterSeverity!)}`;

		const varRange = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.startColumn + insertText.length);
		const success = editor.executeEdits('chatInsertProblems', [{ range: varRange, text: insertText + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertProblemsAction: failed to insert "${insertText}"`);
			doCleanup();
			return;
		}

		context.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
			id: 'vscode.problems',
			prefix: SelectAndInsertProblemAction.Name,
			range: varRange,
			data: { id: 'vscode.problems', filter: pick } satisfies IChatRequestProblemsVariable,
		});
	}
}
registerAction2(SelectAndInsertProblemAction);
