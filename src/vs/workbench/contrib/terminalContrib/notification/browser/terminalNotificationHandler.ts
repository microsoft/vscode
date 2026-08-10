/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction } from '../../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { Disposable, DisposableStore, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { NotificationPriority, Severity, type INotification, type INotificationHandle } from '../../../../../platform/notification/common/notification.js';

const enum Osc99PayloadType {
	Title = 'title',
	Body = 'body',
	Buttons = 'buttons',
	Close = 'close',
	Query = '?',
	Alive = 'alive'
}

type Osc99Occasion = 'always' | 'unfocused' | 'invisible';
type Osc99CloseReason = 'button' | 'secondary' | 'auto' | 'protocol';

interface IOsc99NotificationState {
	id: string | undefined;
	title: string;
	body: string;
	buttonsPayload: string;
	focusOnActivate: boolean;
	reportOnActivate: boolean;
	reportOnClose: boolean;
	urgency: number | undefined;
	autoCloseMs: number | undefined;
	occasion: Osc99Occasion | undefined;
}

interface IOsc99ActiveNotification {
	id: string | undefined;
	handle: INotificationHandle;
	actionStore: DisposableStore;
	autoCloseDisposable: IDisposable | undefined;
	reportOnActivate: boolean;
	reportOnClose: boolean;
	focusOnActivate: boolean;
	closeReason: Osc99CloseReason | undefined;
}

export interface IOsc99NotificationHost {
	isEnabled(): boolean;
	isWindowFocused(): boolean;
	isTerminalVisible(): boolean;
	focusTerminal(): void;
	notify(notification: INotification): INotificationHandle;
	updateEnableNotifications(value: boolean): Promise<void>;
	logWarn(message: string): void;
	writeToProcess(data: string): void;
}

export class TerminalNotificationHandler extends Disposable {
	private readonly _osc99PendingNotifications = new Map<string, IOsc99NotificationState>();
	private _osc99PendingAnonymous: IOsc99NotificationState | undefined;
	private readonly _osc99ActiveNotifications = new Map<string, IOsc99ActiveNotification>();

	constructor(
		private readonly _host: IOsc99NotificationHost
	) {
		super();
	}

	handleSequence(data: string): boolean {
		const { metadata, payload } = this._splitOsc99Data(data);
		const metadataEntries = this._parseOsc99Metadata(metadata);
		const payloadTypes = metadataEntries.get('p');
		const rawPayloadType = payloadTypes && payloadTypes.length > 0 ? payloadTypes[payloadTypes.length - 1] : undefined;
		const payloadType = rawPayloadType && rawPayloadType.length > 0 ? rawPayloadType : Osc99PayloadType.Title;
		const id = this._sanitizeOsc99Id(metadataEntries.get('i')?.[0]);

		if (!this._host.isEnabled()) {
			return true;
		}

		switch (payloadType) {
			case Osc99PayloadType.Query:
				this._sendOsc99QueryResponse(id);
				return true;
			case Osc99PayloadType.Alive:
				this._sendOsc99AliveResponse(id);
				return true;
			case Osc99PayloadType.Close:
				this._closeOsc99Notification(id);
				return true;
		}

		const state = this._getOrCreateOsc99State(id);
		this._updateOsc99StateFromMetadata(state, metadataEntries);

		const isEncoded = metadataEntries.get('e')?.[0] === '1';
		const payloadText = this._decodeOsc99Payload(payload, isEncoded);
		const isDone = metadataEntries.get('d')?.[0] !== '0';

		switch (payloadType) {
			case Osc99PayloadType.Title:
				state.title += payloadText;
				break;
			case Osc99PayloadType.Body:
				state.body += payloadText;
				break;
			case Osc99PayloadType.Buttons:
				state.buttonsPayload += payloadText;
				break;
			default:
				return true;
		}

		if (!isDone) {
			return true;
		}
		if (!this._shouldHonorOsc99Occasion(state.occasion)) {
			this._clearOsc99PendingState(id);
			return true;
		}

		if (this._showOsc99Notification(state)) {
			this._clearOsc99PendingState(id);
		}
		return true;
	}

