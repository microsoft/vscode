/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';

import { IContextKey, RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

import { Webview } from './webview';
import { Builder } from 'vs/base/browser/builder';
import { Dimension } from 'vs/workbench/services/part/common/partService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import URI from 'vs/base/common/uri';
import { Scope } from 'vs/workbench/common/memento';

/**  A context key that is set when a webview editor has focus. */
export const KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS = new RawContextKey<boolean>('webviewEditorFocus', false);
/**  A context key that is set when the find widget find input in webview editor webview is focused. */
export const KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED = new RawContextKey<boolean>('webviewEditorFindWidgetInputFocused', false);
/**  A context key that is set when the find widget in a webview is visible. */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE = new RawContextKey<boolean>('webviewFindWidgetVisible', false);

export interface HtmlPreviewEditorViewState {
	scrollYPercentage: number;
}

/**
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class WebviewEditor extends BaseEditor {

	protected _webview: Webview;
	protected content: HTMLElement;
	protected contextKey: IContextKey<boolean>;
	protected findWidgetVisible: IContextKey<boolean>;
	protected findInputFocusContextKey: IContextKey<boolean>;

	constructor(
		id: string,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		private readonly storageService: IStorageService,
		contextKeyService: IContextKeyService,
	) {
		super(id, telemetryService, themeService);
		if (contextKeyService) {
			this.contextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.bindTo(contextKeyService);
			this.findInputFocusContextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED.bindTo(contextKeyService);
			this.findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
		}
	}

	public showFind() {
		if (this._webview) {
			this._webview.showFind();
			this.findWidgetVisible.set(true);
		}
	}

	public hideFind() {
		this.findWidgetVisible.reset();
		if (this._webview) {
			this._webview.hideFind();
		}
	}

	public showNextFindTerm() {
		if (this._webview) {
			this._webview.showNextFindTerm();
		}
	}

	public showPreviousFindTerm() {
		if (this._webview) {
			this._webview.showPreviousFindTerm();
		}
	}

	public get isWebviewEditor() {
		return true;
	}

	public reload() {
		if (this._webview) {
			this._webview.reload();
		}
	}

	public layout(dimension: Dimension): void {
		if (this._webview) {
			this._webview.layout();
		}
	}

	public focus(): void {
		if (this._webview) {
			this._webview.focus();
		}
	}

	protected abstract createEditor(parent: Builder): void;

	private get viewStateStorageKey(): string {
		return this.getId() + '.editorViewState';
	}

	protected saveViewState(resource: URI | string, editorViewState: HtmlPreviewEditorViewState): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		let editorViewStateMemento: { [key: string]: { [position: number]: HtmlPreviewEditorViewState } } = memento[this.viewStateStorageKey];
		if (!editorViewStateMemento) {
			editorViewStateMemento = Object.create(null);
			memento[this.viewStateStorageKey] = editorViewStateMemento;
		}

		let fileViewState = editorViewStateMemento[resource.toString()];
		if (!fileViewState) {
			fileViewState = Object.create(null);
			editorViewStateMemento[resource.toString()] = fileViewState;
		}

		if (typeof this.position === 'number') {
			fileViewState[this.position] = editorViewState;
		}
	}

	protected loadViewState(resource: URI | string): HtmlPreviewEditorViewState | null {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const editorViewStateMemento: { [key: string]: { [position: number]: HtmlPreviewEditorViewState } } = memento[this.viewStateStorageKey];
		if (editorViewStateMemento) {
			const fileViewState = editorViewStateMemento[resource.toString()];
			if (fileViewState) {
				return fileViewState[this.position];
			}
		}
		return null;
	}
}
