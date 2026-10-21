/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/computerUseSetup.css';
import { $, append } from '../../../../../../base/browser/dom.js';
import { alert, status } from '../../../../../../base/browser/ui/aria/aria.js';
import { Button, type IButton } from '../../../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../../../base/browser/ui/dialog/dialog.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, type IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { computerUsePermissions, type ComputerUsePermission, type ComputerUsePermissionState, type IComputerUseSetupActionV1, type IComputerUseSetupV1, type IComputerUseStatusV1 } from '../../../../../../platform/agentHost/common/computerUse.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../../browser/parts/dialogs/dialog.js';
import { IHostService } from '../../../../../services/host/browser/host.js';

/** The status the setup modal shows and the actions it sends. */
export interface IComputerUseSetupModel {
	/** The local Agent Host's setup status; `undefined` while it publishes none. */
	readonly status: IObservable<IComputerUseStatusV1 | undefined>;
	/** Sends `action` for the current round of setup `setupId`; `false` when the setup doesn't offer it now. */
	request(setupId: string, action: IComputerUseSetupActionV1): boolean;
}

// #region View model

/**
 * - `unavailable`: the local Agent Host publishes no setup status.
 * - `idle`: nothing waits for the permissions; the modal only shows their last verified state.
 * - otherwise the state of the setup the modal follows.
 */
export type ComputerUseSetupPhase = 'unavailable' | 'idle' | IComputerUseSetupV1['state'];

export interface IComputerUseSetupRowView {
	readonly permission: ComputerUsePermission;
	readonly state: ComputerUsePermissionState;
	/** What the user can do for this permission now. */
	readonly action?: IComputerUseSetupActionV1;
	/** Whether the action in flight is for this permission. */
	readonly busy: boolean;
}

export interface IComputerUseSetupView {
	readonly phase: ComputerUseSetupPhase;
	readonly setupId?: string;
	readonly rows: readonly IComputerUseSetupRowView[];
	readonly message: string;
	readonly messageKind: 'info' | 'progress' | 'error' | 'success';
	readonly canRecheck: boolean;
	/**
	 * The helper already verified every permission, e.g. for another chat, while this setup still waits; checking again
	 * lets the waiting task continue, so the modal offers it as Continue.
	 */
	readonly canContinue: boolean;
}

/** The permission the user last acted on in a setup, whose next step the modal explains until it is granted. */
export interface IComputerUseSetupGuidance {
	readonly setupId: string;
	readonly permission: ComputerUsePermission;
}

export function getComputerUsePermissionLabel(permission: ComputerUsePermission): string {
	switch (permission) {
		case 'accessibility': return localize('computerUseSetup.accessibility', "Accessibility");
		case 'screenRecording': return localize('computerUseSetup.screenRecording', "Screen Recording");
	}
}

function getPermissionDescription(permission: ComputerUsePermission): string {
	switch (permission) {
		case 'accessibility': return localize('computerUseSetup.accessibility.description', "Lets Copilot Computer Use interact with apps");
		case 'screenRecording': return localize('computerUseSetup.screenRecording.description', "Lets Copilot Computer Use capture app windows");
	}
}

function getStateLabel(state: ComputerUsePermissionState): string {
	switch (state) {
		case 'granted': return localize('computerUseSetup.state.granted', "Granted");
		case 'notGranted': return localize('computerUseSetup.state.notGranted', "Not granted");
		case 'unknown': return localize('computerUseSetup.state.unknown', "Not checked yet");
	}
}

function getActionLabel({ action }: IComputerUseSetupActionV1): string {
	switch (action) {
		case 'request': return localize('computerUseSetup.action.request', "Request Access");
		case 'openSettings': return localize('computerUseSetup.action.openSettings', "Open System Settings");
		case 'recheck': return localize('computerUseSetup.action.recheck', "Check Again");
	}
}

function getActionAriaLabel({ action, permission }: IComputerUseSetupActionV1): string {
	const label = permission && getComputerUsePermissionLabel(permission);
	switch (action) {
		case 'request': return localize('computerUseSetup.action.request.aria', "Request {0} Access", label);
		case 'openSettings': return localize('computerUseSetup.action.openSettings.aria', "Open {0} in System Settings", label);
		case 'recheck': return localize('computerUseSetup.action.recheck.aria', "Check Permissions Again");
	}
}