	private _splitOsc99Data(data: string): { metadata: string; payload: string } {
		const separatorIndex = data.indexOf(';');
		if (separatorIndex === -1) {
			return { metadata: data, payload: '' };
		}
		return {
			metadata: data.substring(0, separatorIndex),
			payload: data.substring(separatorIndex + 1)
		};
	}

	private _parseOsc99Metadata(metadata: string): Map<string, string[]> {
		const result = new Map<string, string[]>();
		if (!metadata) {
			return result;
		}
		for (const entry of metadata.split(':')) {
			if (!entry) {
				continue;
			}
			const separatorIndex = entry.indexOf('=');
			if (separatorIndex === -1) {
				continue;
			}
			const key = entry.substring(0, separatorIndex);
			const value = entry.substring(separatorIndex + 1);
			if (!key) {
				continue;
			}
			let values = result.get(key);
			if (!values) {
				values = [];
				result.set(key, values);
			}
			values.push(value);
		}
		return result;
	}

	private _decodeOsc99Payload(payload: string, isEncoded: boolean): string {
		if (!isEncoded) {
			return payload;
		}
		try {
			return decodeBase64(payload).toString();
		} catch {
			this._host.logWarn('Failed to decode OSC 99 payload');
			return '';
		}
	}

	private _sanitizeOsc99Id(rawId: string | undefined): string | undefined {
		if (!rawId) {
			return undefined;
		}
		const sanitized = rawId.replace(/[^a-zA-Z0-9_\-+.]/g, '');
		return sanitized.length > 0 ? sanitized : undefined;
	}

	private _sanitizeOsc99MessageText(text: string): string {
		return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
	}

	private _getOrCreateOsc99State(id: string | undefined): IOsc99NotificationState {
		if (!id) {
			if (!this._osc99PendingAnonymous) {
				this._osc99PendingAnonymous = this._createOsc99State(undefined);
			}
			return this._osc99PendingAnonymous;
		}
		let state = this._osc99PendingNotifications.get(id);
		if (!state) {
			state = this._createOsc99State(id);
			this._osc99PendingNotifications.set(id, state);
		}
		return state;
	}

	private _createOsc99State(id: string | undefined): IOsc99NotificationState {
		return {
			id,
			title: '',
			body: '',
			buttonsPayload: '',
			focusOnActivate: true,
			reportOnActivate: false,
			reportOnClose: false,
			urgency: undefined,
			autoCloseMs: undefined,
			occasion: undefined
		};
	}

	private _clearOsc99PendingState(id: string | undefined): void {
		if (!id) {
			this._osc99PendingAnonymous = undefined;
			return;
		}
		this._osc99PendingNotifications.delete(id);
	}

	private _updateOsc99StateFromMetadata(state: IOsc99NotificationState, metadataEntries: Map<string, string[]>): void {
		const actionValues = metadataEntries.get('a');
		const actionValue = actionValues && actionValues.length > 0 ? actionValues[actionValues.length - 1] : undefined;
		if (actionValue !== undefined) {
			const actions = this._parseOsc99Actions(actionValue);
			state.focusOnActivate = actions.focusOnActivate;
			state.reportOnActivate = actions.reportOnActivate;
		}
		const closeValues = metadataEntries.get('c');
		const closeValue = closeValues && closeValues.length > 0 ? closeValues[closeValues.length - 1] : undefined;
		if (closeValue !== undefined) {
			state.reportOnClose = closeValue === '1';
		}
		const urgencyValues = metadataEntries.get('u');
		const urgencyValue = urgencyValues && urgencyValues.length > 0 ? urgencyValues[urgencyValues.length - 1] : undefined;
		if (urgencyValue !== undefined) {
			const urgency = Number.parseInt(urgencyValue, 10);
			if (!Number.isNaN(urgency)) {
				state.urgency = urgency;
			}
		}
		const autoCloseValues = metadataEntries.get('w');
		const autoCloseValue = autoCloseValues && autoCloseValues.length > 0 ? autoCloseValues[autoCloseValues.length - 1] : undefined;
		if (autoCloseValue !== undefined) {
			const autoClose = Number.parseInt(autoCloseValue, 10);
			if (!Number.isNaN(autoClose)) {
				state.autoCloseMs = autoClose;
			}
		}
		const occasionValues = metadataEntries.get('o');
		const occasionValue = occasionValues && occasionValues.length > 0 ? occasionValues[occasionValues.length - 1] : undefined;
		if (occasionValue === 'always' || occasionValue === 'unfocused' || occasionValue === 'invisible') {
			state.occasion = occasionValue;
		}
	}

