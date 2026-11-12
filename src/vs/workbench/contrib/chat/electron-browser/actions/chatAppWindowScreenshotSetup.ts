/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/chatAppWindowScreenshotSetup.css';
import { $, append, clearNode, getWindow } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Dialog, DialogContentsAlignment } from '../../../../../base/browser/ui/dialog/dialog.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { defaultButtonStyles, defaultDialogStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../browser/parts/dialogs/dialog.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { AppWindowScreenshotPermission, IAppWindowScreenshotService } from '../../../screenshotTool/electron-browser/appWindowScreenshot.js';

/** A keybinding that the setup offers to make work while another app is in front. */
export interface IAppWindowScreenshotShortcut {
	/** The label of the keybinding, as the user sees it in menus. */
	readonly label: string;
	/** Whether it already works while another app is in front. */
	readonly enabled: boolean;
	/** Makes it work while another app is in front, and resolves whether it does. */
	enable(): Promise<boolean>;
}

interface IStepElements {
	readonly row: HTMLElement;
	readonly description: HTMLElement;
	readonly status: HTMLElement;
	readonly controls: HTMLElement;
}

interface IScreenRecordingStep extends IStepElements {
	readonly recheck: HTMLElement;
	readonly allow: Button;
	/** Opens System Settings again, beside Restart, which is the next thing to do once the user came back. */
	readonly openSettings: Button;
	readonly restart: Button;
}

interface IShortcutStep extends IStepElements {
	readonly shortcut: IAppWindowScreenshotShortcut;
	readonly enable: Button;
}

/**
 * The modal that sets up attaching screenshots of other apps, one step at a time. It explains what a capture takes,
 * lets the user allow Screen Recording on macOS, and offers to make the keybinding work while another app is in front.
 * After the user goes to System Settings, it checks Screen Recording again once the window regains focus. macOS only
 * applies the permission once VS Code restarts, so when the user comes back without it, the step offers to restart.
 * The user can only continue to the capture once it has the permission that it needs.
 */
export class AppWindowScreenshotSetupDialog extends Disposable {

	private readonly _dialog: Dialog;
	private readonly _element: HTMLElement;
	private readonly _screenRecording: IScreenRecordingStep | undefined;
	private readonly _shortcut: IShortcutStep | undefined;
	private readonly _attach: Button;

	private _permission: AppWindowScreenshotPermission;
	private _shortcutEnabled: boolean;
	/** Set when the user went to System Settings: once the window lost and regained focus, check again. */
	private _settingsVisit: { blurred: boolean } | undefined;
	/** Whether the user came back from System Settings while macOS still didn't allow Screen Recording. */
	private _returnedWithoutPermission = false;
	private _continue = false;

	constructor(
		permission: AppWindowScreenshotPermission,
		shortcut: IAppWindowScreenshotShortcut | undefined,
		@ILayoutService layoutService: ILayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHostService private readonly _hostService: IHostService,
		@IAppWindowScreenshotService private readonly _appWindowScreenshotService: IAppWindowScreenshotService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();
		this._permission = permission;
		this._shortcutEnabled = !!shortcut?.enabled;

		// The dialog renders its icon and body when it is created, so it comes first and takes the elements after.
		const slots: { icon?: HTMLElement; body?: HTMLElement } = {};
		this._dialog = this._register(new Dialog(
			layoutService.activeContainer,
			localize('appWindowScreenshotSetup.title', "Attach Screenshots of Other Apps"),
			[],
			createWorkbenchDialogOptions({
				type: 'none',
				alignment: DialogContentsAlignment.Vertical,
				renderIcon: container => { slots.icon = container; },
				renderBody: container => { slots.body = container; },
				extraClasses: ['app-window-screenshot-setup-dialog'],
				disableDefaultAction: true,
				// The body has no links, so the dialog mustn't style the Check Again action's label like one.
				dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
			}, keybindingService, layoutService, _hostService),
		));

		this._element = $('.app-window-screenshot-setup');
		append(this._element, $('p.app-window-screenshot-setup-description', undefined, localize('appWindowScreenshotSetup.description', "Show chat the app that you are building, in a browser, a simulator, or its own window. {0} captures a window only when you ask it to, and never its own windows.", _productService.nameShort)));
		if (permission !== 'notRequired' || shortcut) {
			const steps = append(this._element, $('.app-window-screenshot-setup-steps', { role: 'list', 'aria-label': localize('appWindowScreenshotSetup.steps', "Setup steps") }));
			if (permission !== 'notRequired') {
				this._screenRecording = this._createScreenRecordingStep(steps);
			}
			if (shortcut) {
				this._shortcut = this._createShortcutStep(steps, shortcut);
			}
		}
		append(this._element, $('p.app-window-screenshot-setup-note', undefined, localize('appWindowScreenshotSetup.note', "The screenshot stays in the chat input until you send it, so you can mark it up or remove it. Check it first: screenshots can show private information or text that influences the agent.")));
		const footer = append(this._element, $('.app-window-screenshot-setup-footer'));
		this._attach = this._register(new Button(footer, { ...defaultButtonStyles }));
		this._attach.label = localize('appWindowScreenshotSetup.attach', "Attach Screenshot");
		this._register(this._attach.onDidClick(() => {
			this._continue = true;
			this._dialog.dispose();
		}));

		this._register(_hostService.onDidChangeFocus(focused => this._onWindowFocus(focused)));

		slots.icon?.appendChild($('.app-window-screenshot-setup-icon', { 'aria-hidden': 'true' }));
		slots.body?.appendChild(this._element);
		this._render();
	}

