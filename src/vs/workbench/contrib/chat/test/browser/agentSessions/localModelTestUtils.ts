/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { LOCAL_MODEL_REQUEST_KEY, LOCAL_MODEL_STATUS_KEY, type ILocalModelFamilyV1, type ILocalModelRequest, type ILocalModelStatusV1 } from '../../../../../../platform/agentHost/common/localModel.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { IRootConfigChangedAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfirmation, IConfirmationResult, IPrompt, IPromptBaseButton, IPromptResult, IPromptResultWithCancel, IPromptWithCustomCancel, IPromptWithDefaultCancel } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationService, IChatInputNotificationSetOptions } from '../../../browser/widget/input/chatInputNotificationService.js';

/** The local agent host connection, publishing status and recording requests (nonce dropped). */
export class TestLocalModelConnection extends mock<IAgentHostService>() {
	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;
	private readonly _onDidChange = new Emitter<RootState>();
	private _value: RootState | undefined;
	readonly requests: Omit<ILocalModelRequest, 'nonce'>[] = [];

	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value() { return self._value; },
			get verifiedValue() { return self._value; },
			onDidChange: this._onDidChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	/** Publishes `status`, or withdraws it (`undefined`), as the host does. */
	setStatus(status: ILocalModelStatusV1 | undefined): void {
		this._value = { agents: [], config: { schema: { type: 'object', properties: {} }, values: status ? { [LOCAL_MODEL_STATUS_KEY]: status } : {} } };
		this._onDidChange.fire(this._value);
	}

	override dispatch(_channel: string, action: IRootConfigChangedAction): void {
		const { nonce: _nonce, ...request } = action.config[LOCAL_MODEL_REQUEST_KEY] as ILocalModelRequest;
		this.requests.push(request);
	}

	dispose(): void {
		this._onAgentHostStart.dispose();
		this._onDidChange.dispose();
	}
}

const GiB = 1024 * 1024 * 1024;

/** Example Flash 1.0 as offered on the N1X: a full fit, nothing on the device yet. */
export const offeredFamily: ILocalModelFamilyV1 = {
	familyId: 'mai-code-1.1-flash-local',
	capiId: 'mai-code-1.1-flash-local',
	autoCapable: true,
	displayName: 'Example Flash 1.0',
	offer: { fit: 'full', requiredGpuBytes: 60 * GiB, downloadBytes: Math.round(56.7 * GiB), peakDiskBytes: Math.round(57.2 * GiB), licenseName: 'MIT', licenseUrl: 'https://example.com/license' },
	entry: { modelFilesPresent: false, disk: { volume: 'C:', availableBytes: 400 * GiB, requiredBytes: Math.round(57.2 * GiB) } },
	usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
	consentGiven: false,
};

/** The same family once installed and loaded. */
export const installedFamily: ILocalModelFamilyV1 = {
	familyId: offeredFamily.familyId,
	capiId: offeredFamily.capiId,
	autoCapable: true,
	displayName: offeredFamily.displayName,
	install: { contentId: 'c1', adopted: false, owned: true, modelId: 'MAI-Code-1.1-Flash' },
	usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
	readyOfferId: `${offeredFamily.familyId}:c1`,
	consentGiven: true,
};

/** A second, smaller family. */
export const otherFamily: ILocalModelFamilyV1 = {
	familyId: 'example-coder-local',
	capiId: 'example-coder-local',
	autoCapable: false,
	displayName: 'Example Coder',
	install: { contentId: 'q1', adopted: false, owned: true, modelId: 'Example-Coder' },
	usage: { runningStreams: 0, boundDirectChats: 2, liveAutoRoutes: 1 },
	readyOfferId: 'example-coder-local:q1',
	consentGiven: true,
};

/** Status of an NVIDIA device with no llama.cpp found yet, and `families`. */
export function createStatus(families: readonly ILocalModelFamilyV1[], overrides: Partial<ILocalModelStatusV1> = {}): ILocalModelStatusV1 {
	return {
		schemaVersion: 1,
		device: { id: 'Vulkan0', capacityBytes: 68784 * 1024 * 1024, confidence: 'measured', vendor: 'nvidia' },
		runtime: {},
		catalog: { state: 'ready', registries: { azureml: 'ready' } },
		families,
		useInAuto: true,
		...overrides,
	};
}

/** What a dialog showed. */
export interface IShownDialog {
	readonly kind: 'prompt' | 'confirm';
	readonly message: string;
	readonly detail: string | undefined;
	readonly buttons: readonly string[];
	readonly markdown: readonly string[];
}

/** Records dialogs and answers them from a script: a button label (prompt), `true`/`false` (confirm), or `undefined` to cancel. */
export class ScriptedDialogService extends TestDialogService {
	readonly shown: IShownDialog[] = [];
	readonly answers: (string | boolean | undefined)[] = [];

