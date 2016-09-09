/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./../browser/media/repl';
import nls = require('vs/nls');
import uri from 'vs/base/common/uri';
import {wireCancellationToken} from 'vs/base/common/async';
import {TPromise} from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import actions = require('vs/base/common/actions');
import builder = require('vs/base/browser/builder');
import dom = require('vs/base/browser/dom');
import {CancellationToken} from 'vs/base/common/cancellation';
import {KeyCode} from 'vs/base/common/keyCodes';
import {IEditorOptions, IReadOnlyModel, EditorContextKeys, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {Position} from 'vs/editor/common/core/position';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import * as modes from 'vs/editor/common/modes';
import {editorAction, ServicesAccessor, EditorAction} from 'vs/editor/common/editorCommonExtensions';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IContextKeyService, ContextKeyExpr} from 'vs/platform/contextkey/common/contextkey';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {ReplEditor, ReplInputEditor} from 'vs/workbench/parts/debug/electron-browser/debugEditors';
import debug = require('vs/workbench/parts/debug/common/debug');
import debugactions = require('vs/workbench/parts/debug/browser/debugActions');
import replhistory = require('vs/workbench/parts/debug/common/replHistory');
import {Panel} from 'vs/workbench/browser/panel';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

const $ = dom.$;

const HISTORY_STORAGE_KEY = 'debug.repl.history';
const IPrivateReplService = createDecorator<IPrivateReplService>('privateReplService');

export interface IPrivateReplService {
	_serviceBrand: any;
	navigateHistory(previous: boolean): void;
	acceptReplInput(): void;
}

export class Repl extends Panel implements IPrivateReplService {
	public _serviceBrand: any;

	private static HISTORY: replhistory.ReplHistory;
	private static REPL_INPUT_INITIAL_HEIGHT = 22;
	private static REPL_INPUT_MAX_HEIGHT = 170;

	private toDispose: lifecycle.IDisposable[];
	private replInput: ReplInputEditor;
	private replInputContainer: HTMLElement;
	private replEditor: ReplEditor;
	private replEditorContainer: HTMLElement;
	private actions: actions.IAction[];
	private dimension: builder.Dimension;
	private replInputHeight: number;