function getWorkingMessage(status: IComputerUseStatusV1, setupId: string): string {
	const operation = status.operation?.setupId === setupId ? status.operation : undefined;
	const label = operation?.permission && getComputerUsePermissionLabel(operation.permission);
	switch (operation?.action) {
		case 'request': return localize('computerUseSetup.working.request', "Waiting for macOS to ask about {0}…", label);
		case 'openSettings': return localize('computerUseSetup.working.openSettings', "Opening {0} in System Settings…", label);
		default: return localize('computerUseSetup.working.recheck', "Checking permissions…");
	}
}

/** Picks the setup to show: the requested one, else the newest one that waits. */
export function findComputerUseSetup(status: IComputerUseStatusV1 | undefined, setupId: string | undefined): IComputerUseSetupV1 | undefined {
	if (setupId !== undefined) {
		return status?.setups.find(setup => setup.id === setupId);
	}
	return status?.setups.findLast(setup => setup.state === 'needsPermissions' || setup.state === 'working');
}

/** Derives what the modal shows for setup `setupId` from the host's status; every value is host-verified. */
export function getComputerUseSetupView(status: IComputerUseStatusV1 | undefined, setupId: string | undefined, guidance?: IComputerUseSetupGuidance): IComputerUseSetupView {
	if (!status) {
		return {
			phase: 'unavailable',
			rows: [],
			message: localize('computerUseSetup.unavailable', "Computer Use setup is available when Computer Use is turned on for local Copilot sessions on this Mac."),
			messageKind: 'info',
			canRecheck: false,
			canContinue: false,
		};
	}
	const setup = setupId !== undefined ? status.setups.find(candidate => candidate.id === setupId) : undefined;
	const rows = computerUsePermissions.map((permission): IComputerUseSetupRowView => {
		const state = status.permissions.find(candidate => candidate.permission === permission)?.state ?? 'unknown';
		// Another chat may already have verified a grant this setup still offers; checking again picks it up.
		const offered = state === 'granted' ? undefined : setup?.actions.filter(candidate => candidate.permission === permission);
		const action = offered?.find(candidate => candidate.action === 'openSettings') ?? offered?.find(candidate => candidate.action === 'request');
		const operation = status.operation;
		return {
			permission,
			state,
			...(action ? { action } : {}),
			busy: setup?.state === 'working' && operation?.setupId === setup.id && operation.permission === permission,
		};
	});
	if (!setup) {
		return { phase: 'idle', rows, message: localize('computerUseSetup.idle', "Copilot checks these permissions the next time it needs Computer Use."), messageKind: 'info', canRecheck: false, canContinue: false };
	}
	const canRecheck = setup.actions.some(candidate => candidate.action === 'recheck');
	switch (setup.state) {
		case 'needsPermissions': {
			if (canRecheck && rows.every(row => row.state === 'granted')) {
				return { phase: setup.state, setupId: setup.id, rows, message: localize('computerUseSetup.canContinue', "macOS confirmed both permissions. Continue to resume your task."), messageKind: 'success', canRecheck, canContinue: true };
			}
			if (setup.error) {
				return { phase: setup.state, setupId: setup.id, rows, message: setup.error.message, messageKind: 'error', canRecheck, canContinue: false };
			}
			const guided = guidance?.setupId === setup.id && rows.some(row => row.permission === guidance.permission && row.state !== 'granted') ? guidance.permission : undefined;
			const message = guided
				? localize('computerUseSetup.guidance', "Turn on Copilot Computer Use under {0} in System Settings, then come back. Copilot checks again when you return.", getComputerUsePermissionLabel(guided))
				: localize('computerUseSetup.needsPermissions', "Turn on Copilot Computer Use for each permission. Copilot continues once macOS confirms both.");
			return { phase: setup.state, setupId: setup.id, rows, message, messageKind: 'info', canRecheck, canContinue: false };
		}
		case 'working':
			return { phase: setup.state, setupId: setup.id, rows, message: getWorkingMessage(status, setup.id), messageKind: 'progress', canRecheck: false, canContinue: false };
		case 'ready':
			return { phase: setup.state, setupId: setup.id, rows, message: localize('computerUseSetup.ready', "Computer Use is ready. Copilot is continuing your task."), messageKind: 'success', canRecheck: false, canContinue: false };
		case 'ended':
			return {
				phase: setup.state,
				setupId: setup.id,
				rows,
				message: setup.error?.message ?? localize('computerUseSetup.ended', "Setup was canceled. Ask Copilot to try again when you're ready."),
				messageKind: 'error',
				canRecheck: false,
				canContinue: false,
			};
	}
}