	override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.shown.push({ kind: 'confirm', message: confirmation.message, detail: typeof confirmation.detail === 'string' ? confirmation.detail : confirmation.detail?.value, buttons: [confirmation.primaryButton ?? 'Yes'], markdown: [] });
		return { confirmed: this.answers.shift() === true };
	}

	override prompt<T>(prompt: IPromptWithCustomCancel<T>): Promise<IPromptResultWithCancel<T>>;
	override prompt<T>(prompt: IPromptWithDefaultCancel<T>): Promise<IPromptResult<T>>;
	override prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;
	override async prompt<T>(prompt: IPrompt<T> | IPromptWithCustomCancel<T>): Promise<IPromptResult<T> | IPromptResultWithCancel<T>> {
		const buttons: (IPromptBaseButton<T> & { label: string })[] = [...(prompt.buttons ?? [])];
		const custom = typeof prompt.custom === 'object' ? prompt.custom : undefined;
		this.shown.push({
			kind: 'prompt',
			message: prompt.message,
			detail: typeof prompt.detail === 'string' ? prompt.detail : prompt.detail?.value,
			buttons: buttons.map(button => button.label),
			markdown: custom?.markdownDetails?.map(detail => detail.markdown.value) ?? [],
		});
		const answer = this.answers.shift();
		const button = buttons.find(candidate => candidate.label === answer);
		return { result: button ? await button.run({ checkboxChecked: false }) : undefined };
	}
}

/** Records `publicLog2` events by name. */
export class RecordingTelemetryService extends mock<ITelemetryService>() {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName: string, data?: unknown): void {
		this.events.push({ name: eventName, data });
	}
}

/** Records executed commands. */
export class RecordingCommandService extends mock<ICommandService>() {
	readonly executed: unknown[][] = [];

	override async executeCommand<R>(commandId: string, ...args: unknown[]): Promise<R | undefined> {
		this.executed.push([commandId, ...args]);
		return undefined;
	}
}

/**
 * Records chat input notifications like `ChatInputNotificationService`, without
 * rendering: publishing one clears its dismissal, and dismissing one calls its
 * `onDismiss`.
 */
export class RecordingChatInputNotificationService extends mock<IChatInputNotificationService>() {
	readonly notifications = new Map<string, IChatInputNotification>();
	/** Every notification published, in order. */
	readonly published: IChatInputNotification[] = [];
	private readonly _dismissed = new Set<string>();

	override setNotification(notification: IChatInputNotification, options?: IChatInputNotificationSetOptions): void {
		const existing = this.notifications.has(notification.id);
		this.notifications.set(notification.id, notification);
		this.published.push(notification);
		if (!existing || !options?.inPlace) {
			this._dismissed.delete(notification.id);
		}
	}

	override deleteNotification(id: string): void {
		this.notifications.delete(id);
		this._dismissed.delete(id);
	}

	override dismissNotification(id: string, notification = this.notifications.get(id)): void {
		if (notification && this.notifications.get(id) === notification) {
			this._dismissed.add(id);
		}
		notification?.onDismiss?.();
	}

	/** The notification with `id`, unless dismissed. */
	visible(id: string): IChatInputNotification | undefined {
		return this._dismissed.has(id) ? undefined : this.notifications.get(id);
	}
}

/** The real chat input notification service, so producers' notices compete as they do in a window. */
export function createChatInputNotificationService(): IChatInputNotificationService & IDisposable {
	const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
	if (!descriptor) {
		throw new Error('IChatInputNotificationService is not registered');
	}
	return new descriptor.ctor(new NullLogService());
}

/** A notice as `Severity: message (progress) [actions]`, the primary action marked with `*` and a disabled one in parentheses. */
export function describeNotice(notification: IChatInputNotification | undefined): string | undefined {
	if (!notification) {
		return undefined;
	}
	const severity = ['Info', 'Warning', 'Error'][notification.severity];
	const message = typeof notification.message === 'string' ? notification.message : notification.message.value;
	const progress = notification.progress ? ` (${notification.progress.percent === undefined ? 'indeterminate' : `${notification.progress.percent}%`})` : '';
	return `${severity}: ${message}${progress} [${notification.actions.map(action => action.disabled ? `(${action.label})` : `${action.label}${action.primary ? '*' : ''}`).join(', ')}]`;
}

/** Selects the action labelled `label`: runs internal commands (`_`-prefixed) and records the others. */
export function runNoticeAction(notification: IChatInputNotification | undefined, label: string, commands: ICommandService): unknown {
	const action = notification?.actions.find(candidate => candidate.label === label);
	if (action?.kind !== ChatInputNotificationActionKind.Command) {
		throw new Error(`No command action '${label}' in ${describeNotice(notification)}`);
	}
	const internal = action.commandId.startsWith('_') ? CommandsRegistry.getCommand(action.commandId) : undefined;
	return internal
		? internal.handler(new class extends mock<ServicesAccessor>() { }(), ...(action.commandArgs ?? []))
		: commands.executeCommand(action.commandId, ...(action.commandArgs ?? []));
}
