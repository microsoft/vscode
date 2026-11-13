/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/chatAppWindowScreenshotSetup.css';
import { $, append, clearNode, getWindow, isHTMLElement } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Dialog, DialogContentsAlignment } from '../../../../../base/browser/ui/dialog/dialog.js';
import { Action } from '../../../../../base/common/actions.js';
import { equals } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
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

/** How long the modal shows Screen Recording allowed before it closes on its own. */
const ALLOWED_CLOSE_DELAY = 1000;

/**
 * The modal that sets up attaching screenshots of other apps while macOS doesn't allow Screen Recording, which it lets
 * the user allow. After the user goes to System Settings, it checks Screen Recording again once the window regains focus. macOS only applies the permission once
 * VS Code restarts, so when the user comes back without it, the step offers to restart. Once Screen Recording is
 * allowed, the modal closes on its own, and the keybinding attaches screenshots.
 */
export class AppWindowScreenshotSetupDialog extends Disposable {

	private readonly _dialog: Dialog;
	private readonly _element: HTMLElement;
	private readonly _screenRecording: IScreenRecordingStep;
	private readonly _closeWhenAllowed = this._register(new RunOnceScheduler(() => this._dialog.dispose(), ALLOWED_CLOSE_DELAY));

	private _permission: AppWindowScreenshotPermission;
	/** Set when the user went to System Settings: once the window lost and regained focus, check again. */
	private _settingsVisit: { blurred: boolean } | undefined;
	/** Whether the user came back from System Settings while macOS still didn't allow Screen Recording. */
	private _returnedWithoutPermission = false;

	constructor(
		permission: AppWindowScreenshotPermission,
		@ILayoutService layoutService: ILayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHostService private readonly _hostService: IHostService,
		@IAppWindowScreenshotService private readonly _appWindowScreenshotService: IAppWindowScreenshotService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();
		this._permission = permission;

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
		append(this._element, $('p.app-window-screenshot-setup-description', undefined, localize('appWindowScreenshotSetup.description', "Let the agent see the app that you are building, whether it runs in a browser, a simulator, or its own window. {0} captures a window only when you ask it to.", _productService.nameShort)));
		const steps = append(this._element, $('.app-window-screenshot-setup-steps', { role: 'list', 'aria-label': localize('appWindowScreenshotSetup.steps', "Setup steps") }));
		this._screenRecording = this._createScreenRecordingStep(steps);

		this._register(_hostService.onDidChangeFocus(focused => this._onWindowFocus(focused)));

		slots.icon?.appendChild($('.app-window-screenshot-setup-icon', { 'aria-hidden': 'true' }));
		slots.body?.appendChild(this._element);
		this._render();
	}

	/** Shows the modal, and resolves once it closed. */
	async show(): Promise<void> {
		const closed = this._dialog.show();
		this._focus();
		await closed;
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

	private _render(): void {
		const targetDocument = getWindow(this._element).document;
		const focused = targetDocument.activeElement;
		const hadFocus = focused !== targetDocument.body && this._element.contains(focused);
		const product = this._productService.nameShort;

		const screenRecording = this._screenRecording;
		const granted = this._permission === 'granted' || this._permission === 'notRequired';
		const restricted = this._permission === 'restricted';
		this._renderStep(
			screenRecording,
			localize('appWindowScreenshotSetup.screenRecording', "Screen Recording"),
			granted ? localize('appWindowScreenshotSetup.allowed.state', "Allowed") : restricted ? localize('appWindowScreenshotSetup.restricted.state', "Restricted") : localize('appWindowScreenshotSetup.notAllowed.state', "Not allowed"),
			granted ? localize('appWindowScreenshotSetup.allowed.description', "{0} can see the windows of other apps.", product)
				: restricted ? localize('appWindowScreenshotSetup.restricted.description', "This Mac doesn't let {0} record the screen.", product)
					: this._returnedWithoutPermission ? localize('appWindowScreenshotSetup.restart.description', "If you turned it on, restart {0} to apply it.", product)
						: localize('appWindowScreenshotSetup.notAllowed.description', "Lets {0} see the windows of other apps.", product),
			granted,
			granted || restricted ? []
				: this._returnedWithoutPermission ? [screenRecording.recheck, screenRecording.openSettings.element, screenRecording.restart.element]
					: [screenRecording.recheck, screenRecording.allow.element],
		);

		if (granted && !this._closeWhenAllowed.isScheduled()) {
			this._closeWhenAllowed.schedule();
		}
		// A control that the steps kept gets focus back, and when they removed it, focus moves to the next thing to do.
		if (hadFocus && targetDocument.activeElement !== focused) {
			if (isHTMLElement(focused) && this._element.contains(focused)) {
				focused.focus();
			} else {
				this._focus();
			}
		}
	}

	private _renderStep(step: IStepElements, name: string, state: string, description: string, done: boolean, controls: readonly HTMLElement[]): void {
		step.description.textContent = description;
		step.status.className = 'app-window-screenshot-setup-step-status';
		if (done) {
			step.status.classList.add('done', ...ThemeIcon.asClassNameArray(Codicon.passFilled));
		}
		// Removed, not hidden: the modal moves focus itself across every control in its body, hidden ones too.
		if (!equals(Array.from(step.controls.children), controls)) {
			clearNode(step.controls);
			step.controls.append(...controls);
		}
		step.row.setAttribute('aria-label', localize('appWindowScreenshotSetup.step', "{0}, {1}. {2}", name, state, description));
	}

	/** Moves focus to the next thing to do: restarting, or allowing Screen Recording. */
	private _focus(): void {
		const screenRecording = this._screenRecording;
		if (screenRecording.restart.element.isConnected) {
			screenRecording.restart.focus();
		} else if (screenRecording.allow.element.isConnected) {
			screenRecording.allow.focus();
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
}
