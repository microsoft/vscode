/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Location } from '../../../../../editor/common/languages.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { IBaseChatRequestVariableEntry, IChatRequestImplicitVariableEntry } from '../../common/chatModel.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';

export class ChatImplicitContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.implicitContext';

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService editorService: IEditorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		const activeEditorDisposables = this._register(new DisposableStore());
		this._register(Event.runAndSubscribe(
			editorService.onDidActiveEditorChange,
			(() => {
				activeEditorDisposables.clear();
				const codeEditor = codeEditorService.getActiveCodeEditor();
				if (codeEditor) {
					activeEditorDisposables.add(codeEditor.onDidChangeModel(() => this.updateImplicitContext()));
					activeEditorDisposables.add(Event.debounce(codeEditor.onDidChangeCursorSelection, () => undefined, 500)(() => this.updateImplicitContext()));
					activeEditorDisposables.add(Event.debounce(codeEditor.onDidScrollChange, () => undefined, 500)(() => this.updateImplicitContext()));
				}

				this.updateImplicitContext();
			})));
		this._register(chatWidgetService.onDidAddWidget(widget => this.updateImplicitContext(widget)));
	}

	private updateImplicitContext(updateWidget?: IChatWidget): void {
		const codeEditor = this.codeEditorService.getActiveCodeEditor();
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

		const widgets = updateWidget ? [updateWidget] : this.chatWidgetService.getAllWidgets(ChatAgentLocation.Panel);
		for (const widget of widgets) {
			if (widget.input.implicitContext) {
				widget.input.implicitContext.setValue(newValue, isSelection);
			}
		}
	}
}

export class ChatImplicitContext extends Disposable implements IChatRequestImplicitVariableEntry {
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

	private _onDidChangeValue = new Emitter<void>();
	readonly onDidChangeValue = this._onDidChangeValue.event;

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

	constructor(value?: Location | URI) {
		super();
		this._value = value;
	}

	setValue(value: Location | URI | undefined, isSelection: boolean) {
		this._value = value;
		this._isSelection = isSelection;
		this._onDidChangeValue.fire();
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
