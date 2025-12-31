/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor, ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Location } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorsOrder } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { getNotebookEditorFromEditorPane, INotebookEditor } from '../../../notebook/browser/notebookBrowser.js';
import { WebviewEditor } from '../../../webviewPanel/browser/webviewEditor.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import { IChatEditingService } from '../../common/editing/chatEditingService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatRequestImplicitVariableEntry, IChatRequestVariableEntry, isStringImplicitContextValue, StringChatContextValue } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ILanguageModelIgnoredFilesService } from '../../common/ignoredFiles.js';
import { getPromptsTypeForLanguageId } from '../../common/promptSyntax/promptTypes.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { IChatContextService } from '../contextContrib/chatContextService.js';

export class ChatImplicitContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.implicitContext';

	private readonly _currentCancelTokenSource: MutableDisposable<CancellationTokenSource>;

	private _implicitContextEnablement: { [mode: string]: string };

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageModelIgnoredFilesService private readonly ignoredFilesService: ILanguageModelIgnoredFilesService,
		@IChatContextService private readonly chatContextService: IChatContextService
	) {
		super();
		this._currentCancelTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());
		this._implicitContextEnablement = this.configurationService.getValue<{ [mode: string]: string }>('chat.implicitContext.enabled');

		const activeEditorDisposables = this._register(new DisposableStore());

		this._register(Event.runAndSubscribe(
			editorService.onDidActiveEditorChange,
			(() => {
				activeEditorDisposables.clear();
				const codeEditor = this.findActiveCodeEditor();
				if (codeEditor) {
					activeEditorDisposables.add(Event.debounce(
						Event.any(
							codeEditor.onDidChangeModel,
							codeEditor.onDidChangeModelLanguage,
							codeEditor.onDidChangeCursorSelection,
							codeEditor.onDidScrollChange),
						() => undefined,
						500)(() => this.updateImplicitContext()));
				}

				const notebookEditor = this.findActiveNotebookEditor();
				if (notebookEditor) {
					const activeCellDisposables = activeEditorDisposables.add(new DisposableStore());
					activeEditorDisposables.add(notebookEditor.onDidChangeActiveCell(() => {
						activeCellDisposables.clear();
						const codeEditor = this.codeEditorService.getActiveCodeEditor();
						if (codeEditor && codeEditor.getModel()?.uri.scheme === Schemas.vscodeNotebookCell) {
							activeCellDisposables.add(Event.debounce(
								Event.any(
									codeEditor.onDidChangeModel,
									codeEditor.onDidChangeCursorSelection,
									codeEditor.onDidScrollChange),
								() => undefined,
								500)(() => this.updateImplicitContext()));
						}
					}));

					activeEditorDisposables.add(Event.debounce(
						Event.any(
							notebookEditor.onDidChangeModel,
							notebookEditor.onDidChangeActiveCell
						),
						() => undefined,
						500)(() => this.updateImplicitContext()));
				}
				const webviewEditor = this.findActiveWebviewEditor();
				if (webviewEditor) {
					activeEditorDisposables.add(Event.debounce((webviewEditor.input as WebviewInput).webview.onMessage, () => undefined, 500)(() => {
						this.updateImplicitContext();
					}));
				}

				this.updateImplicitContext();
			})));
		this._register(autorun((reader) => {
			this.chatEditingService.editingSessionsObs.read(reader);
			this.updateImplicitContext();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.implicitContext.enabled')) {
				this._implicitContextEnablement = this.configurationService.getValue<{ [mode: string]: string }>('chat.implicitContext.enabled');
				this.updateImplicitContext();
			}
		}));
		this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
			const widget = this.chatWidgetService.getWidgetBySessionResource(chatSessionResource);
			if (!widget?.input.implicitContext) {
				return;
			}
			if (this._implicitContextEnablement[widget.location] === 'first' && widget.viewModel?.getItems().length !== 0) {
				widget.input.implicitContext.setValue(undefined, false, undefined);
			}
		}));
		this._register(this.chatWidgetService.onDidAddWidget(async (widget) => {
			await this.updateImplicitContext(widget);
		}));
	}

	private findActiveCodeEditor(): ICodeEditor | undefined {
		const codeEditor = this.codeEditorService.getActiveCodeEditor();
		if (codeEditor) {
			const model = codeEditor.getModel();
			if (model?.uri.scheme === Schemas.vscodeNotebookCell) {
				return undefined;
			}

			if (model) {
				return codeEditor;
			}
		}
		for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
			const codeEditor = getCodeEditor(codeOrDiffEditor);
			if (!codeEditor) {
				continue;
			}

			const model = codeEditor.getModel();
			if (model) {
				return codeEditor;
			}
		}
		return undefined;
	}

	private findActiveWebviewEditor(): WebviewEditor | undefined {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane?.input instanceof WebviewInput) {
			return activeEditorPane as WebviewEditor;
		}
		return undefined;
	}

	private findActiveNotebookEditor(): INotebookEditor | undefined {
		return getNotebookEditorFromEditorPane(this.editorService.activeEditorPane);
	}

	private async updateImplicitContext(updateWidget?: IChatWidget): Promise<void> {
		const cancelTokenSource = this._currentCancelTokenSource.value = new CancellationTokenSource();
		const codeEditor = this.findActiveCodeEditor();
		const model = codeEditor?.getModel();
		const selection = codeEditor?.getSelection();
		let newValue: Location | URI | StringChatContextValue | undefined;
		let isSelection = false;

		let languageId: string | undefined;
		if (model) {
			languageId = model.getLanguageId();
			if (selection && !selection.isEmpty()) {
				newValue = { uri: model.uri, range: selection } satisfies Location;
				isSelection = true;
			} else {
				if (this.configurationService.getValue('chat.implicitContext.suggestedContext')) {
					newValue = model.uri;
				} else {
					const visibleRanges = codeEditor?.getVisibleRanges();
					if (visibleRanges && visibleRanges.length > 0) {
						// Merge visible ranges. Maybe the reference value could actually be an array of Locations?
						// Something like a Location with an array of Ranges?
						let range = visibleRanges[0];
						visibleRanges.slice(1).forEach(r => {
							range = range.plusRange(r);
						});
						newValue = { uri: model.uri, range } satisfies Location;
					} else {
						newValue = model.uri;
					}
				}
			}
		}

		const notebookEditor = this.findActiveNotebookEditor();
		if (notebookEditor?.isReplHistory) {
			// The chat APIs don't work well with Interactive Windows
			newValue = undefined;
		} else if (notebookEditor) {
			const activeCell = notebookEditor.getActiveCell();
			if (activeCell) {
				const codeEditor = this.codeEditorService.getActiveCodeEditor();
				const selection = codeEditor?.getSelection();
				const visibleRanges = codeEditor?.getVisibleRanges() || [];
				newValue = activeCell.uri;
				if (isEqual(codeEditor?.getModel()?.uri, activeCell.uri)) {
					if (selection && !selection.isEmpty()) {
						newValue = { uri: activeCell.uri, range: selection } satisfies Location;
						isSelection = true;
					} else if (visibleRanges.length > 0) {
						// Merge visible ranges. Maybe the reference value could actually be an array of Locations?
						// Something like a Location with an array of Ranges?
						let range = visibleRanges[0];
						visibleRanges.slice(1).forEach(r => {
							range = range.plusRange(r);
						});
						newValue = { uri: activeCell.uri, range } satisfies Location;
					}
				}
			} else {
				newValue = notebookEditor.textModel?.uri;
			}
		}

		const webviewEditor = this.findActiveWebviewEditor();
		if (webviewEditor?.input?.resource) {
			const webviewContext = await this.chatContextService.contextForResource(webviewEditor.input.resource);
			if (webviewContext) {
				newValue = webviewContext;
			}
		}

		const uri = newValue instanceof URI ? newValue : (isStringImplicitContextValue(newValue) ? undefined : newValue?.uri);
		if (uri && (
			await this.ignoredFilesService.fileIsIgnored(uri, cancelTokenSource.token) ||
			uri.path.endsWith('.copilotmd'))
		) {
			newValue = undefined;
		}

		if (cancelTokenSource.token.isCancellationRequested) {
			return;
		}

		const isPromptFile = languageId && getPromptsTypeForLanguageId(languageId) !== undefined;

		const widgets = updateWidget ? [updateWidget] : [...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat), ...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.EditorInline)];
		for (const widget of widgets) {
			if (!widget.input.implicitContext) {
				continue;
			}
			const setting = this._implicitContextEnablement[widget.location];
			const isFirstInteraction = widget.viewModel?.getItems().length === 0;
			if ((setting === 'always' || setting === 'first' && isFirstInteraction) && !isPromptFile) { // disable implicit context for prompt files
				widget.input.implicitContext.setValue(newValue, isSelection, languageId);
			} else {
				widget.input.implicitContext.setValue(undefined, false, undefined);
			}
		}
	}
}

