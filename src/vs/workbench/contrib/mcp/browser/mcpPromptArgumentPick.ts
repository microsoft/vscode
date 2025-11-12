/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../base/common/assert.js';
import { disposableTimeout, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ObservablePromise, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { ICommandDetectionCapability, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { IMcpPrompt } from '../common/mcpTypes.js';
import { MCP } from '../common/modelContextProtocol.js';

type PickItem = IQuickPickItem & (
	| { action: 'text' | 'command' | 'suggest' }
	| { action: 'file'; uri: URI }
	| { action: 'selectedText'; uri: URI; selectedText: string }
);

const SHELL_INTEGRATION_TIMEOUT = 5000;
const NO_SHELL_INTEGRATION_IDLE = 1000;
const SUGGEST_DEBOUNCE = 200;

type Action = { type: 'arg'; value: string | undefined } | { type: 'back' } | { type: 'cancel' };

export class McpPromptArgumentPick extends Disposable {
	private readonly quickPick: IQuickPick<PickItem, { useSeparators: true }>;
	private _terminal?: ITerminalInstance;

	constructor(
		private readonly prompt: IMcpPrompt,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ILabelService private readonly _labelService: ILabelService,
		@IFileService private readonly _fileService: IFileService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
		this.quickPick = this._register(_quickInputService.createQuickPick({ useSeparators: true }));
	}

	public async createArgs(token?: CancellationToken): Promise<Record<string, string | undefined> | undefined> {
		const { quickPick, prompt } = this;

		quickPick.totalSteps = prompt.arguments.length;
		quickPick.step = 0;
		quickPick.ignoreFocusOut = true;
		quickPick.sortByLabel = false;

		const args: Record<string, string | undefined> = {};
		const backSnapshots: { value: string; items: readonly (PickItem | IQuickPickSeparator)[]; activeItems: readonly PickItem[] }[] = [];
		for (let i = 0; i < prompt.arguments.length; i++) {
			const arg = prompt.arguments[i];
			const restore = backSnapshots.at(i);
			quickPick.step = i + 1;
			quickPick.placeholder = arg.required ? arg.description : `${arg.description || ''} (${localize('optional', 'Optional')})`;
			quickPick.title = localize('mcp.prompt.pick.title', 'Value for: {0}', arg.title || arg.name);
			quickPick.value = restore?.value ?? ((args.hasOwnProperty(arg.name) && args[arg.name]) || '');
			quickPick.items = restore?.items ?? [];
			quickPick.activeItems = restore?.activeItems ?? [];
			quickPick.buttons = i > 0 ? [this._quickInputService.backButton] : [];

			const value = await this._getArg(arg, !!restore, args, token);
			if (value.type === 'back') {
				i -= 2;
			} else if (value.type === 'cancel') {
				return undefined;
			} else if (value.type === 'arg') {
				backSnapshots[i] = { value: quickPick.value, items: quickPick.items.slice(), activeItems: quickPick.activeItems.slice() };
				args[arg.name] = value.value;
			} else {
				assertNever(value);
			}
		}

		quickPick.value = '';
		quickPick.placeholder = localize('loading', 'Loading...');
		quickPick.busy = true;

		return args;
	}

	private async _getArg(arg: MCP.PromptArgument, didRestoreState: boolean, argsSoFar: Record<string, string | undefined>, token?: CancellationToken): Promise<Action> {
		const { quickPick } = this;
		const store = new DisposableStore();

		const input$ = observableValue(this, quickPick.value);
		const asyncPicks = [
			{
				name: localize('mcp.arg.suggestions', 'Suggestions'),
				observer: this._promptCompletions(arg, input$, argsSoFar),
			},
			{
				name: localize('mcp.arg.activeFiles', 'Active File'),
				observer: this._activeFileCompletions(),
			},
			{
				name: localize('mcp.arg.files', 'Files'),
				observer: this._fileCompletions(input$),
			}
		];

		store.add(autorun(reader => {
			if (didRestoreState) {
				input$.read(reader);
				return; // don't overwrite initial items until the user types
			}

			let items: (PickItem | IQuickPickSeparator)[] = [];
			items.push({ id: 'insert-text', label: localize('mcp.arg.asText', 'Insert as text'), iconClass: ThemeIcon.asClassName(Codicon.textSize), action: 'text', alwaysShow: true });
			items.push({ id: 'run-command', label: localize('mcp.arg.asCommand', 'Run as Command'), description: localize('mcp.arg.asCommand.description', 'Inserts the command output as the prompt argument'), iconClass: ThemeIcon.asClassName(Codicon.terminal), action: 'command', alwaysShow: true });

			let busy = false;
			for (const pick of asyncPicks) {
				const state = pick.observer.read(reader);
				busy ||= state.busy;
				if (state.picks) {
					items.push({ label: pick.name, type: 'separator' });
					items = items.concat(state.picks);
				}
			}

			const previouslyActive = quickPick.activeItems;
			quickPick.busy = busy;
			quickPick.items = items;

			const lastActive = items.find(i => previouslyActive.some(a => a.id === i.id)) as PickItem | undefined;
			const serverSuggestions = asyncPicks[0].observer;
			// Keep any selection state, but otherwise select the first completion item, and avoid default-selecting the top item unless there are no compltions
			if (lastActive) {
				quickPick.activeItems = [lastActive];
			} else if (serverSuggestions.read(reader).picks?.length) {
				quickPick.activeItems = [items[3] as PickItem];
			} else if (busy) {
				quickPick.activeItems = [];
			} else {
				quickPick.activeItems = [items[0] as PickItem];
			}
		}));

		try {
			const value = await new Promise<PickItem | 'back' | undefined>(resolve => {
				if (token) {
					store.add(token.onCancellationRequested(() => {
						resolve(undefined);
					}));
				}
				store.add(quickPick.onDidChangeValue(value => {
					quickPick.validationMessage = undefined;
					input$.set(value, undefined);
				}));
				store.add(quickPick.onDidAccept(() => {
					const item = quickPick.selectedItems[0];
					if (!quickPick.value && arg.required && (!item || item.action === 'text' || item.action === 'command')) {
						quickPick.validationMessage = localize('mcp.arg.required', "This argument is required");
					} else if (!item) {
						// For optional arguments when no item is selected, return empty text action
						resolve({ id: 'insert-text', label: '', action: 'text' });
					} else {
						resolve(item);
					}
				}));
				store.add(quickPick.onDidTriggerButton(() => {
					resolve('back');
				}));
				store.add(quickPick.onDidHide(() => {
					resolve(undefined);
				}));
				quickPick.show();
			});

			if (value === 'back') {
				return { type: 'back' };
			}

			if (value === undefined) {
				return { type: 'cancel' };
			}

			store.clear();
			const cts = new CancellationTokenSource();
			store.add(toDisposable(() => cts.dispose(true)));
			store.add(quickPick.onDidHide(() => store.dispose()));

			switch (value.action) {
				case 'text':
					return { type: 'arg', value: quickPick.value || undefined };
				case 'command':
					if (!quickPick.value) {
						return { type: 'arg', value: undefined };
					}
					quickPick.busy = true;
					return { type: 'arg', value: await this._getTerminalOutput(quickPick.value, cts.token) };
				case 'suggest':
					return { type: 'arg', value: value.label };
				case 'file':
					quickPick.busy = true;
					return { type: 'arg', value: await this._fileService.readFile(value.uri).then(c => c.value.toString()) };
				case 'selectedText':
					return { type: 'arg', value: value.selectedText };
				default:
					assertNever(value);
			}
		} finally {
			store.dispose();
		}
	}

	private _promptCompletions(arg: MCP.PromptArgument, input: IObservable<string>, argsSoFar: Record<string, string | undefined>) {
		const alreadyResolved: Record<string, string> = {};
		for (const [key, value] of Object.entries(argsSoFar)) {
			if (value) {
				alreadyResolved[key] = value;
			}
		}

		return this._asyncCompletions(input, async (i, t) => {
			const items = await this.prompt.complete(arg.name, i, alreadyResolved, t);
			return items.map((i): PickItem => ({ id: `suggest:${i}`, label: i, action: 'suggest' }));
		});
	}

	private _fileCompletions(input: IObservable<string>) {
		const qb = this._instantiationService.createInstance(QueryBuilder);
		return this._asyncCompletions(input, async (i, token) => {
			if (!i) {
				return [];
			}

			const query = qb.file(this._workspaceContextService.getWorkspace().folders, {
				filePattern: i,
				maxResults: 10,
			});

			const { results } = await this._searchService.fileSearch(query, token);

			return results.map((i): PickItem => ({
				id: i.resource.toString(),
				label: basename(i.resource),
				description: this._labelService.getUriLabel(i.resource),
				iconClasses: getIconClasses(this._modelService, this._languageService, i.resource),
				uri: i.resource,
				action: 'file',
			}));
		});
	}

	private _activeFileCompletions() {
		const activeEditorChange = observableSignalFromEvent(this, this._editorService.onDidActiveEditorChange);
		const activeEditor = derived(reader => {
			activeEditorChange.read(reader);
			return this._codeEditorService.getActiveCodeEditor();
		});

		const resourceObs = activeEditor
			.map(e => e ? observableSignalFromEvent(this, e.onDidChangeModel).map(() => e.getModel()?.uri) : undefined)
			.map((o, reader) => o?.read(reader));
		const selectionObs = activeEditor
			.map(e => e ? observableSignalFromEvent(this, e.onDidChangeCursorSelection).map(() => ({ range: e.getSelection(), model: e.getModel() })) : undefined)
			.map((o, reader) => o?.read(reader));

		return derived(reader => {
			const resource = resourceObs.read(reader);
			if (!resource) {
				return { busy: false, picks: [] };
			}

			const items: PickItem[] = [];

			// Add active file option
			items.push({
				id: 'active-file',
				label: localize('mcp.arg.activeFile', 'Active File'),
				description: this._labelService.getUriLabel(resource),
				iconClasses: getIconClasses(this._modelService, this._languageService, resource),
				uri: resource,
				action: 'file',
			});

			const selection = selectionObs.read(reader);
			// Add selected text option if there's a selection
			if (selection && selection.model && selection.range && !selection.range.isEmpty()) {
				const selectedText = selection.model.getValueInRange(selection.range);
				const lineCount = selection.range.endLineNumber - selection.range.startLineNumber + 1;
				const description = lineCount === 1
					? localize('mcp.arg.selectedText.singleLine', 'line {0}', selection.range.startLineNumber)
					: localize('mcp.arg.selectedText.multiLine', '{0} lines', lineCount);

				items.push({
					id: 'selected-text',
					label: localize('mcp.arg.selectedText', 'Selected Text'),
					description,
					selectedText,
					iconClass: ThemeIcon.asClassName(Codicon.selection),
					uri: resource,
					action: 'selectedText',
				});
			}

			return { picks: items, busy: false };
		});
	}

	private _asyncCompletions(input: IObservable<string>, mapper: (input: string, token: CancellationToken) => Promise<PickItem[]>): IObservable<{ busy: boolean; picks: PickItem[] | undefined }> {
		const promise = derived(reader => {
			const queryValue = input.read(reader);
			const cts = new CancellationTokenSource();
			reader.store.add(toDisposable(() => cts.dispose(true)));
			return new ObservablePromise(
				timeout(SUGGEST_DEBOUNCE, cts.token)
					.then(() => mapper(queryValue, cts.token))
					.catch(() => [])
			);
		});

		return promise.map((value, reader) => {
			const result = value.promiseResult.read(reader);
			return { picks: result?.data || [], busy: result === undefined };
		});
	}

	private async _getTerminalOutput(command: string, token: CancellationToken): Promise<string | undefined> {
		// The terminal outlives the specific pick argument. This is both a feature and a bug.
		// Feature: we can reuse the terminal if the user puts in multiple args
		// Bug workaround: if we dispose the terminal here and that results in the panel
		// closing, then focus moves out of the quickpick and into the active editor pane (chat input)
		// https://github.com/microsoft/vscode/blob/6a016f2507cd200b12ca6eecdab2f59da15aacb1/src/vs/workbench/browser/parts/editor/editorGroupView.ts#L1084
		const terminal = (this._terminal ??= this._register(await this._terminalService.createTerminal({
			config: {
				name: localize('mcp.terminal.name', "MCP Terminal"),
				isTransient: true,
				forceShellIntegration: true,
				isFeatureTerminal: true,
			},
			location: TerminalLocation.Panel,
		})));

		this._terminalService.setActiveInstance(terminal);
		this._terminalGroupService.showPanel(false);

		const shellIntegration = terminal.capabilities.get(TerminalCapability.CommandDetection);
		if (shellIntegration) {
			return this._getTerminalOutputInner(terminal, command, shellIntegration, token);
		}

		const store = new DisposableStore();
		return await new Promise<string | undefined>(resolve => {
			store.add(terminal.capabilities.onDidAddCapability(e => {
				if (e.id === TerminalCapability.CommandDetection) {
					store.dispose();
					resolve(this._getTerminalOutputInner(terminal, command, e.capability, token));
				}
			}));
			store.add(token.onCancellationRequested(() => {
				store.dispose();
				resolve(undefined);
			}));
			store.add(disposableTimeout(() => {
				store.dispose();
				resolve(this._getTerminalOutputInner(terminal, command, undefined, token));
			}, SHELL_INTEGRATION_TIMEOUT));
		});
	}

	private async _getTerminalOutputInner(terminal: ITerminalInstance, command: string, shellIntegration: ICommandDetectionCapability | undefined, token: CancellationToken) {
		const store = new DisposableStore();
		return new Promise<string | undefined>(resolve => {
			let allData: string = '';
			store.add(terminal.onLineData(d => allData += d + '\n'));
			if (shellIntegration) {
				store.add(shellIntegration.onCommandFinished(e => resolve(e.getOutput() || allData)));
			} else {
				const done = store.add(new RunOnceScheduler(() => resolve(allData), NO_SHELL_INTEGRATION_IDLE));
				store.add(terminal.onData(() => done.schedule()));
			}
			store.add(token.onCancellationRequested(() => resolve(undefined)));
			store.add(terminal.onDisposed(() => resolve(undefined)));

			terminal.runCommand(command, true);
		}).finally(() => {
			store.dispose();
		});
	}
}