	constructor(
		@debug.IDebugService private debugService: debug.IDebugService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IPanelService private panelService: IPanelService,
		@IThemeService private themeService: IThemeService,
		@IModelService private modelService: IModelService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(debug.REPL_ID, telemetryService);

		this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
		this.toDispose = [];
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.getModel().onDidChangeReplElements(elements => {
			this.onReplElementsUpdated(elements);
		}));
		this.toDispose.push(this.themeService.onDidColorThemeChange(e => {
			this.replEditor.updateOptions(this.getReplEditorOptions());
			this.replInput.updateOptions(this.getReplInputOptions());
		}));
	}

	private onReplElementsUpdated(elements: debug.IReplElement[]): void {
		if (this.replEditor) {
			if (!elements && this.debugService.getModel().getReplElements().length === 0) {
				this.replEditor.setValue('');
				return;
			}

			const model = this.replEditor.getModel();
			const lastLine = model.getLineCount();
			const text = elements.map(element => element.toString()).join('\n') + '\n';
			this.replEditor.getModel().applyEdits([EditOperation.insert(new Position(lastLine, 1), text)]);

			// Auto scroll only if the last line is revealed
			const lineBeforeLastRevealed = this.replEditor.getScrollTop() + this.replEditor.getLayoutInfo().height >= this.replEditor.getScrollHeight();
			if (lineBeforeLastRevealed) {
				this.replEditor.revealLine(model.getLineCount());
			}

			// TODO@Isidor auto expand the last repl element if it has children
		}
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		const container = dom.append(parent.getHTMLElement(), $('.repl'));
		this.createRepl(container);
		this.createReplInput(container);


		if (!Repl.HISTORY) {
			Repl.HISTORY = new replhistory.ReplHistory(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')));
		}

		return TPromise.as(null);
	}

	private createRepl(container: HTMLElement): void {
		this.replEditorContainer = dom.append(container, $('.repl-editor'));
		this.replEditor = this.instantiationService.createInstance(ReplEditor, this.replEditorContainer, this.getReplEditorOptions());
		const model = this.modelService.createModel('', null, uri.parse(`${debug.DEBUG_SCHEME}:repl`));
		this.replEditor.setModel(model);

		// TODO@Isidor add a bunch of listeners for expand / collapse
	}

	private createReplInput(container: HTMLElement): void {
		this.replInputContainer = dom.append(container, $('.repl-input-wrapper'));

		const scopedContextKeyService = this.contextKeyService.createScoped(this.replInputContainer);
		this.toDispose.push(scopedContextKeyService);
		debug.CONTEXT_IN_DEBUG_REPL.bindTo(scopedContextKeyService).set(true);
		const onFirstReplLine = debug.CONTEXT_ON_FIRST_DEBUG_REPL_LINE.bindTo(scopedContextKeyService);
		onFirstReplLine.set(true);
		const onLastReplLine = debug.CONTEXT_ON_LAST_DEBUG_REPL_LINE.bindTo(scopedContextKeyService);
		onLastReplLine.set(true);

		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService], [IPrivateReplService, this]));
		this.replInput = scopedInstantiationService.createInstance(ReplInputEditor, this.replInputContainer, this.getReplInputOptions());
		const model = this.modelService.createModel('', null, uri.parse(`${debug.DEBUG_SCHEME}:input`));
		this.replInput.setModel(model);

		modes.SuggestRegistry.register({ scheme: debug.DEBUG_SCHEME }, {
				triggerCharacters: ['.'],
				provideCompletionItems: (model: IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.ISuggestResult> => {
					const word = this.replInput.getModel().getWordAtPosition(position);
					const text = this.replInput.getModel().getLineContent(position.lineNumber);
					return wireCancellationToken(token, this.debugService.completions(text, position).then(suggestions => ({
						currentWord: word ? word.word : '',
						suggestions
					})));
				}
			},
			true
		);

		this.toDispose.push(this.replInput.onDidScrollChange(e => {
			if (!e.scrollHeightChanged) {
				return;
			}
			this.replInputHeight = Math.min(Repl.REPL_INPUT_MAX_HEIGHT, e.scrollHeight, this.dimension.height);
			this.layout(this.dimension);
		}));
		this.toDispose.push(this.replInput.onDidChangeCursorPosition(e => {
			onFirstReplLine.set(e.position.lineNumber === 1);
			onLastReplLine.set(e.position.lineNumber === this.replInput.getModel().getLineCount());
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => dom.addClass(this.replInputContainer, 'synthetic-focus')));
		this.toDispose.push(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => dom.removeClass(this.replInputContainer, 'synthetic-focus')));
	}

	public navigateHistory(previous: boolean): void {
		const historyInput = previous ? Repl.HISTORY.previous() : Repl.HISTORY.next();
		if (historyInput) {
			Repl.HISTORY.remember(this.replInput.getValue(), previous);
			this.replInput.setValue(historyInput);
			// always leave cursor at the end.
			this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
		}
	}

	public acceptReplInput(): void {
		this.debugService.addReplExpression(this.replInput.getValue());
		Repl.HISTORY.evaluated(this.replInput.getValue());
		this.replInput.setValue('');
		// Trigger a layout to shrink a potential multi line input
		this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
		this.layout(this.dimension);
	}

	public layout(dimension: builder.Dimension): void {
		// TODO@Isidor check layout which is overflowing up
		this.dimension = dimension;
		if (this.replEditor) {
			const replEditorHeight = dimension.height - this.replInputHeight;
			this.replEditorContainer.style.height = `${replEditorHeight}px`;
			this.replEditor.layout({height: replEditorHeight, width: dimension.width});
		}
		this.replInputContainer.style.height = `${this.replInputHeight}px`;

		this.replInput.layout({ width: dimension.width - 20, height: this.replInputHeight });
	}

	public focus(): void {
		this.replInput.focus();
	}

	public getActions(): actions.IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(debugactions.ClearReplAction, debugactions.ClearReplAction.ID, debugactions.ClearReplAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}

		return this.actions;
	}

	public shutdown(): void {
		this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(Repl.HISTORY.save()), StorageScope.WORKSPACE);
	}

	private getReplInputOptions(): IEditorOptions {
		return {
			wrappingColumn: 0,
			overviewRulerLanes: 0,
			glyphMargin: false,
			lineNumbers: false,
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			scrollbar: {
				horizontal: 'hidden'
			},
			lineDecorationsWidth: 0,
			scrollBeyondLastLine: false,
			lineHeight: 21,
			theme: this.themeService.getColorTheme(),
			renderLineHighlight: false
		};
	}

	private getReplEditorOptions(): IEditorOptions {
		const result = this.getReplInputOptions();
		result.readOnly = true;

		return result;
	};

	public dispose(): void {
		this.replInput.destroy();
		this.replEditor.destroy();
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}
}

@editorAction
class ReplHistoryPreviousAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.historyPrevious',
			label: nls.localize('actions.repl.historyPrevious', "History Previous"),
			alias: 'History Previous',
			precondition: debug.CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.TextFocus, debug.CONTEXT_ON_FIRST_DEBUG_REPL_LINE),
				primary: KeyCode.UpArrow,
				weight: 50
			},
			menuOpts: {
				group: 'debug'
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void | TPromise<void> {
		accessor.get(IPrivateReplService).navigateHistory(true);
	}
}

@editorAction
class ReplHistoryNextAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.historyNext',
			label: nls.localize('actions.repl.historyNext', "History Next"),
			alias: 'History Next',
			precondition: debug.CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.TextFocus, debug.CONTEXT_ON_LAST_DEBUG_REPL_LINE),
				primary: KeyCode.DownArrow,
				weight: 50
			},
			menuOpts: {
				group: 'debug'
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void | TPromise<void> {
		accessor.get(IPrivateReplService).navigateHistory(false);
	}
}

@editorAction
class AcceptReplInputAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.acceptInput',
			label: nls.localize({ key: 'actions.repl.acceptInput', comment: ['Apply input from the debug console input box'] }, "REPL Accept Input"),
			alias: 'REPL Accept Input',
			precondition: debug.CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyCode.Enter,
				weight: 50
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void | TPromise<void> {
		accessor.get(IPrivateReplService).acceptReplInput();
	}
}