export class ChatImplicitContext extends Disposable implements IChatRequestImplicitVariableEntry {
	get id() {
		if (URI.isUri(this.value)) {
			return 'vscode.implicit.file';
		} else if (isStringImplicitContextValue(this.value)) {
			return 'vscode.implicit.string';
		} else if (this.value) {
			if (this._isSelection) {
				return 'vscode.implicit.selection';
			} else {
				return 'vscode.implicit.viewport';
			}
		} else {
			return 'vscode.implicit';
		}
	}

	get name(): string {
		if (URI.isUri(this.value)) {
			return `file:${basename(this.value)}`;
		} else if (isStringImplicitContextValue(this.value)) {
			return this.value.name;
		} else if (this.value) {
			return `file:${basename(this.value.uri)}`;
		} else {
			return 'implicit';
		}
	}

	readonly kind = 'implicit';

	get modelDescription(): string {
		if (URI.isUri(this.value)) {
			return `User's active file`;
		} else if (isStringImplicitContextValue(this.value)) {
			return this.value.modelDescription ?? `User's active context from ${this.value.name}`;
		} else if (this._isSelection) {
			return `User's active selection`;
		} else {
			return `User's current visible code`;
		}
	}

	readonly isFile = true;

	private _isSelection = false;
	public get isSelection(): boolean {
		return this._isSelection;
	}

