/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./accessibility';
import * as nls from 'vs/nls';
import { $, append, addStandardDisposableListener, clearNode } from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions, EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { AccessibilitySupport, IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { TabFocus, TabFocusContext } from 'vs/editor/browser/config/tabFocus';

const CONTEXT_ACCESSIBILITY_WIDGET_VISIBLE = new RawContextKey<boolean>('accessibilityHelpWidgetVisible', false);

export class AccessibilityHelpController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.accessibilityHelpController';

	public static get(editor: ICodeEditor): AccessibilityHelpController | null {
		return editor.getContribution<AccessibilityHelpController>(AccessibilityHelpController.ID);
	}

	private _editor: ICodeEditor;
	private _widget?: AccessibilityHelpWidget;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this._editor = editor;
	}

	public show(): void {
		if (!this._widget) {
			this._widget = this._register(this.instantiationService.createInstance(AccessibilityHelpWidget, this._editor));
		}
		this._widget.show();
	}

	public hide(): void {
		this._widget?.hide();
	}
}

class AccessibilityHelpWidget extends Widget implements IOverlayWidget {

	private static readonly ID = 'editor.contrib.accessibilityHelpWidget';
	private static readonly WIDTH = 500;
	private static readonly HEIGHT = 320;

	private _editor: ICodeEditor;
	private _domNode: FastDomNode<HTMLElement>;
	private _contentDomNode: FastDomNode<HTMLElement>;
	private _isVisible: boolean;
	private _isVisibleKey: IContextKey<boolean>;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		super();

		this._editor = editor;
		this._isVisibleKey = CONTEXT_ACCESSIBILITY_WIDGET_VISIBLE.bindTo(this._contextKeyService);

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setClassName('accessibilityHelpWidget');
		this._domNode.setWidth(AccessibilityHelpWidget.WIDTH);
		this._domNode.setHeight(AccessibilityHelpWidget.HEIGHT);
		this._domNode.setDisplay('none');
		this._domNode.setAttribute('role', 'dialog');
		this._domNode.setAttribute('aria-modal', 'true');
		this._domNode.setAttribute('aria-hidden', 'true');

		const heading = append(this._domNode.domNode, $('h1', undefined, nls.localize('accessibilityHelpTitle', "Accessibility Help")));
		heading.id = 'help-dialog-heading';
		this._domNode.setAttribute('aria-labelledby', heading.id);

		this._contentDomNode = createFastDomNode(document.createElement('div'));
		this._contentDomNode.setAttribute('role', 'document');
		this._contentDomNode.domNode.id = 'help-dialog-content';
		this._domNode.appendChild(this._contentDomNode);
		this._domNode.setAttribute('aria-describedby', this._contentDomNode.domNode.id);

		this._isVisible = false;

		this._register(this._editor.onDidLayoutChange(() => {
			if (this._isVisible) {
				this._layout();
			}
		}));

		// Intentionally not configurable!
		this._register(addStandardDisposableListener(this._contentDomNode.domNode, 'keydown', (e) => {
			if (!this._isVisible) {
				return;
			}

			if (e.equals(KeyMod.CtrlCmd | KeyCode.KeyE)) {
				alert(nls.localize('emergencyConfOn', "Now changing the setting `editor.accessibilitySupport` to 'on'."));

				this._configurationService.updateValue('editor.accessibilitySupport', 'on', ConfigurationTarget.USER);

				e.preventDefault();
				e.stopPropagation();
			}

			if (e.equals(KeyMod.CtrlCmd | KeyCode.KeyH)) {
				alert(nls.localize('openingDocs', "Now opening the VS Code Accessibility documentation page."));

				this._openerService.open(URI.parse('https://go.microsoft.com/fwlink/?linkid=851010'));

				e.preventDefault();
				e.stopPropagation();
			}
		}));

		this.onblur(this._contentDomNode.domNode, () => {
			this.hide();
		});