	private _parseOsc99Actions(value: string): { focusOnActivate: boolean; reportOnActivate: boolean } {
		let focusOnActivate = true;
		let reportOnActivate = false;
		for (const token of value.split(',')) {
			switch (token) {
				case 'focus':
					focusOnActivate = true;
					break;
				case '-focus':
					focusOnActivate = false;
					break;
				case 'report':
					reportOnActivate = true;
					break;
				case '-report':
					reportOnActivate = false;
					break;
			}
		}
		return { focusOnActivate, reportOnActivate };
	}

	private _shouldHonorOsc99Occasion(occasion: Osc99Occasion | undefined): boolean {
		if (!occasion || occasion === 'always') {
			return true;
		}
		const windowFocused = this._host.isWindowFocused();
		switch (occasion) {
			case 'unfocused':
				return !windowFocused;
			case 'invisible':
				return !windowFocused && !this._host.isTerminalVisible();
			default:
				return true;
		}
	}

	private _showOsc99Notification(state: IOsc99NotificationState): boolean {
		const message = this._getOsc99NotificationMessage(state);
		if (!message) {
			return false;
		}

		const severity = state.urgency === 2 ? Severity.Warning : Severity.Info;
		const priority = this._getOsc99NotificationPriority(state.urgency);
		const source = {
			id: 'terminal',
			label: localize('terminalNotificationSource', 'Terminal')
		};
		const buttons = state.buttonsPayload.length > 0 ? state.buttonsPayload.split('\u2028') : [];
		const actionStore = this._register(new DisposableStore());

		const handleRef: { current: INotificationHandle | undefined } = { current: undefined };
		const activeRef: { current: IOsc99ActiveNotification | undefined } = { current: undefined };
		const reportActivation = (buttonIndex?: number, forceFocus?: boolean) => {
			if (forceFocus || state.focusOnActivate) {
				this._host.focusTerminal();
			}
			if (state.reportOnActivate) {
				this._sendOsc99ActivationReport(state.id, buttonIndex);
			}
		};

		const primaryActions: IAction[] = [];
		for (let i = 0; i < buttons.length; i++) {
			const label = buttons[i];
			if (!label) {
				continue;
			}
			const action = actionStore.add(new Action(`terminal.osc99.button.${i}`, label, undefined, true, () => {
				if (activeRef.current) {
					activeRef.current.closeReason = 'button';
				}
				reportActivation(i + 1);
				handleRef.current?.close();
			}));
			primaryActions.push(action);
		}

		const secondaryActions: IAction[] = [];
		secondaryActions.push(actionStore.add(new Action(
			'terminal.osc99.dismiss',
			localize('terminalNotificationDismiss', 'Dismiss'),
			undefined,
			true,
			() => {
				if (activeRef.current) {
					activeRef.current.closeReason = 'secondary';
				}
				handleRef.current?.close();
			}
		)));
		secondaryActions.push(actionStore.add(new Action(
			'terminal.osc99.disable',
			localize('terminalNotificationDisable', 'Disable Terminal Notifications'),
			undefined,
			true,
			async () => {
				await this._host.updateEnableNotifications(false);
				if (activeRef.current) {
					activeRef.current.closeReason = 'secondary';
				}
				handleRef.current?.close();
			}
		)));

		const actions = { primary: primaryActions, secondary: secondaryActions };

		if (state.id) {
			const existing = this._osc99ActiveNotifications.get(state.id);
			if (existing) {
				activeRef.current = existing;
				handleRef.current = existing.handle;
				existing.handle.updateMessage(message);
				existing.handle.updateSeverity(severity);
				existing.handle.updateActions(actions);
				existing.actionStore.dispose();
				existing.actionStore = actionStore;
				existing.focusOnActivate = state.focusOnActivate;
				existing.reportOnActivate = state.reportOnActivate;
				existing.reportOnClose = state.reportOnClose;
				existing.autoCloseDisposable?.dispose();
				existing.autoCloseDisposable = this._scheduleOsc99AutoClose(existing, state.autoCloseMs);
				return true;
			}
		}

		const handle = this._host.notify({
			id: state.id ? `terminal.osc99.${state.id}` : undefined,
			severity,
			message,
			source,
			actions,
			priority
		});
		handleRef.current = handle;

		const active: IOsc99ActiveNotification = {
			id: state.id,
			handle,
			actionStore,
			autoCloseDisposable: undefined,
			reportOnActivate: state.reportOnActivate,
			reportOnClose: state.reportOnClose,
			focusOnActivate: state.focusOnActivate,
			closeReason: undefined
		};
		activeRef.current = active;
		active.autoCloseDisposable = this._scheduleOsc99AutoClose(active, state.autoCloseMs);
		this._register(handle.onDidClose(() => {
			if (active.reportOnActivate && active.closeReason === undefined) {
				if (active.focusOnActivate) {
					this._host.focusTerminal();
				}
				this._sendOsc99ActivationReport(active.id);
			}
			if (active.reportOnClose) {
				this._sendOsc99CloseReport(active.id);
			}
			active.actionStore.dispose();
			active.autoCloseDisposable?.dispose();
			if (active.id) {
				this._osc99ActiveNotifications.delete(active.id);
			}
		}));

		if (active.id) {
			this._osc99ActiveNotifications.set(active.id, active);
		}
		return true;
	}

