/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./accessibilityHelp';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { renderFormattedText } from 'vs/base/browser/htmlContentRenderer';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { Widget } from 'vs/base/browser/ui/widget';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommonCodeEditor, IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { editorAction, CommonEditorRegistry, EditorAction, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/common/toggleTabFocusMode';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorWidgetBackground, widgetShadow, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import * as platform from 'vs/base/common/platform';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { Selection } from 'vs/editor/common/core/selection';
import * as browser from 'vs/base/browser/browser';
import { IEditorConstructionOptions } from 'vs/editor/standalone/browser/standaloneCodeEditor';

const CONTEXT_ACCESSIBILITY_WIDGET_VISIBLE = new RawContextKey<boolean>('accessibilityHelpWidgetVisible', false);

@editorContribution
class AccessibilityHelpController extends Disposable
	implements IEditorContribution {
	private static ID = 'editor.contrib.accessibilityHelpController';

	public static get(editor: ICommonCodeEditor): AccessibilityHelpController {
		return editor.getContribution<AccessibilityHelpController>(
			AccessibilityHelpController.ID
		);
	}

	private _editor: ICodeEditor;
	private _widget: AccessibilityHelpWidget;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._editor = editor;
		this._widget = this._register(
			instantiationService.createInstance(AccessibilityHelpWidget, this._editor)
		);
	}

	public getId(): string {
		return AccessibilityHelpController.ID;
	}

	public show(): void {
		this._widget.show();
	}

	public hide(): void {
		this._widget.hide();
	}
}

const nlsNoSelection = nls.localize("noSelection", "No selection");
const nlsSingleSelectionRange = nls.localize("singleSelectionRange", "Line {0}, Column {1} ({2} selected)");
const nlsSingleSelection = nls.localize("singleSelection", "Line {0}, Column {1}");
const nlsMultiSelectionRange = nls.localize("multiSelectionRange", "{0} selections ({1} characters selected)");
const nlsMultiSelection = nls.localize("multiSelection", "{0} selections");

function getSelectionLabel(selections: Selection[], charactersSelected: number): string {
	if (!selections || selections.length === 0) {
		return nlsNoSelection;
	}

	if (selections.length === 1) {
		if (charactersSelected) {
			return strings.format(nlsSingleSelectionRange, selections[0].positionLineNumber, selections[0].positionColumn, charactersSelected);
		}

		return strings.format(nlsSingleSelection, selections[0].positionLineNumber, selections[0].positionColumn);
	}

	if (charactersSelected) {
		return strings.format(nlsMultiSelectionRange, selections.length, charactersSelected);
	}

	if (selections.length > 0) {
		return strings.format(nlsMultiSelection, selections.length);
	}

	return null;
}

class AccessibilityHelpWidget extends Widget implements IOverlayWidget {
	private static ID = 'editor.contrib.accessibilityHelpWidget';
	private static WIDTH = 500;
	private static HEIGHT = 300;

