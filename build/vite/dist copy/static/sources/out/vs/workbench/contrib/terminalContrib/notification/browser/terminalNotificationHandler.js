/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Action } from '../../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { NotificationPriority, Severity } from '../../../../../platform/notification/common/notification.js';
var Osc99PayloadType;
(function (Osc99PayloadType) {
    Osc99PayloadType["Title"] = "title";
    Osc99PayloadType["Body"] = "body";
    Osc99PayloadType["Buttons"] = "buttons";
    Osc99PayloadType["Close"] = "close";
    Osc99PayloadType["Query"] = "?";
    Osc99PayloadType["Alive"] = "alive";
})(Osc99PayloadType || (Osc99PayloadType = {}));
export class TerminalNotificationHandler extends Disposable {
    constructor(_host) {
        super();
        this._host = _host;
        this._osc99PendingNotifications = new Map();
        this._osc99ActiveNotifications = new Map();
    }
    handleSequence(data) {
        const { metadata, payload } = this._splitOsc99Data(data);
        const metadataEntries = this._parseOsc99Metadata(metadata);
        const payloadTypes = metadataEntries.get('p');
        const rawPayloadType = payloadTypes && payloadTypes.length > 0 ? payloadTypes[payloadTypes.length - 1] : undefined;
        const payloadType = rawPayloadType && rawPayloadType.length > 0 ? rawPayloadType : "title" /* Osc99PayloadType.Title */;
        const id = this._sanitizeOsc99Id(metadataEntries.get('i')?.[0]);
        if (!this._host.isEnabled()) {
            return true;
        }
        switch (payloadType) {
            case "?" /* Osc99PayloadType.Query */:
                this._sendOsc99QueryResponse(id);
                return true;
            case "alive" /* Osc99PayloadType.Alive */:
                this._sendOsc99AliveResponse(id);
                return true;
            case "close" /* Osc99PayloadType.Close */:
                this._closeOsc99Notification(id);
                return true;
        }
        const state = this._getOrCreateOsc99State(id);
        this._updateOsc99StateFromMetadata(state, metadataEntries);
        const isEncoded = metadataEntries.get('e')?.[0] === '1';
        const payloadText = this._decodeOsc99Payload(payload, isEncoded);
        const isDone = metadataEntries.get('d')?.[0] !== '0';
        switch (payloadType) {
            case "title" /* Osc99PayloadType.Title */:
                state.title += payloadText;
                break;
            case "body" /* Osc99PayloadType.Body */:
                state.body += payloadText;
                break;
            case "buttons" /* Osc99PayloadType.Buttons */:
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
    _splitOsc99Data(data) {
        const separatorIndex = data.indexOf(';');
        if (separatorIndex === -1) {
            return { metadata: data, payload: '' };
        }
        return {
            metadata: data.substring(0, separatorIndex),
            payload: data.substring(separatorIndex + 1)
        };
    }
    _parseOsc99Metadata(metadata) {
        const result = new Map();
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
    _decodeOsc99Payload(payload, isEncoded) {
        if (!isEncoded) {
            return payload;
        }
        try {
            return decodeBase64(payload).toString();
        }
        catch {
            this._host.logWarn('Failed to decode OSC 99 payload');
            return '';
        }
    }
    _sanitizeOsc99Id(rawId) {
        if (!rawId) {
            return undefined;
        }
        const sanitized = rawId.replace(/[^a-zA-Z0-9_\-+.]/g, '');
        return sanitized.length > 0 ? sanitized : undefined;
    }
    _sanitizeOsc99MessageText(text) {
        return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    }
    _getOrCreateOsc99State(id) {
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
    _createOsc99State(id) {
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
    _clearOsc99PendingState(id) {
        if (!id) {
            this._osc99PendingAnonymous = undefined;
            return;
        }
        this._osc99PendingNotifications.delete(id);
    }
    _updateOsc99StateFromMetadata(state, metadataEntries) {
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
    _parseOsc99Actions(value) {
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
    _shouldHonorOsc99Occasion(occasion) {
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
    _showOsc99Notification(state) {
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
        const handleRef = { current: undefined };
        const activeRef = { current: undefined };
        const reportActivation = (buttonIndex, forceFocus) => {
            if (forceFocus || state.focusOnActivate) {
                this._host.focusTerminal();
            }
            if (state.reportOnActivate) {
                this._sendOsc99ActivationReport(state.id, buttonIndex);
            }
        };
        const primaryActions = [];
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
        const secondaryActions = [];
        secondaryActions.push(actionStore.add(new Action('terminal.osc99.dismiss', localize('terminalNotificationDismiss', 'Dismiss'), undefined, true, () => {
            if (activeRef.current) {
                activeRef.current.closeReason = 'secondary';
            }
            handleRef.current?.close();
        })));
        secondaryActions.push(actionStore.add(new Action('terminal.osc99.disable', localize('terminalNotificationDisable', 'Disable Terminal Notifications'), undefined, true, async () => {
            await this._host.updateEnableNotifications(false);
            if (activeRef.current) {
                activeRef.current.closeReason = 'secondary';
            }
            handleRef.current?.close();
        })));
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
        const active = {
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
    _getOsc99NotificationMessage(state) {
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
    _getOsc99NotificationPriority(urgency) {
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
    _scheduleOsc99AutoClose(active, autoCloseMs) {
        if (autoCloseMs === undefined || autoCloseMs <= 0) {
            return undefined;
        }
        return disposableTimeout(() => {
            active.closeReason = 'auto';
            active.handle.close();
        }, autoCloseMs, this._store);
    }
    _closeOsc99Notification(id) {
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
    _sendOsc99QueryResponse(id) {
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
    _sendOsc99AliveResponse(id) {
        const requestId = id ?? '0';
        const aliveIds = Array.from(this._osc99ActiveNotifications.keys()).join(',');
        this._sendOsc99Response([
            `i=${requestId}`,
            'p=alive'
        ], aliveIds);
    }
    _sendOsc99ActivationReport(id, buttonIndex) {
        const reportId = id ?? '0';
        this._sendOsc99Response([`i=${reportId}`], buttonIndex !== undefined ? String(buttonIndex) : '');
    }
    _sendOsc99CloseReport(id) {
        const reportId = id ?? '0';
        this._sendOsc99Response([`i=${reportId}`, 'p=close']);
    }
    _sendOsc99Response(metadataParts, payload = '') {
        const metadata = metadataParts.join(':');
        this._host.writeToProcess(`\x1b]99;${metadata};${payload}\x1b\\`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxOb3RpZmljYXRpb25IYW5kbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL25vdGlmaWNhdGlvbi9icm93c2VyL3Rlcm1pbmFsTm90aWZpY2F0aW9uSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFXLE1BQU0sdUNBQXVDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFvQixNQUFNLHlDQUF5QyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFnRCxNQUFNLDZEQUE2RCxDQUFDO0FBRTNKLElBQVcsZ0JBT1Y7QUFQRCxXQUFXLGdCQUFnQjtJQUMxQixtQ0FBZSxDQUFBO0lBQ2YsaUNBQWEsQ0FBQTtJQUNiLHVDQUFtQixDQUFBO0lBQ25CLG1DQUFlLENBQUE7SUFDZiwrQkFBVyxDQUFBO0lBQ1gsbUNBQWUsQ0FBQTtBQUNoQixDQUFDLEVBUFUsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQU8xQjtBQXdDRCxNQUFNLE9BQU8sMkJBQTRCLFNBQVEsVUFBVTtJQUsxRCxZQUNrQixLQUE2QjtRQUU5QyxLQUFLLEVBQUUsQ0FBQztRQUZTLFVBQUssR0FBTCxLQUFLLENBQXdCO1FBTDlCLCtCQUEwQixHQUFHLElBQUksR0FBRyxFQUFtQyxDQUFDO1FBRXhFLDhCQUF5QixHQUFHLElBQUksR0FBRyxFQUFvQyxDQUFDO0lBTXpGLENBQUM7SUFFRCxj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