	private _onDidChangeValue = this._register(new Emitter<void>());
	readonly onDidChangeValue = this._onDidChangeValue.event;

	private _value: Location | URI | StringChatContextValue | undefined;
	get value() {
		return this._value;
	}

	private _enabled = true;
	get enabled() {
		return this._enabled;
	}

	set enabled(value: boolean) {
		this._enabled = value;
		this._onDidChangeValue.fire();
	}

	private _uri: URI | undefined;
	get uri(): URI | undefined {
		if (isStringImplicitContextValue(this.value)) {
			return this.value.uri;
		}
		return this._uri;
	}

	get icon(): ThemeIcon | undefined {
		if (isStringImplicitContextValue(this.value)) {
			return this.value.icon;
		}
		return undefined;
	}

	setValue(value: Location | URI | StringChatContextValue | undefined, isSelection: boolean, languageId?: string): void {
		if (isStringImplicitContextValue(value)) {
			this._value = value;
		} else {
			this._value = value;
			this._uri = URI.isUri(value) ? value : value?.uri;
		}
		this._isSelection = isSelection;
		this._onDidChangeValue.fire();
	}

	public toBaseEntries(): IChatRequestVariableEntry[] {
		if (!this.value) {
			return [];
		}

		if (isStringImplicitContextValue(this.value)) {
			return [
				{
					kind: 'string',
					id: this.id,
					name: this.name,
					value: this.value.value ?? this.name,
					modelDescription: this.modelDescription,
					icon: this.value.icon,
					uri: this.value.uri
				}
			];
		}

		return [{
			kind: 'file',
			id: this.id,
			name: this.name,
			value: this.value,
			modelDescription: this.modelDescription,
		}];
	}

}