	private _editor: ICodeEditor;
	private _domNode: FastDomNode<HTMLElement>;
	private _contentDomNode: FastDomNode<HTMLElement>;
	private _isVisible: boolean;
	private _isVisibleKey: IContextKey<boolean>;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IOpenerService private _openerService: IOpenerService
	) {
		super();

		this._editor = editor;
		this._isVisibleKey = CONTEXT_ACCESSIBILITY_WIDGET_VISIBLE.bindTo(
			this._contextKeyService
		);

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setClassName('accessibilityHelpWidget');
		this._domNode.setDisplay('none');
		this._domNode.setAttribute('role', 'dialog');
		this._domNode.setAttribute('aria-hidden', 'true');

		this._contentDomNode = createFastDomNode(document.createElement('div'));
		this._contentDomNode.setAttribute('role', 'document');
		this._domNode.appendChild(this._contentDomNode);

		this._isVisible = false;

		this._register(this._editor.onDidLayoutChange(() => {
			if (this._isVisible) {
				this._layout();
			}
		}));

		// Intentionally not configurable!
		this._register(dom.addStandardDisposableListener(this._contentDomNode.domNode, 'keydown', (e) => {
			if (!this._isVisible) {
				return;
			}

			if (e.equals(KeyMod.CtrlCmd | KeyCode.KEY_E)) {
				alert(nls.localize("emergencyConfOn", "Now changing the setting `accessibilitySupport` to 'on'."));

				this._editor.updateOptions({
					accessibilitySupport: 'on'
				});

				dom.clearNode(this._contentDomNode.domNode);
				this._buildContent();
				this._contentDomNode.domNode.focus();

				e.preventDefault();
				e.stopPropagation();
			}

			if (e.equals(KeyMod.CtrlCmd | KeyCode.KEY_H)) {
				alert(nls.localize("openingDocs", "Now opening the Editor Accessibility documentation page."));

				let url = (<IEditorConstructionOptions>this._editor.getRawConfiguration()).accessibilityHelpUrl;
				if (typeof url === 'undefined') {
					url = 'https://go.microsoft.com/fwlink/?linkid=852450';
				}
				this._openerService.open(URI.parse(url));

				e.preventDefault();
				e.stopPropagation();
			}
		}));

		this.onblur(this._contentDomNode.domNode, () => {
			this.hide();
		});

		this._editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return AccessibilityHelpWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}

	public show(): void {
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;
		this._isVisibleKey.set(true);
		this._layout();
		this._domNode.setDisplay('block');
		this._domNode.setAttribute('aria-hidden', 'false');
		this._contentDomNode.domNode.tabIndex = 0;
		this._buildContent();
		this._contentDomNode.domNode.focus();
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		let kb = this._keybindingService.lookupKeybinding(commandId);
		if (kb) {
			return strings.format(msg, kb.getAriaLabel());
		}
		return strings.format(noKbMsg, commandId);
	}

	private _buildContent() {
		let opts = this._editor.getConfiguration();

		const selections = this._editor.getSelections();
		let charactersSelected = 0;

		if (selections) {
			const model = this._editor.getModel();
			if (model) {
				selections.forEach((selection) => {
					charactersSelected += model.getValueLengthInRange(selection);
				});
			}
		}

		let text = getSelectionLabel(selections, charactersSelected);

		if (opts.wrappingInfo.inDiffEditor) {
			if (opts.readOnly) {
				text += nls.localize("readonlyDiffEditor", " in a read-only pane of a diff editor.");
			} else {
				text += nls.localize("editableDiffEditor", " in a pane of a diff editor.");
			}
		} else {
			if (opts.readOnly) {
				text += nls.localize("readonlyEditor", " in a read-only code editor");
			} else {
				text += nls.localize("editableEditor", " in a code editor");
			}
		}

		switch (opts.accessibilitySupport) {
			case platform.AccessibilitySupport.Unknown:
				const turnOnMessage = (
					platform.isMacintosh
						? nls.localize("changeConfigToOnMac", "To configure the editor to be optimized for usage with a Screen Reader press Command+E now.")
						: nls.localize("changeConfigToOnWinLinux", "To configure the editor to be optimized for usage with a Screen Reader press Control+E now.")
				);
				text += '\n\n - ' + turnOnMessage;
				break;
			case platform.AccessibilitySupport.Enabled:
				text += '\n\n - ' + nls.localize("auto_on", "The editor is configured to be optimized for usage with a Screen Reader.");
				break;
			case platform.AccessibilitySupport.Disabled:
				text += '\n\n - ' + nls.localize("auto_off", "The editor is configured to never be optimized for usage with a Screen Reader, which is not the case at this time.");
				text += ' ' + turnOnMessage;
				break;
		}

		const NLS_TAB_FOCUS_MODE_ON = nls.localize("tabFocusModeOnMsg", "Pressing Tab in the current editor will move focus to the next focusable element. Toggle this behavior by pressing {0}.");
		const NLS_TAB_FOCUS_MODE_ON_NO_KB = nls.localize("tabFocusModeOnMsgNoKb", "Pressing Tab in the current editor will move focus to the next focusable element. The command {0} is currently not triggerable by a keybinding.");
		const NLS_TAB_FOCUS_MODE_OFF = nls.localize("tabFocusModeOffMsg", "Pressing Tab in the current editor will insert the tab character. Toggle this behavior by pressing {0}.");
		const NLS_TAB_FOCUS_MODE_OFF_NO_KB = nls.localize("tabFocusModeOffMsgNoKb", "Pressing Tab in the current editor will insert the tab character. The command {0} is currently not triggerable by a keybinding.");

		if (opts.tabFocusMode) {
			text += '\n\n - ' + this._descriptionForCommand(ToggleTabFocusModeAction.ID, NLS_TAB_FOCUS_MODE_ON, NLS_TAB_FOCUS_MODE_ON_NO_KB);
		} else {
			text += '\n\n - ' + this._descriptionForCommand(ToggleTabFocusModeAction.ID, NLS_TAB_FOCUS_MODE_OFF, NLS_TAB_FOCUS_MODE_OFF_NO_KB);
		}

		const openDocMessage = (
			platform.isMacintosh
				? nls.localize("openDocMac", "Press Command+H now to open a browser window with more information related to editor accessibility.")
				: nls.localize("openDocWinLinux", "Press Control+H now to open a browser window with more information related to editor accessibility.")
		);

		text += '\n\n - ' + openDocMessage;

		text += '\n\n' + nls.localize("outroMsg", "You can dismiss this tooltip and return to the editor by pressing Escape or Shift+Escape.");

		this._contentDomNode.domNode.appendChild(renderFormattedText(text));
		// Per https://www.w3.org/TR/wai-aria/roles#document, Authors SHOULD provide a title or label for documents
		this._contentDomNode.domNode.setAttribute('aria-label', text);
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._isVisibleKey.reset();
		this._domNode.setDisplay('none');
		this._domNode.setAttribute('aria-hidden', 'true');
		this._contentDomNode.domNode.tabIndex = -1;
		dom.clearNode(this._contentDomNode.domNode);

		this._editor.focus();
	}

	private _layout(): void {
		let editorLayout = this._editor.getLayoutInfo();

		let w = Math.max(5, Math.min(AccessibilityHelpWidget.WIDTH, editorLayout.width - 40));
		let h = Math.max(5, Math.min(AccessibilityHelpWidget.HEIGHT, editorLayout.height - 40));

		this._domNode.setWidth(w);
		this._domNode.setHeight(h);

		let top = Math.round((editorLayout.height - h) / 2);
		this._domNode.setTop(top);

		let left = Math.round((editorLayout.width - w) / 2);
		this._domNode.setLeft(left);
	}
}

