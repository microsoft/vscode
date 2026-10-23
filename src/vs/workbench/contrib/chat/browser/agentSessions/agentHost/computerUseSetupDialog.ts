/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/computerUseSetup.css';
import { $, addDisposableListener, append, EventType, getWindow, isAncestor } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { alert, status } from '../../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Dialog, DialogContentsAlignment } from '../../../../../../base/browser/ui/dialog/dialog.js';
import { getBaseLayerHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import type { CodeWindow } from '../../../../../../base/browser/window.js';
import { Action } from '../../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, type IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { computerUsePermissions, type ComputerUsePermission, type ComputerUsePermissionState, type IComputerUseSetupActionV1, type IComputerUseStatusV1 } from '../../../../../../platform/agentHost/common/computerUse.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { defaultButtonStyles, defaultDialogStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../../browser/parts/dialogs/dialog.js';
import { IHostService } from '../../../../../services/host/browser/host.js';

/** Lets the setup modal hand Copilot Computer Use to System Settings by hand; only desktop clients can. */
export interface IComputerUseHelperAppSupport {
	/** Drags the app at `path` out of `targetWindow` as a file; call it from a `dragstart` handler that cancels the HTML drag. */
	startDrag(path: string, targetWindow: CodeWindow): void;
}

/** The status the setup modal shows and the actions it sends. */
export interface IComputerUseSetupModel {
	/** The local Agent Host's setup status; `undefined` while it publishes none. */
	readonly status: IObservable<IComputerUseStatusV1 | undefined>;
	/** Present when this client can hand Copilot Computer Use to System Settings by hand. */
	readonly helperApp?: IComputerUseHelperAppSupport;
	/** Sends `action` for the current round of setup `setupId`; `false` when the setup doesn't offer it now. */
	request(setupId: string, action: IComputerUseSetupActionV1): boolean;
}

// #region View model

/** One permission the setup needs. */
export interface IComputerUseSetupRowView {
	readonly permission: ComputerUsePermission;
	readonly state: ComputerUsePermissionState;
	/** Whether the user turns this permission on next: the first one that isn't granted while the setup waits. */
	readonly current: boolean;
}

/** What the modal shows for a setup that waits, or that just became ready. */
export interface IComputerUseSetupView {
	readonly setupId: string;
	readonly state: 'needsPermissions' | 'working' | 'ready';
	readonly rows: readonly IComputerUseSetupRowView[];
	/** Whether the current row's Allow in Settings sends `allow` now. */
	readonly canAllow: boolean;
	/** Whether checking again sends `recheck` now. */
	readonly canRecheck: boolean;
	/** Why the last check the user asked for changed nothing. */
	readonly error?: string;
}

/** The localized name of a macOS permission. */
export function getComputerUsePermissionLabel(permission: ComputerUsePermission): string {
	switch (permission) {
		case 'accessibility': return localize('computerUseSetup.accessibility', "Accessibility");
		case 'screenRecording': return localize('computerUseSetup.screenRecording', "Screen Recording");
	}
}

function getPermissionDescription(permission: ComputerUsePermission): string {
	switch (permission) {
		case 'accessibility': return localize('computerUseSetup.accessibility.description', "Click and type in apps");
		case 'screenRecording': return localize('computerUseSetup.screenRecording.description', "See app windows");
	}
}

function getPermissionIcon(permission: ComputerUsePermission): ThemeIcon {
	switch (permission) {
		case 'accessibility': return Codicon.cursor;
		case 'screenRecording': return Codicon.eye;
	}
}

function getStateLabel(state: ComputerUsePermissionState): string {
	switch (state) {
		case 'granted': return localize('computerUseSetup.state.granted', "Granted");
		case 'notGranted': return localize('computerUseSetup.state.notGranted', "Not granted");
		case 'unknown': return localize('computerUseSetup.state.unknown', "Not checked yet");
	}
}

/** Derives what the modal shows for setup `setupId` from the host's status; `undefined` once the modal must close. */
export function getComputerUseSetupView(status: IComputerUseStatusV1 | undefined, setupId: string): IComputerUseSetupView | undefined {
	const setup = status?.setups.find(candidate => candidate.id === setupId);
	if (!status || !setup || setup.state === 'ended') {
		return undefined;
	}
	const states = new Map(status.permissions.map(entry => [entry.permission, entry.state]));
	const stateOf = (permission: ComputerUsePermission) => states.get(permission) ?? 'unknown';
	const current = setup.state === 'ready' ? undefined : computerUsePermissions.find(permission => stateOf(permission) !== 'granted');
	const offers = ({ action, permission }: IComputerUseSetupActionV1) => setup.state === 'needsPermissions' && setup.actions.some(candidate => candidate.action === action && candidate.permission === permission);
	return {
		setupId,
		state: setup.state,
		rows: computerUsePermissions.map(permission => ({ permission, state: stateOf(permission), current: permission === current })),
		canAllow: !!current && offers({ action: 'allow', permission: current }),
		canRecheck: offers({ action: 'recheck' }),
		...(setup.error ? { error: setup.error.message } : {}),
	};
}

function getCurrentPermission(view: IComputerUseSetupView | undefined): ComputerUsePermission | undefined {
	return view?.rows.find(row => row.current)?.permission;
}

// #endregion

// #region Panel

/** How long the modal shows every permission granted before it closes on its own. */
const READY_CLOSE_DELAY_MS = 1000;

/** What the setup modal's body needs from the modal around it. */
export interface IComputerUseSetupPanelOptions {
	/** Fires `true` when the window gains focus and `false` when it loses it. */
	readonly onDidChangeWindowFocus: Event<boolean>;
	/** Closes the modal; the panel calls it once its setup no longer waits. */
	readonly close: () => void;
}

interface IRowElements {
	readonly row: HTMLElement;
	readonly status: HTMLElement;
	/** Check Again and Allow in Settings, in the row only while it is current. */
	readonly controls: HTMLElement;
	readonly recheck: Action;
	readonly allow: Button;
}

/**
 * The body of the setup modal. It renders the host's status for one setup, one permission at a time, and sends the
 * user's explicit actions; it never decides whether a permission is granted. After the user goes to System Settings to
 * turn a permission on, it checks again once when the window regains focus, unless macOS confirmed the permission
 * meanwhile. It closes the modal once the setup no longer waits.
 */
export class ComputerUseSetupPanel extends Disposable {

	readonly element: HTMLElement;
	/** Copilot Computer Use's icon, which the modal shows above its title. */
	readonly appIcon: HTMLElement;

	private readonly _appIconImage: HTMLImageElement;
	private readonly _rows = new Map<ComputerUsePermission, IRowElements>();
	/** The app, for dragging into a System Settings list; in the current row while this client can drag it. */
	private readonly _helperApp: HTMLElement;
	private readonly _helperAppIcon: HTMLImageElement;
	private readonly _closeWhenReady = this._register(new RunOnceScheduler(() => this._options.close(), READY_CLOSE_DELAY_MS));

	private _setupId: string;
	private _view: IComputerUseSetupView | undefined;
	/** Whether the host is checking the setup's permissions again. */
	private _checking = false;
	/** The app the modal offers for dragging into System Settings, if any. */
	private _helperAppPath: string | undefined;
	/** Set when the user went to macOS to grant a permission: once the window loses and regains focus, check again. */
	private _returnWatch: { readonly setupId: string; readonly permission: ComputerUsePermission; blurred: boolean } | undefined;
	private _recheckOnReturn: { readonly setupId: string; readonly permission: ComputerUsePermission } | undefined;

	constructor(
		private readonly _model: IComputerUseSetupModel,
		setupId: string,
		private readonly _options: IComputerUseSetupPanelOptions,
	) {
		super();
		this._setupId = setupId;

		this.appIcon = $(`.computer-use-setup-app-icon${ThemeIcon.asCSSSelector(Codicon.copilotLarge)}`, { 'aria-hidden': 'true' });
		this._appIconImage = append(this.appIcon, $<HTMLImageElement>('img', { alt: '' }));

		this.element = $('.computer-use-setup');
		append(this.element, $('p.computer-use-setup-description', undefined, localize('computerUseSetup.description', "Copilot Computer Use needs these permissions to use apps on your Mac.")));

		const list = append(this.element, $('.computer-use-setup-permissions', { role: 'list', 'aria-label': localize('computerUseSetup.permissions', "Required permissions") }));
		for (const permission of computerUsePermissions) {
			this._rows.set(permission, this._createRow(list, permission));
		}

		// macOS lists the app under a permission once the app asked for it, but the user may have removed it since.
		this._helperApp = $('.computer-use-setup-helper-app-chip', { draggable: 'true', 'aria-hidden': 'true' });
		append(this._helperApp, $(`span.computer-use-setup-helper-app-grip${ThemeIcon.asCSSSelector(Codicon.gripper)}`));
		this._helperAppIcon = append(this._helperApp, $<HTMLImageElement>('img.computer-use-setup-helper-app-icon', { alt: '' }));
		append(this._helperApp, $('span.computer-use-setup-helper-app-name', undefined, localize('computerUseSetup.helperApp.name', "Copilot Computer Use")));
		this._register(addDisposableListener(this._helperApp, EventType.DRAG_START, e => this._startHelperAppDrag(e)));
		this._register(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), this._helperApp, localize('computerUseSetup.helperApp.hover', "Drag into the list in System Settings")));

		this._register(this._options.onDidChangeWindowFocus(focused => this._onWindowFocus(focused)));
		this._register(autorun(reader => this._render(this._model.status.read(reader))));
	}

	/** The view currently shown; `undefined` once the panel closed the modal. */
	get view(): IComputerUseSetupView | undefined {
		return this._view;
	}

	/** Follows setup `setupId` from now on. */
	setTarget(setupId: string): void {
		this._setupId = setupId;
		this._render(this._model.status.get());
	}

	/** Moves focus to the current row's Allow in Settings, if a row is current. */
	focus(): void {
		this._getCurrentAllow()?.focus();
	}

	private _createRow(list: HTMLElement, permission: ComputerUsePermission): IRowElements {
		const label = getComputerUsePermissionLabel(permission);
		const row = append(list, $('.computer-use-setup-permission', { role: 'listitem' }));
		append(row, $(`span.computer-use-setup-permission-icon${ThemeIcon.asCSSSelector(getPermissionIcon(permission))}`, { 'aria-hidden': 'true' }));
		const text = append(row, $('.computer-use-setup-permission-text', { 'aria-hidden': 'true' }));
		append(text, $('span.computer-use-setup-permission-name', undefined, label));
		append(text, $('span.computer-use-setup-permission-description', undefined, getPermissionDescription(permission)));
		const status = append(row, $('span.computer-use-setup-permission-status', { 'aria-hidden': 'true' }));

		const controls = $('.computer-use-setup-permission-controls');
		const recheck = this._register(new Action('computerUseSetup.recheck', localize('computerUseSetup.recheck', "Check Again"), ThemeIcon.asClassName(Codicon.refresh), true, () => this._recheck()));
		recheck.tooltip = localize('computerUseSetup.recheck.aria', "Check {0} Again", label);
		// The modal stops every key release, so the action runs as the key goes down.
		const actionBar = this._register(new ActionBar(controls, { triggerKeys: { keys: [KeyCode.Enter, KeyCode.Space], keyDown: true } }));
		actionBar.push(recheck, { icon: true, label: false });
		const allow = this._register(new Button(controls, { ...defaultButtonStyles, small: true }));
		allow.label = localize('computerUseSetup.allow', "Allow in Settings");
		allow.setAriaLabel(localize('computerUseSetup.allow.aria', "Allow {0} in System Settings", label));
		this._register(allow.onDidClick(() => this._allow(permission)));
		return { row, status, controls, recheck, allow };
	}

	private _render(status: IComputerUseStatusV1 | undefined): void {
		const view = getComputerUseSetupView(status, this._setupId);
		if (!view) {
			this._view = undefined;
			this._closeWhenReady.cancel();
			this._options.close();
			return;
		}
		const previous = this._view;
		const modal = this._getModal();
		const hadFocus = isAncestor(this.element.ownerDocument.activeElement, modal);
		this._view = view;

		const icon = status?.helperApp?.icon;
		this.appIcon.classList.toggle('has-image', !!icon);
		this._appIconImage.src = icon ?? '';
		this._helperAppIcon.src = icon ?? '';
		this._helperAppIcon.classList.toggle('missing', !icon);

		const working = view.state === 'working';
		for (const row of view.rows) {
			const elements = this._rows.get(row.permission)!;
			elements.row.setAttribute('aria-label', localize('computerUseSetup.row', "{0}, {1}. {2}", getComputerUsePermissionLabel(row.permission), getStateLabel(row.state), getPermissionDescription(row.permission)));
			elements.status.className = 'computer-use-setup-permission-status';
			if (row.state === 'granted') {
				elements.status.classList.add('granted', ...ThemeIcon.asClassNameArray(Codicon.passFilled));
			}
			if (!row.current) {
				// Removed, not hidden: the modal moves focus itself across every link in its body, hidden ones too.
				elements.controls.remove();
				continue;
			}
			// While a step runs the host offers nothing, so the controls stay put, disabled, and keep focus.
			elements.recheck.class = ThemeIcon.asClassName(working ? ThemeIcon.modify(Codicon.loading, 'spin') : Codicon.refresh);
			elements.recheck.enabled = view.canRecheck;
			elements.allow.enabled = view.canAllow;
			if (elements.controls.parentElement !== elements.row) {
				elements.status.after(elements.controls);
			}
		}

		const current = getCurrentPermission(view);
		const currentRow = current && this._rows.get(current)?.row;
		this._helperAppPath = currentRow && this._model.helperApp ? status?.helperApp?.path : undefined;
		if (currentRow && this._helperAppPath) {
			if (this._helperApp.parentElement !== currentRow) {
				currentRow.appendChild(this._helperApp);
			}
		} else {
			this._helperApp.remove();
		}

		if (hadFocus && (current !== getCurrentPermission(previous) || !isAncestor(this.element.ownerDocument.activeElement, modal))) {
			(this._getCurrentAllow() ?? modal).focus();
		}

		const checking = working && status?.operation?.setupId === view.setupId && status.operation.action === 'recheck';
		this._announce(previous, view, checking && !this._checking);
		this._checking = checking;

		if (view.state !== 'ready') {
			this._closeWhenReady.cancel();
		} else if (!this._closeWhenReady.isScheduled()) {
			this._closeWhenReady.schedule();
		}
		this._recheckIfReturned(view);
	}

	/** The modal the panel is the body of; focus anywhere in it counts as focus in the setup. */
	private _getModal(): HTMLElement {
		return this.element.closest<HTMLElement>('[role="dialog"]') ?? this.element;
	}

	private _getCurrentAllow(): Button | undefined {
		const current = getCurrentPermission(this._view);
		return current && this._rows.get(current)?.allow;
	}

	private _announce(previous: IComputerUseSetupView | undefined, view: IComputerUseSetupView, startedChecking: boolean): void {
		// Opening the modal or switching setups moves focus, which tells the user where they are.
		if (previous?.setupId !== view.setupId) {
			return;
		}
		if (view.state === 'ready') {
			if (previous.state !== 'ready') {
				status(localize('computerUseSetup.ready', "Computer Use is ready."));
			}
			return;
		}
		const messages: string[] = [];
		if (startedChecking) {
			messages.push(localize('computerUseSetup.checking', "Checking permissions…"));
		}
		if (view.rows.some((row, index) => row.state !== previous.rows[index]?.state)) {
			messages.push(view.rows.map(row => localize('computerUseSetup.rowAnnouncement', "{0}: {1}.", getComputerUsePermissionLabel(row.permission), getStateLabel(row.state))).join(' '));
		}
		if (messages.length) {
			status(messages.join(' '));
		}
		if (view.error && (view.error !== previous.error || previous.state !== 'needsPermissions')) {
			alert(view.error);
		}
	}

	private _allow(permission: ComputerUsePermission): void {
		const setupId = this._view?.setupId;
		if (!setupId || !this._model.request(setupId, { action: 'allow', permission })) {
			return;
		}
		// The user goes to macOS to grant it; check again when they come back.
		this._returnWatch = { setupId, permission, blurred: false };
		this._recheckOnReturn = undefined;
	}

	private _recheck(): void {
		const setupId = this._view?.setupId;
		this._returnWatch = undefined;
		this._recheckOnReturn = undefined;
		if (setupId) {
			this._model.request(setupId, { action: 'recheck' });
		}
	}

	private _startHelperAppDrag(e: DragEvent): void {
		// Only a native drag hands System Settings the app itself.
		e.preventDefault();
		if (this._helperAppPath) {
			this._model.helperApp?.startDrag(this._helperAppPath, getWindow(this._helperApp));
		}
	}

	private _onWindowFocus(focused: boolean): void {
		const watch = this._returnWatch;
		if (!watch) {
			return;
		}
		if (!focused) {
			watch.blurred = true;
			return;
		}
		if (watch.blurred) {
			this._returnWatch = undefined;
			this._recheckOnReturn = { setupId: watch.setupId, permission: watch.permission };
			this._recheckIfReturned(this._view);
		}
	}

	/** Checks again once the user came back, as soon as the plugin waits for the setup's next step. */
	private _recheckIfReturned(view: IComputerUseSetupView | undefined): void {
		const pending = this._recheckOnReturn;
		if (!pending || view?.setupId !== pending.setupId || view.state === 'working') {
			return;
		}
		this._recheckOnReturn = undefined;
		// The host checks Accessibility on its own when macOS changes it, so it may be confirmed already.
		const confirmed = view.rows.some(row => row.permission === pending.permission && row.state === 'granted');
		if (view.state === 'needsPermissions' && view.canRecheck && !confirmed) {
			this._model.request(pending.setupId, { action: 'recheck' });
		}
	}
}