		this._editor.addOverlayWidget(this);
	}

	public override dispose(): void {
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
		const kb = this._keybindingService.lookupKeybinding(commandId);
		if (kb) {
			return strings.format(msg, kb.getAriaLabel());
		}
		return strings.format(noKbMsg, commandId);
	}

	private _buildContent() {
		const contentDomNode = this._contentDomNode.domNode;
		const options = this._editor.getOptions();

		append(contentDomNode, $('p', undefined, nls.localize('introMsg', "Thank you for trying out VS Code's accessibility options.")));
		append(contentDomNode, $('p', undefined, nls.localize('status', "Status:")));

		const configuredValue = this._configurationService.getValue<IEditorOptions>('editor').accessibilitySupport;
		const actualValue = options.get(EditorOption.accessibilitySupport);

		const emergencyTurnOnMessage = (
			platform.isMacintosh
				? nls.localize('changeConfigToOnMac', "To configure the editor to be permanently optimized for usage with a Screen Reader press Command+E now.")
				: nls.localize('changeConfigToOnWinLinux', "To configure the editor to be permanently optimized for usage with a Screen Reader press Control+E now.")
		);

		const instructions = append(contentDomNode, $('ul'));
		switch (configuredValue) {
			case 'auto':
				switch (actualValue) {
					case AccessibilitySupport.Unknown:
						// Should never happen in VS Code
						append(instructions, $('li', undefined, nls.localize('auto_unknown', "The editor is configured to use platform APIs to detect when a Screen Reader is attached, but the current runtime does not support this.")));
						break;
					case AccessibilitySupport.Enabled:
						append(instructions, $('li', undefined, nls.localize('auto_on', "The editor has automatically detected a Screen Reader is attached.")));
						break;
					case AccessibilitySupport.Disabled:
						append(instructions, $('li', undefined, nls.localize('auto_off', "The editor is configured to automatically detect when a Screen Reader is attached, which is not the case at this time."), ' ' + emergencyTurnOnMessage));
						break;
				}
				break;
			case 'on':
				append(instructions, $('li', undefined, nls.localize('configuredOn', "The editor is configured to be permanently optimized for usage with a Screen Reader - you can change this via the command `Toggle Screen Reader Accessibility Mode` or by editing the setting `editor.accessibilitySupport`")));
				break;
			case 'off':
				append(instructions, $('li', undefined, nls.localize('configuredOff', "The editor is configured to never be optimized for usage with a Screen Reader.", ' ' + emergencyTurnOnMessage)));
				break;
		}

		const NLS_TAB_FOCUS_MODE_ON = nls.localize('tabFocusModeOnMsg', "Pressing Tab in the current editor will move focus to the next focusable element. Toggle this behavior by pressing {0}.");
		const NLS_TAB_FOCUS_MODE_ON_NO_KB = nls.localize('tabFocusModeOnMsgNoKb', "Pressing Tab in the current editor will move focus to the next focusable element. The command {0} is currently not triggerable by a keybinding.");
		const NLS_TAB_FOCUS_MODE_OFF = nls.localize('tabFocusModeOffMsg', "Pressing Tab in the current editor will insert the tab character. Toggle this behavior by pressing {0}.");
		const NLS_TAB_FOCUS_MODE_OFF_NO_KB = nls.localize('tabFocusModeOffMsgNoKb', "Pressing Tab in the current editor will insert the tab character. The command {0} is currently not triggerable by a keybinding.");

		if (TabFocus.getTabFocusMode(TabFocusContext.Editor)) {
			append(instructions, $('li', undefined, this._descriptionForCommand(ToggleTabFocusModeAction.ID, NLS_TAB_FOCUS_MODE_ON, NLS_TAB_FOCUS_MODE_ON_NO_KB)));
		} else {
			append(instructions, $('li', undefined, this._descriptionForCommand(ToggleTabFocusModeAction.ID, NLS_TAB_FOCUS_MODE_OFF, NLS_TAB_FOCUS_MODE_OFF_NO_KB)));
		}

		append(contentDomNode, (
			platform.isMacintosh
				? nls.localize('openDocMac', "Press Command+H now to open a browser window with more VS Code information related to Accessibility.")
				: nls.localize('openDocWinLinux', "Press Control+H now to open a browser window with more VS Code information related to Accessibility.")
		));

		append(contentDomNode, $('p', undefined, nls.localize('outroMsg', "You can dismiss this tooltip and return to the editor by pressing Escape or Shift+Escape.")));
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
		clearNode(this._contentDomNode.domNode);

		this._editor.focus();
	}

	private _layout(): void {
		const editorLayout = this._editor.getLayoutInfo();

		const width = Math.min(editorLayout.width - 40, AccessibilityHelpWidget.WIDTH);
		const height = Math.min(editorLayout.height - 40, AccessibilityHelpWidget.HEIGHT);

		this._domNode.setTop(Math.round((editorLayout.height - height) / 2));
		this._domNode.setLeft(Math.round((editorLayout.width - width) / 2));
		this._domNode.setWidth(width);
		this._domNode.setHeight(height);
	}
}

class ToggleScreenReaderMode extends Action2 {

	constructor() {
		super({
			id: 'editor.action.toggleScreenReaderAccessibilityMode',
			title: { value: nls.localize('toggleScreenReaderMode', "Toggle Screen Reader Accessibility Mode"), original: 'Toggle Screen Reader Accessibility Mode' },
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const accessibiiltyService = accessor.get(IAccessibilityService);
		const configurationService = accessor.get(IConfigurationService);
		configurationService.updateValue('editor.accessibilitySupport', accessibiiltyService.isScreenReaderOptimized() ? 'off' : 'on', ConfigurationTarget.USER);
	}
}

registerAction2(ToggleScreenReaderMode);