// #endregion

// #region Panel

export interface IComputerUseSetupPanelOptions {
	readonly productName: string;
	/** Fires `true` when the window gains focus and `false` when it loses it. */
	readonly onDidChangeWindowFocus: Event<boolean>;
}

interface IRowElements {
	readonly icon: HTMLElement;
	readonly state: HTMLElement;
	readonly actionContainer: HTMLElement;
	readonly button: Button;
}

/**
 * The body of the setup modal. It renders the host's status for one setup and sends the user's explicit actions; it
 * never decides whether a permission is granted. After the user goes to macOS to grant a permission, it checks again
 * once when the window regains focus.
 */
export class ComputerUseSetupPanel extends Disposable {

	readonly element: HTMLElement;

	private readonly _rows = new Map<ComputerUsePermission, IRowElements>();
	private readonly _message: HTMLElement;
	private readonly _recheckContainer: HTMLElement;
	private readonly _recheck: Button;
	private _dismiss: IButton | undefined;

	/** The setup requested by the caller; without one, the newest waiting setup is picked once and kept. */
	private _requested: string | undefined;
	private _pinned: string | undefined;
	private _view: IComputerUseSetupView | undefined;
	private _guidance: IComputerUseSetupGuidance | undefined;
	/** Set when the user went to macOS to grant a permission: once the window loses and regains focus, check again. */
	private _returnWatch: { readonly setupId: string; blurred: boolean } | undefined;
	private _recheckOnReturn: string | undefined;

	constructor(
		private readonly _model: IComputerUseSetupModel,
		setupId: string | undefined,
		options: IComputerUseSetupPanelOptions,
	) {
		super();
		this._requested = setupId;
		this.element = $('.computer-use-setup');
		append(this.element, $('p.computer-use-setup-description', undefined,
			localize('computerUseSetup.description', "Copilot Computer Use needs these macOS permissions to work with apps for you. macOS grants them to Copilot Computer Use, not to {0}.", options.productName)));

		const list = append(this.element, $('.computer-use-setup-permissions', { role: 'list', 'aria-label': localize('computerUseSetup.permissions', "Required permissions") }));
		for (const permission of computerUsePermissions) {
			const row = append(list, $('.computer-use-setup-permission', { role: 'listitem' }));
			const icon = append(row, $('span.computer-use-setup-permission-icon', { 'aria-hidden': 'true' }));
			const text = append(row, $('.computer-use-setup-permission-text'));
			const heading = append(text, $('.computer-use-setup-permission-heading'));
			append(heading, $('span.computer-use-setup-permission-name', undefined, getComputerUsePermissionLabel(permission)));
			const state = append(heading, $('span.computer-use-setup-permission-state'));
			append(text, $('span.computer-use-setup-permission-description', undefined, getPermissionDescription(permission)));
			const actionContainer = append(row, $('.computer-use-setup-permission-action'));
			const button = this._register(new Button(actionContainer, { ...defaultButtonStyles, secondary: true }));
			this._register(button.onDidClick(() => this._runRowAction(permission)));
			this._rows.set(permission, { icon, state, actionContainer, button });
		}

		this._message = append(this.element, $('.computer-use-setup-message'));
		this._recheckContainer = append(this.element, $('.computer-use-setup-actions'));
		this._recheck = this._register(new Button(this._recheckContainer, { ...defaultButtonStyles, secondary: true }));
		this._register(this._recheck.onDidClick(() => this._runRecheck()));

		this._register(options.onDidChangeWindowFocus(focused => this._onWindowFocus(focused)));
		this._register(autorun(reader => this._render(this._model.status.read(reader))));
	}