	/** Shows the modal, and resolves whether the user continued to the capture. */
	async show(): Promise<boolean> {
		const closed = this._dialog.show();
		this._focus();
		await closed;
		return this._continue;
	}

	private _createStep(list: HTMLElement, icon: ThemeIcon, name: string): IStepElements {
		const row = append(list, $('.app-window-screenshot-setup-step', { role: 'listitem' }));
		append(row, $(`span.app-window-screenshot-setup-step-icon${ThemeIcon.asCSSSelector(icon)}`, { 'aria-hidden': 'true' }));
		const text = append(row, $('.app-window-screenshot-setup-step-text', { 'aria-hidden': 'true' }));
		append(text, $('span.app-window-screenshot-setup-step-name', undefined, name));
		const description = append(text, $('span.app-window-screenshot-setup-step-description'));
		const status = append(row, $('span.app-window-screenshot-setup-step-status', { 'aria-hidden': 'true' }));
		const controls = append(row, $('.app-window-screenshot-setup-step-controls'));
		return { row, description, status, controls };
	}

	private _createScreenRecordingStep(list: HTMLElement): IScreenRecordingStep {
		const step = this._createStep(list, Codicon.eye, localize('appWindowScreenshotSetup.screenRecording', "Screen Recording"));

		const recheck = $('.app-window-screenshot-setup-recheck');
		const recheckAction = this._register(new Action('appWindowScreenshotSetup.recheck', localize('appWindowScreenshotSetup.recheck', "Check Again"), ThemeIcon.asClassName(Codicon.refresh), true, () => this._checkPermission(false)));
		recheckAction.tooltip = localize('appWindowScreenshotSetup.recheck.tooltip', "Check Screen Recording Again");
		// The modal stops every key release, so the action runs as the key goes down.
		const actionBar = this._register(new ActionBar(recheck, { triggerKeys: { keys: [KeyCode.Enter, KeyCode.Space], keyDown: true } }));
		actionBar.push(recheckAction, { icon: true, label: false });

		const allow = this._register(new Button(step.controls, { ...defaultButtonStyles, small: true }));
		allow.label = localize('appWindowScreenshotSetup.allow', "Allow in Settings");
		allow.setAriaLabel(localize('appWindowScreenshotSetup.allow.aria', "Allow Screen Recording in System Settings"));
		this._register(allow.onDidClick(() => this._allowInSettings()));

		const openSettings = this._register(new Button(step.controls, { ...defaultButtonStyles, secondary: true, small: true }));
		openSettings.label = localize('appWindowScreenshotSetup.openSettings', "Open Settings");
		openSettings.setAriaLabel(localize('appWindowScreenshotSetup.openSettings.aria', "Open Screen Recording in System Settings"));
		this._register(openSettings.onDidClick(() => this._allowInSettings()));

		const restart = this._register(new Button(step.controls, { ...defaultButtonStyles, small: true }));
		restart.label = localize('appWindowScreenshotSetup.restart', "Restart");
		restart.setAriaLabel(localize('appWindowScreenshotSetup.restart.aria', "Restart {0} to Apply Screen Recording", this._productService.nameShort));
		this._register(restart.onDidClick(() => { void this._hostService.restart(); }));

		return { ...step, recheck, allow, openSettings, restart };
	}

	private _createShortcutStep(list: HTMLElement, shortcut: IAppWindowScreenshotShortcut): IShortcutStep {
		const step = this._createStep(list, Codicon.keyboard, localize('appWindowScreenshotSetup.shortcut', "Shortcut in Other Apps"));
		const enable = this._register(new Button(step.controls, { ...defaultButtonStyles, secondary: true, small: true }));
		enable.label = localize('appWindowScreenshotSetup.enableShortcut', "Turn On");
		enable.setAriaLabel(localize('appWindowScreenshotSetup.enableShortcut.aria', "Turn On {0} in Other Apps", shortcut.label));
		this._register(enable.onDidClick(() => this._enableShortcut()));
		return { ...step, shortcut, enable };
	}