@editorAction
class ShowAccessibilityHelpAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.showAccessibilityHelp',
			label: nls.localize("ShowAccessibilityHelpAction", "Show Accessibility Help"),
			alias: 'Show Accessibility Help',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: (browser.isIE ? KeyMod.CtrlCmd | KeyCode.F1 : KeyMod.Alt | KeyCode.F1)
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let controller = AccessibilityHelpController.get(editor);
		if (controller) {
			controller.show();
		}
	}
}

const AccessibilityHelpCommand = EditorCommand.bindToContribution<AccessibilityHelpController>(AccessibilityHelpController.get);

CommonEditorRegistry.registerEditorCommand(
	new AccessibilityHelpCommand({
		id: 'closeAccessibilityHelp',
		precondition: CONTEXT_ACCESSIBILITY_WIDGET_VISIBLE,
		handler: x => x.hide(),
		kbOpts: {
			weight: CommonEditorRegistry.commandWeight(100),
			kbExpr: EditorContextKeys.focus,
			primary: KeyCode.Escape,
			secondary: [KeyMod.Shift | KeyCode.Escape]
		}
	})
);

registerThemingParticipant((theme, collector) => {
	let widgetBackground = theme.getColor(editorWidgetBackground);
	if (widgetBackground) {
		collector.addRule(`.monaco-editor .accessibilityHelpWidget { background-color: ${widgetBackground}; }`);
	}

	let widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(`.monaco-editor .accessibilityHelpWidget { box-shadow: 0 2px 8px ${widgetShadowColor}; }`);
	}

	let hcBorder = theme.getColor(contrastBorder);
	if (hcBorder) {
		collector.addRule(`.monaco-editor .accessibilityHelpWidget { border: 2px solid ${hcBorder}; }`);
	}
});