	/** The view currently shown. */
	get view(): IComputerUseSetupView | undefined {
		return this._view;
	}

	/** Follows setup `setupId`; without one, keeps the current setup unless it finished, then follows the newest waiting one. */
	setTarget(setupId: string | undefined): void {
		if (setupId === undefined && this._view?.phase !== 'ready' && this._view?.phase !== 'ended') {
			return;
		}
		this._requested = setupId;
		this._pinned = undefined;
		this._render(this._model.status.get());
	}

	/** Adopts the modal's own button, which closes it, and relabels it with the setup's progress. */
	setDismissButton(button: IButton): void {
		this._dismiss = button;
		this._renderDismiss();
	}

	/** Moves focus to the most useful control: the next permission action, else Check Again, else the modal's button. */
	focus(): void {
		this._primaryElement()?.focus();
	}

	private _primaryElement(): { focus(): void } | undefined {
		const view = this._view;
		const row = view?.phase === 'needsPermissions' ? view.rows.find(candidate => candidate.action) : undefined;
		if (row) {
			return this._rows.get(row.permission)?.button;
		}
		if (view?.phase === 'needsPermissions' && view.canRecheck) {
			return this._recheck;
		}
		return this._dismiss;
	}

	private _render(status: IComputerUseStatusV1 | undefined): void {
		if (this._requested === undefined && this._pinned === undefined) {
			this._pinned = findComputerUseSetup(status, undefined)?.id;
		}
		const setupId = this._requested ?? this._pinned;
		const view = getComputerUseSetupView(status, setupId, this._guidance);
		const previous = this._view;
		const hadFocus = this.element.contains(this.element.ownerDocument.activeElement);
		this._view = view;

		const enabled = view.phase === 'needsPermissions';
		const firstActionable = view.rows.find(row => row.action)?.permission;
		for (const row of view.rows) {
			const elements = this._rows.get(row.permission)!;
			elements.icon.className = `computer-use-setup-permission-icon ${row.state}`;
			elements.icon.classList.add(...ThemeIcon.asClassNameArray(row.busy
				? ThemeIcon.modify(Codicon.loading, 'spin')
				: row.state === 'granted' ? Codicon.passFilled : row.state === 'notGranted' ? Codicon.circleLargeOutline : Codicon.question));
			elements.state.textContent = getStateLabel(row.state);
			if (row.action) {
				elements.button.label = getActionLabel(row.action);
				elements.button.setAriaLabel(getActionAriaLabel(row.action));
				elements.button.secondary = row.permission !== firstActionable;
				if (!elements.button.element.isConnected) {
					elements.actionContainer.appendChild(elements.button.element);
				}
			} else if (view.phase !== 'working') {
				elements.button.element.remove();
			}
			// While a step runs the host offers nothing, so the controls stay put, disabled, and keep focus.
			elements.button.enabled = enabled;
		}

		this._message.textContent = view.message;
		this._message.className = `computer-use-setup-message ${view.messageKind}`;

		const showRecheck = view.canRecheck || (view.phase === 'working' && this._recheck.element.isConnected);
		this._recheck.enabled = enabled && view.canRecheck;
		if (view.phase !== 'working') {
			this._recheck.label = view.canContinue ? localize('computerUseSetup.continueTask', "Continue") : getActionLabel({ action: 'recheck' });
			this._recheck.setAriaLabel(view.canContinue ? localize('computerUseSetup.continueTask.aria', "Continue Your Task") : getActionAriaLabel({ action: 'recheck' }));
			this._recheck.secondary = !view.canContinue;
		}
		if (showRecheck && !this._recheck.element.isConnected) {
			this._recheckContainer.appendChild(this._recheck.element);
		} else if (!showRecheck) {
			this._recheck.element.remove();
		}
		this._renderDismiss();

		if (hadFocus && !this.element.contains(this.element.ownerDocument.activeElement)) {
			this.focus();
		}
		this._announce(previous, view);
		this._recheckIfReturned(view);
	}

