/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import URI from 'vs/base/common/uri';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Scope } from 'vs/workbench/common/memento';

import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Command } from 'vs/editor/common/editorCommonExtensions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

import WebView, { KEYBINDING_CONTEXT_WEBVIEW_FOCUS } from 'vs/workbench/parts/html/browser/webview';
import { Builder } from 'vs/base/browser/builder';

export interface HtmlPreviewEditorViewState {
	scrollYPercentage: number;
}

interface HtmlPreviewEditorViewStates {
	0?: HtmlPreviewEditorViewState;
	1?: HtmlPreviewEditorViewState;
	2?: HtmlPreviewEditorViewState;
}

/**
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class WebviewEditor extends BaseEditor {

	protected _webviewFocusContextKey: IContextKey<boolean>;
	protected _webview: WebView;
	protected content: HTMLElement;

	static class: string = 'htmlPreviewPart';

	constructor(
		id: string,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		private storageService: IStorageService,
	) {
		super(id, telemetryService, themeService);
		this.onThemeChange = this.onThemeChanged.bind(this);
	}

	private get viewStateStorageKey(): string {
		return this.getId() + '.editorViewState';
	}

	protected saveViewState(resource: URI | string, editorViewState: HtmlPreviewEditorViewState): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		let editorViewStateMemento = memento[this.viewStateStorageKey];
		if (!editorViewStateMemento) {
			editorViewStateMemento = Object.create(null);
			memento[this.viewStateStorageKey] = editorViewStateMemento;
		}

		let fileViewState: HtmlPreviewEditorViewStates = editorViewStateMemento[resource.toString()];
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
		const editorViewStateMemento = memento[this.viewStateStorageKey];
		if (editorViewStateMemento) {
			const fileViewState: HtmlPreviewEditorViewStates = editorViewStateMemento[resource.toString()];
			if (fileViewState) {
				return fileViewState[this.position];
			}
		}
		return null;
	}

	public showFind() {
		if (this._webview) {
			this._webview.showFind();
		}
	}

	protected onThemeChanged(themeId: ITheme) {
		if (this._webview) {
			this._webview.style(themeId);
		}
	}

	public get isWebviewEditor() {
		return true;
	}

	protected abstract createEditor(parent: Builder);
}

class StartWebViewEditorFindCommand extends Command {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.showFind();
		}
	}

	private getWebViewEditor(accessor: ServicesAccessor): WebviewEditor {
		const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor() as WebviewEditor;
		if (activeEditor.isWebviewEditor) {
			return activeEditor;
		}
		return null;
	}
}
const command = new StartWebViewEditorFindCommand({
	id: 'editor.action.webview.find',
	precondition: KEYBINDING_CONTEXT_WEBVIEW_FOCUS,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(command.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));