// #endregion

/** The setup modal: one per window, opened from the chat's setup card while its setup waits. */
export class ComputerUseSetupDialog extends Disposable {

	private readonly _dialog: Dialog;
	private readonly _panel: ComputerUseSetupPanel;

	constructor(
		model: IComputerUseSetupModel,
		setupId: string,
		@ILayoutService layoutService: ILayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHostService hostService: IHostService,
	) {
		super();
		// The panel may close the dialog as soon as it renders, so the dialog comes first and takes the panel's elements after.
		const slots: { icon?: HTMLElement; body?: HTMLElement } = {};
		this._dialog = this._register(new Dialog(
			layoutService.activeContainer,
			localize('computerUseSetup.title', "Set Up Computer Use"),
			[],
			createWorkbenchDialogOptions({
				type: 'none',
				alignment: DialogContentsAlignment.Vertical,
				renderIcon: container => { slots.icon = container; },
				renderBody: container => { slots.body = container; },
				extraClasses: ['computer-use-setup-dialog'],
				disableDefaultAction: true,
				// The body has no links, so the dialog mustn't style the refresh action's label like one.
				dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
			}, keybindingService, layoutService, hostService),
		));
		this._panel = this._register(new ComputerUseSetupPanel(model, setupId, {
			onDidChangeWindowFocus: hostService.onDidChangeFocus,
			close: () => this._dialog.dispose(),
		}));
		slots.icon?.appendChild(this._panel.appIcon);
		slots.body?.appendChild(this._panel.element);
	}

	/** Shows the modal while its setup waits; resolves once it closed. */
	async show(): Promise<void> {
		if (!this._panel.view) {
			return;
		}
		const closed = this._dialog.show();
		this._panel.focus();
		await closed;
	}

	/** Brings the open modal to setup `setupId`. */
	reveal(setupId: string): void {
		this._panel.setTarget(setupId);
		this._panel.focus();
	}
}