	private _getOsc99NotificationMessage(state: IOsc99NotificationState): string | undefined {
		const title = this._sanitizeOsc99MessageText(state.title);
		const body = this._sanitizeOsc99MessageText(state.body);
		const hasTitle = title.trim().length > 0;
		const hasBody = body.trim().length > 0;
		if (hasTitle && hasBody) {
			return `${title}: ${body}`;
		}
		if (hasTitle) {
			return title;
		}
		if (hasBody) {
			return body;
		}
		return undefined;
	}

	private _getOsc99NotificationPriority(urgency: number | undefined): NotificationPriority | undefined {
		switch (urgency) {
			case 0:
				return NotificationPriority.SILENT;
			case 1:
				return NotificationPriority.DEFAULT;
			case 2:
				return NotificationPriority.URGENT;
			default:
				return undefined;
		}
	}

	private _scheduleOsc99AutoClose(active: IOsc99ActiveNotification, autoCloseMs: number | undefined): IDisposable | undefined {
		if (autoCloseMs === undefined || autoCloseMs <= 0) {
			return undefined;
		}
		return disposableTimeout(() => {
			active.closeReason = 'auto';
			active.handle.close();
		}, autoCloseMs, this._store);
	}

	private _closeOsc99Notification(id: string | undefined): void {
		if (!id) {
			return;
		}
		const active = this._osc99ActiveNotifications.get(id);
		if (active) {
			active.closeReason = 'protocol';
			active.handle.close();
		}
		this._osc99PendingNotifications.delete(id);
	}

	private _sendOsc99QueryResponse(id: string | undefined): void {
		const requestId = id ?? '0';
		this._sendOsc99Response([
			`i=${requestId}`,
			'p=?',
			'a=report,focus',
			'c=1',
			'o=always,unfocused,invisible',
			'p=title,body,buttons,close,alive,?',
			'u=0,1,2',
			'w=1'
		]);
	}

	private _sendOsc99AliveResponse(id: string | undefined): void {
		const requestId = id ?? '0';
		const aliveIds = Array.from(this._osc99ActiveNotifications.keys()).join(',');
		this._sendOsc99Response([
			`i=${requestId}`,
			'p=alive'
		], aliveIds);
	}

	private _sendOsc99ActivationReport(id: string | undefined, buttonIndex?: number): void {
		const reportId = id ?? '0';
		this._sendOsc99Response([`i=${reportId}`], buttonIndex !== undefined ? String(buttonIndex) : '');
	}

	private _sendOsc99CloseReport(id: string | undefined): void {
		const reportId = id ?? '0';
		this._sendOsc99Response([`i=${reportId}`, 'p=close']);
	}

	private _sendOsc99Response(metadataParts: string[], payload: string = ''): void {
		const metadata = metadataParts.join(':');
		this._host.writeToProcess(`\x1b]99;${metadata};${payload}\x1b\\`);
	}
}
