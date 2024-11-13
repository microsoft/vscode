/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor, isCodeEditor, isDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Location } from '../../../../../editor/common/languages.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorsOrder } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { IBaseChatRequestVariableEntry, IChatRequestImplicitVariableEntry } from '../../common/chatModel.js';
import { ILanguageModelIgnoredFilesService } from '../../common/ignoredFiles.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatbotPromptReference } from '../chatbotPromptReference.js';

export class ChatImplicitContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.implicitContext';

	private readonly _currentCancelTokenSource = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ILanguageModelIgnoredFilesService private readonly ignoredFilesService: ILanguageModelIgnoredFilesService,
	) {
		super();

		const activeEditorDisposables = this._register(new DisposableStore());
		this._register(Event.runAndSubscribe(
			editorService.onDidVisibleEditorsChange,
			(() => {
				activeEditorDisposables.clear();
				const codeEditor = this.findActiveCodeEditor();
				if (codeEditor) {
					activeEditorDisposables.add(Event.debounce(
						Event.any(
							codeEditor.onDidChangeModel,
							codeEditor.onDidChangeCursorSelection,
							codeEditor.onDidScrollChange),
						() => undefined,
						500)(() => this.updateImplicitContext()));
				}

				this.updateImplicitContext();
			})));
		this._register(chatWidgetService.onDidAddWidget(widget => this.updateImplicitContext(widget)));
	}

	private findActiveCodeEditor(): ICodeEditor | undefined {
		const codeEditor = this.codeEditorService.getActiveCodeEditor();
		if (codeEditor) {
			const model = codeEditor.getModel();
			if (model) {
				return codeEditor;
			}
		}
		for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
			let codeEditor: ICodeEditor;
			if (isDiffEditor(codeOrDiffEditor)) {
				codeEditor = codeOrDiffEditor.getModifiedEditor();
			} else if (isCodeEditor(codeOrDiffEditor)) {
				codeEditor = codeOrDiffEditor;
			} else {
				continue;
			}

			const model = codeEditor.getModel();
			if (model) {
				return codeEditor;
			}
		}
		return undefined;
	}

	private async updateImplicitContext(updateWidget?: IChatWidget): Promise<void> {
		const cancelTokenSource = this._currentCancelTokenSource.value = new CancellationTokenSource();
		const codeEditor = this.findActiveCodeEditor();
		const model = codeEditor?.getModel();
		const selection = codeEditor?.getSelection();
		let newValue: Location | URI | undefined;
		let isSelection = false;
		if (model) {
			if (selection && !selection.isEmpty()) {
				newValue = { uri: model.uri, range: selection } satisfies Location;
				isSelection = true;
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

		const uri = newValue instanceof URI ? newValue : newValue?.uri;
		if (uri && await this.ignoredFilesService.fileIsIgnored(uri, cancelTokenSource.token)) {
			newValue = undefined;
		}

		if (cancelTokenSource.token.isCancellationRequested) {
			return;
		}

		const widgets = updateWidget ? [updateWidget] : [...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Panel), ...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Editor)];
		for (const widget of widgets) {
			if (widget.input.implicitContext) {
				widget.input.implicitContext.setValue(newValue, isSelection);
			}
		}
	}
}

export class ChatImplicitContext extends Disposable implements IChatRequestImplicitVariableEntry {
	private _onDidChangeValue = this._register(new Emitter<void>());
	readonly onDidChangeValue = this._onDidChangeValue.event;

	private chatReference?: ChatbotPromptReference;

	constructor(
		private readonly fileService: IFileService,
	) {
		super();
	}

	get id() {
		if (URI.isUri(this.value)) {
			return 'vscode.implicit.file';
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
		} else if (this._isSelection) {
			return `User's active selection`;
		} else {
			return `User's current visible code`;
		}
	}

	// TODO@roblourens
	readonly isDynamic = true;
	readonly isFile = true;

	private _isSelection = false;
	public get isSelection(): boolean {
		return this._isSelection;
	}

	public set isSelection(value: boolean) {
		this._isSelection = value;
	}

	private _value: Location | URI | undefined;
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

	/**
	 * TODO: @legomushroom
	 */
	public get childReferences(): ReadonlyArray<URI> {
		if (!this.chatReference) {
			return [];
		}

		return this.chatReference
			// get an array of all references
			.flatten()
			// remove self from the list
			.slice(1)
			// keep only ones that exist on disk
			.filter((ref) => ref.isFileExists)
			// convert to URIs
			.map((child) => child.uri);
	}

	setValue(
		value: Location | URI | undefined,
		isSelection: boolean,
	) {
		// if new value is `undefined` or a new `URI` is provided,
		// remove existing chat reference
		if (!value || !this.chatReference?.sameUri(value)) {
			this.removeChatReference();
		}

		// if a `URI` is provided but no chat reference exists, create it
		if (value && !this.chatReference) {
			this.chatReference = this._register(new ChatbotPromptReference(
				value,
				this.fileService,
			));

			// start resolving the chat references immediately
			this.chatReference.resolve();

			// subscribe to updates of the chat reference
			this._register(
				this.chatReference.onUpdate(
					this._onDidChangeValue.fire.bind(this._onDidChangeValue),
				),
			);
		}

		this._value = value;
		this._isSelection = isSelection;
		this._onDidChangeValue.fire();
	}

	private removeChatReference() {
		if (!this.chatReference) {
			return;
		}

		this.chatReference.dispose();
		delete this.chatReference;
	}

	toBaseEntry(): IBaseChatRequestVariableEntry {
		return {
			id: this.id,
			name: this.name,
			value: this.value,
			isFile: true,
			isDynamic: true,
			modelDescription: this.modelDescription
		};
	}
}
