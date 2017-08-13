/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseWebviewEditor } from 'vs/workbench/browser/parts/editor/webviewEditor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Command } from 'vs/editor/common/editorCommonExtensions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ContextKeyExpr, IContextKey, RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { default as Webview } from './webview';
import { Builder } from 'vs/base/browser/builder';

export interface HtmlPreviewEditorViewState {
	scrollYPercentage: number;
}

/**  A context key that is set when a webview editor has focus. */
export const KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS = new RawContextKey<boolean>('webviewEditorFocus', undefined);
/**  A context key that is set when a webview editor does not have focus. */
export const KEYBINDING_CONTEXT_WEBVIEWEDITOR_NOT_FOCUSED: ContextKeyExpr = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.toNegated();

/**
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class WebviewEditor extends BaseWebviewEditor {

	protected _webviewFocusContextKey: IContextKey<boolean>;
	protected _webview: Webview;
	protected content: HTMLElement;
	protected contextKey: IContextKey<boolean>;

	constructor(
		id: string,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		storageService: IStorageService,
		contextKeyService: IContextKeyService,
	) {
		super(id, telemetryService, themeService, storageService);
		if (contextKeyService) {
			this.contextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.bindTo(contextKeyService);
		}
	}
	/*
		public showFind() {
			if (this._webview) {
				this._webview.showFind();
			}
		}

		public hideFind() {
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


		public nextMatchFindWidget() {
			if (this._webview) {
				this._webview.nextMatchFindWidget();
			}
		}

		public previousMatchFindWidget() {
			if (this._webview) {
				this._webview.previousMatchFindWidget();
			}
		}
	 */
	public updateStyles() {
		super.updateStyles();
		if (this._webview) {
			this._webview.style(this.themeService.getTheme());
		}
	}

	public get isWebviewEditor() {
		return true;
	}

	protected abstract createEditor(parent: Builder);
}

abstract class WebViewEditorCommand extends Command {

	public abstract runCommand(accessor: ServicesAccessor, args: any): void;

	protected getWebViewEditor(accessor: ServicesAccessor): WebviewEditor {
		const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor() as WebviewEditor;
		if (activeEditor.isWebviewEditor) {
			return activeEditor;
		}
		return null;
	}
}
/*
class ShowWebViewEditorFindCommand extends WebViewEditorCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.showFind();
		}
	}
}
const showFindCommand = new ShowWebViewEditorFindCommand({
	id: 'editor.action.webvieweditor.showFind',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(showFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class HideWebViewEditorFindCommand extends WebViewEditorCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.hideFind();
		}
	}
}
const hideCommand = new HideWebViewEditorFindCommand({
	id: 'editor.action.webvieweditor.hideFind',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		primary: KeyCode.Escape
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(hideCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class NextMatchWebViewEditorFindCommand extends WebViewEditorCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.nextMatchFindWidget();
		}
	}
}
const nextMatchFindCommand = new NextMatchWebViewEditorFindCommand({
	id: 'editor.action.webvieweditor.find.nextMatch',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		primary: KeyCode.F3,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(nextMatchFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class PreviousMatchWebViewEditorFindCommand extends WebViewEditorCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.previousMatchFindWidget();
		}
	}
}
const previousMatchFindCommand = new PreviousMatchWebViewEditorFindCommand({
	id: 'editor.action.webvieweditor.find.previousMatch',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		primary: KeyMod.Shift | KeyCode.F3,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G, secondary: [KeyMod.Shift | KeyCode.F3] }
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(previousMatchFindCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class ShowNextFindTermWebViewEditorFindCommand extends WebViewEditorCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.showNextFindTerm();
		}
	}
}
const showNextFindTermCommand = new ShowNextFindTermWebViewEditorFindCommand({
	id: 'editor.action.webvieweditor.find.shownextfindterm',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		kbExpr: KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_INPUT_FOCUSED,
		primary: KeyMod.Alt | KeyCode.DownArrow
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(showNextFindTermCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

class ShowPreviousFindTermExtensionEditorFindCommand extends WebViewEditorCommand {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.showPreviousFindTerm();
		}
	}
}
const showPreviousFindTermCommand = new ShowPreviousFindTermExtensionEditorFindCommand({
	id: 'editor.action.webvieweditor.find.showpreviousfindterm',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		kbExpr: KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_INPUT_FOCUSED,
		primary: KeyMod.Alt | KeyCode.UpArrow
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(showPreviousFindTermCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));
 */