	private _renderDismiss(): void {
		const dismiss = this._dismiss;
		if (!dismiss) {
			return;
		}
		const phase = this._view?.phase;
		const waiting = phase === 'needsPermissions' || phase === 'working';
		dismiss.label = waiting
			? localize('computerUseSetup.notNow', "Not Now")
			: phase === 'ready' ? localize('computerUseSetup.continue', "Continue") : localize('computerUseSetup.close', "Close");
		if (dismiss instanceof Button) {
			dismiss.secondary = waiting;
		}
	}

	private _announce(previous: IComputerUseSetupView | undefined, view: IComputerUseSetupView): void {
		if (!previous || (previous.phase === view.phase && previous.setupId === view.setupId && previous.message === view.message && previous.rows.every((row, index) => row.state === view.rows[index]?.state))) {
			return;
		}
		if (view.phase === 'needsPermissions') {
			const summary = view.rows.map(row => localize('computerUseSetup.rowAnnouncement', "{0}: {1}.", getComputerUsePermissionLabel(row.permission), getStateLabel(row.state))).join(' ');
			(view.messageKind === 'error' ? alert : status)(`${summary} ${view.message}`);
		} else if (view.phase === 'ended') {
			alert(view.message);
		} else {
			status(view.message);
		}
	}

	private _runRowAction(permission: ComputerUsePermission): void {
		const view = this._view;
		const action = view?.rows.find(row => row.permission === permission)?.action;
		if (!view?.setupId || !action || !this._model.request(view.setupId, action)) {
			return;
		}
		// The user goes to macOS to grant it; explain where, and check again when they come back.
		this._guidance = { setupId: view.setupId, permission };
		this._returnWatch = { setupId: view.setupId, blurred: false };
		this._recheckOnReturn = undefined;
	}

	private _runRecheck(): void {
		const setupId = this._view?.setupId;
		this._returnWatch = undefined;
		this._recheckOnReturn = undefined;
		if (setupId) {
			this._model.request(setupId, { action: 'recheck' });
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
			this._recheckOnReturn = watch.setupId;
			this._recheckIfReturned(this._view);
		}
	}

	/** Checks again once the user came back, as soon as the plugin waits for the setup's next step. */
	private _recheckIfReturned(view: IComputerUseSetupView | undefined): void {
		const setupId = this._recheckOnReturn;
		if (!setupId || view?.setupId !== setupId || view.phase === 'working') {
			return;
		}
		this._recheckOnReturn = undefined;
		if (view.phase === 'needsPermissions' && view.canRecheck) {
			this._model.request(setupId, { action: 'recheck' });
		}
	}
}

// #endregion

/** The setup modal: one per window, opened from the chat's setup card or the Set Up Computer Use command. */
export class ComputerUseSetupDialog extends Disposable {

	private readonly _panel: ComputerUseSetupPanel;
	private readonly _dialog: Dialog;

	constructor(
		model: IComputerUseSetupModel,
		setupId: string | undefined,
		@ILayoutService layoutService: ILayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHostService hostService: IHostService,
		@IProductService productService: IProductService,
	) {
		super();
		this._panel = this._register(new ComputerUseSetupPanel(model, setupId, {
			productName: productService.nameLong,
			onDidChangeWindowFocus: hostService.onDidChangeFocus,
		}));
		this._dialog = this._register(new Dialog(
			layoutService.activeContainer,
			localize('computerUseSetup.title', "Set Up Computer Use"),
			[localize('computerUseSetup.notNow', "Not Now")],
			createWorkbenchDialogOptions({
				type: 'none',
				icon: Codicon.shield,
				extraClasses: ['computer-use-setup-dialog'],
				cancelId: 0,
				renderBody: body => body.appendChild(this._panel.element),
				buttonOptions: [{ styleButton: button => this._panel.setDismissButton(button) }],
			}, keybindingService, layoutService, hostService),
		));
	}

	/** Shows the modal; resolves when the user closes it. */
	async show(): Promise<void> {
		const closed = this._dialog.show();
		this._panel.focus();
		await closed;
	}

	/** Brings the open modal to setup `setupId`. */
	reveal(setupId: string | undefined): void {
		this._panel.setTarget(setupId);
		this._panel.focus();
	}
}