	private _render(): void {
		const targetDocument = getWindow(this._element).document;
		const hadFocus = targetDocument.activeElement !== targetDocument.body && this._element.contains(targetDocument.activeElement);
		const product = this._productService.nameShort;

		const screenRecording = this._screenRecording;
		if (screenRecording) {
			const granted = this._permission === 'granted';
			const restricted = this._permission === 'restricted';
			this._renderStep(
				screenRecording,
				localize('appWindowScreenshotSetup.screenRecording', "Screen Recording"),
				granted ? localize('appWindowScreenshotSetup.allowed.state', "Allowed") : restricted ? localize('appWindowScreenshotSetup.restricted.state', "Restricted") : localize('appWindowScreenshotSetup.notAllowed.state', "Not allowed"),
				granted ? localize('appWindowScreenshotSetup.allowed.description', "{0} can see the windows of other apps.", product)
					: restricted ? localize('appWindowScreenshotSetup.restricted.description', "Your organization doesn't let {0} record the screen.", product)
						: this._returnedWithoutPermission ? localize('appWindowScreenshotSetup.restart.description', "Turned it on? Restart {0} to apply it.", product)
							: localize('appWindowScreenshotSetup.notAllowed.description', "Lets {0} see the windows of other apps.", product),
				granted,
				granted || restricted ? []
					: this._returnedWithoutPermission ? [screenRecording.recheck, screenRecording.openSettings.element, screenRecording.restart.element]
						: [screenRecording.recheck, screenRecording.allow.element],
			);
		}

		const shortcut = this._shortcut;
		if (shortcut) {
			this._renderStep(
				shortcut,
				localize('appWindowScreenshotSetup.shortcut', "Shortcut in Other Apps"),
				this._shortcutEnabled ? localize('appWindowScreenshotSetup.shortcutOn.state', "On") : localize('appWindowScreenshotSetup.shortcutOff.state', "Off"),
				this._shortcutEnabled
					? localize('appWindowScreenshotSetup.shortcutOn.description', "Press {0} while another app is in front.", shortcut.shortcut.label)
					: localize('appWindowScreenshotSetup.shortcutOff.description', "Use {0} while another app is in front, too.", shortcut.shortcut.label),
				this._shortcutEnabled,
				this._shortcutEnabled ? [] : [shortcut.enable.element],
			);
		}

		this._attach.enabled = this._permission === 'granted' || this._permission === 'notRequired';
		// Focus was on a control that the step removed.
		if (hadFocus && !this._element.contains(targetDocument.activeElement)) {
			this._focus();
		}
	}

	private _renderStep(step: IStepElements, name: string, state: string, description: string, done: boolean, controls: readonly HTMLElement[]): void {
		step.description.textContent = description;
		step.status.className = 'app-window-screenshot-setup-step-status';
		if (done) {
			step.status.classList.add('done', ...ThemeIcon.asClassNameArray(Codicon.passFilled));
		}
		// Removed, not hidden: the modal moves focus itself across every control in its body, hidden ones too.
		clearNode(step.controls);
		step.controls.append(...controls);
		step.row.setAttribute('aria-label', localize('appWindowScreenshotSetup.step', "{0}, {1}. {2}", name, state, description));
	}

	/** Moves focus to the next thing to do: attaching, restarting, or allowing Screen Recording. */
	private _focus(): void {
		if (this._attach.enabled) {
			this._attach.focus();
		} else if (this._screenRecording?.restart.element.isConnected) {
			this._screenRecording.restart.focus();
		} else if (this._screenRecording?.allow.element.isConnected) {
			this._screenRecording.allow.focus();
		}
	}

	private async _allowInSettings(): Promise<void> {
		this._settingsVisit = { blurred: false };
		await this._appWindowScreenshotService.requestPermission();
	}

	private _onWindowFocus(focused: boolean): void {
		const visit = this._settingsVisit;
		if (!visit) {
			return;
		}
		if (!focused) {
			visit.blurred = true;
		} else if (visit.blurred) {
			this._settingsVisit = undefined;
			void this._checkPermission(true);
		}
	}

	private async _checkPermission(returned: boolean): Promise<void> {
		const previous = this._permission;
		const permission = await this._appWindowScreenshotService.getPermission();
		if (this._store.isDisposed) {
			return;
		}
		this._permission = permission;
		if (returned && permission === 'notGranted') {
			this._returnedWithoutPermission = true;
		}
		this._render();
		if (permission === 'granted') {
			if (previous !== 'granted') {
				status(localize('appWindowScreenshotSetup.allowed', "Screen Recording is allowed."));
			}
		} else if (permission === 'notGranted') {
			status(localize('appWindowScreenshotSetup.notAllowed', "Screen Recording is not allowed yet. If you turned it on in System Settings, restart {0}.", this._productService.nameShort));
		}
	}

	private async _enableShortcut(): Promise<void> {
		const shortcut = this._shortcut?.shortcut;
		if (!shortcut || !await shortcut.enable() || this._store.isDisposed) {
			return;
		}
		this._shortcutEnabled = true;
		this._render();
		status(localize('appWindowScreenshotSetup.shortcutEnabled', "{0} now works while another app is in front.", shortcut.label));
	}
}
