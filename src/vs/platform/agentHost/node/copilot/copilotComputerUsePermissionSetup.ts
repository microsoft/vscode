/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ElicitationResult, ElicitationSchema } from '@github/copilot-sdk';
import { DeferredPromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { runOnChange } from '../../../../base/common/observable.js';
import { hasKey } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { COMPUTER_USE_REQUEST_KEY, COMPUTER_USE_STATUS_KEY, computerUsePermissions, isComputerUseRequest, type ComputerUseAction, type ComputerUsePermission, type ComputerUsePermissionState, type ComputerUseSetupState, type IComputerUseErrorV1, type IComputerUseSetupActionV1, type IComputerUseStatusV1 } from '../../common/computerUse.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { withComputerUseSetupCard } from '../../common/meta/computerUse.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputResponseKind, type ChatInputAnswer, type ChatInputRequest } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostMacAccessibilityTrustService } from '../agentHostMacAccessibilityTrustService.js';

// #region The plugin's permission prompt

/*
 * While Accessibility or Screen Recording is missing, the plugin's readiness check asks the MCP client, in a loop, to
 * choose one value of a single required `choice` enum: `request_<slug>` for each missing permission (the native macOS
 * prompt), `settings_<slug>` for each one whose native prompt did not grant it (its System Settings pane), and
 * `try_again` (restart the helper and verify again). It re-asks after every choice until both are granted, which lets
 * the waiting tool call continue; declining stops the loop and fails the tool call. Every other prompt of the plugin
 * comes after this check. See `elicit_macos_permissions` in github/computer-use `src/mcp/src/server.rs`.
 */

const CHOICE_FIELD = 'choice';
const TRY_AGAIN_CHOICE = 'try_again';
const PERMISSION_SLUGS: { readonly [P in ComputerUsePermission]: string } = {
	accessibility: 'accessibility',
	screenRecording: 'screen_recording',
};

/** What one permission prompt of the plugin offers. */
export interface IComputerUsePermissionPrompt {
	/** The permissions the plugin found missing; it offers the native prompt for each. */
	readonly missing: ReadonlySet<ComputerUsePermission>;
	/** Missing permissions whose native prompt did not grant them; the plugin offers their System Settings pane. */
	readonly settings: ReadonlySet<ComputerUsePermission>;
}

function choiceFor(action: ComputerUseAction, permission: ComputerUsePermission | undefined): string | undefined {
	switch (action) {
		case 'request': return permission && `request_${PERMISSION_SLUGS[permission]}`;
		case 'openSettings': return permission && `settings_${PERMISSION_SLUGS[permission]}`;
		case 'recheck': return TRY_AGAIN_CHOICE;
	}
}

function actionForChoice(choice: string | undefined): IComputerUseSetupActionV1 | undefined {
	if (choice === TRY_AGAIN_CHOICE) {
		return { action: 'recheck' };
	}
	for (const permission of computerUsePermissions) {
		for (const action of ['request', 'openSettings'] as const) {
			if (choice === choiceFor(action, permission)) {
				return { action, permission };
			}
		}
	}
	return undefined;
}

/**
 * Recognizes the plugin's permission prompt by its structured choices, never by its message. Returns `undefined` for
 * anything else, including a prompt with a choice this version does not know, so it keeps the ordinary elicitation UI.
 */
export function parseComputerUsePermissionPrompt(schema: ElicitationSchema | undefined): IComputerUsePermissionPrompt | undefined {
	if (schema?.type !== 'object' || !schema.properties || !Array.isArray(schema.required) || !schema.required.includes(CHOICE_FIELD)) {
		return undefined;
	}
	const fields = Object.keys(schema.properties);
	const field = schema.properties[CHOICE_FIELD];
	if (fields.length !== 1 || field?.type !== 'string' || !hasKey(field, { enum: true }) || !Array.isArray(field.enum)) {
		return undefined;
	}
	const missing = new Set<ComputerUsePermission>();
	const settings = new Set<ComputerUsePermission>();
	let canRecheck = false;
	for (const choice of field.enum) {
		const offered = actionForChoice(typeof choice === 'string' ? choice : undefined);
		if (!offered) {
			return undefined;
		}
		if (offered.action === 'recheck') {
			canRecheck = true;
		} else if (offered.permission) {
			(offered.action === 'request' ? missing : settings).add(offered.permission);
		}
	}
	if (!canRecheck || missing.size === 0 || [...settings].some(permission => !missing.has(permission))) {
		return undefined;
	}
	return { missing, settings };
}

/**
 * - `permissions`: the plugin's permission prompt, which the setup handles.
 * - `unrecognizedPermissions`: a prompt that uses the permission prompt's choices in a form this version does not know,
 *   e.g. from a newer plugin. It keeps the ordinary elicitation UI and proves nothing about the permissions.
 * - `other`: any other prompt. The plugin only asks those once its permission check passed.
 */
export type ComputerUsePromptKind =
	| { readonly kind: 'permissions'; readonly offered: IComputerUsePermissionPrompt }
	| { readonly kind: 'unrecognizedPermissions' }
	| { readonly kind: 'other' };

function choiceValues(field: ElicitationSchema['properties'][string] | undefined): readonly unknown[] {
	// Schemas arrive from the plugin through the runtime, so tolerate shapes the typings rule out.
	if (!field || typeof field !== 'object') {
		return [];
	}
	if (field.type === 'array') {
		const items = field.items;
		if (!items || typeof items !== 'object') {
			return [];
		}
		if (hasKey(items, { enum: true })) {
			return Array.isArray(items.enum) ? items.enum : [];
		}
		return Array.isArray(items.anyOf) ? items.anyOf.map(option => option?.const) : [];
	}
	if (hasKey(field, { enum: true })) {
		return Array.isArray(field.enum) ? field.enum : [];
	}
	if (hasKey(field, { oneOf: true })) {
		return Array.isArray(field.oneOf) ? field.oneOf.map(option => option?.const) : [];
	}
	return [];
}

function isPermissionChoice(choice: unknown): boolean {
	return typeof choice === 'string' && (choice === TRY_AGAIN_CHOICE || choice.startsWith('request_') || choice.startsWith('settings_'));
}

/** Classifies a form prompt of the plugin by its structured choices; see {@link ComputerUsePromptKind}. */
export function classifyComputerUsePrompt(schema: ElicitationSchema | undefined): ComputerUsePromptKind {
	const offered = parseComputerUsePermissionPrompt(schema);
	if (offered) {
		return { kind: 'permissions', offered };
	}
	const fields = schema?.properties && typeof schema.properties === 'object' ? Object.values(schema.properties) : [];
	return fields.some(field => choiceValues(field).some(isPermissionChoice)) ? { kind: 'unrecognizedPermissions' } : { kind: 'other' };
}

function offeredActions(prompt: IComputerUsePermissionPrompt): IComputerUseSetupActionV1[] {
	const actions: IComputerUseSetupActionV1[] = [];
	for (const permission of computerUsePermissions) {
		if (prompt.missing.has(permission)) {
			actions.push({ action: 'request', permission });
		}
		if (prompt.settings.has(permission)) {
			actions.push({ action: 'openSettings', permission });
		}
	}
	actions.push({ action: 'recheck' });
	return actions;
}

function isOffered(prompt: IComputerUsePermissionPrompt, { action, permission }: IComputerUseSetupActionV1): boolean {
	switch (action) {
		case 'request': return !!permission && prompt.missing.has(permission);
		case 'openSettings': return !!permission && prompt.settings.has(permission);
		case 'recheck': return true;
	}
}

function selectedChoice(answer: ChatInputAnswer | undefined): string | undefined {
	if (answer?.state !== ChatInputAnswerState.Submitted) {
		return undefined;
	}
	const value = answer.value;
	return value.kind === ChatInputAnswerValueKind.Selected || value.kind === ChatInputAnswerValueKind.Text ? value.value : undefined;
}

// #endregion

// #region Errors

function permissionLabel(permission: ComputerUsePermission): string {
	switch (permission) {
		case 'accessibility': return localize('computerUse.permission.accessibility', "Accessibility");
		case 'screenRecording': return localize('computerUse.permission.screenRecording', "Screen Recording");
	}
}

function stillNotGrantedError(missing: ReadonlySet<ComputerUsePermission>): IComputerUseErrorV1 {
	const permissions = computerUsePermissions.filter(permission => missing.has(permission)).map(permissionLabel);
	return {
		code: 'stillNotGranted',
		message: permissions.length === 1
			? localize('computerUse.error.stillNotGranted.one', "macOS still reports {0} as off.", permissions[0])
			: localize('computerUse.error.stillNotGranted.both', "macOS still reports {0} and {1} as off.", permissions[0], permissions[1]),
	};
}

function notWaitingError(): IComputerUseErrorV1 {
	return { code: 'notWaiting', message: localize('computerUse.error.notWaiting', "Copilot is no longer waiting for this setup. Ask Copilot to try again when you're ready.") };
}

function unconfirmedError(): IComputerUseErrorV1 {
	return { code: 'unconfirmed', message: localize('computerUse.error.unconfirmed', "Copilot Computer Use stopped before confirming the permissions. If Copilot still can't use apps, ask it to try again.") };
}

function unsupportedPromptError(): IComputerUseErrorV1 {
	return { code: 'unsupportedPrompt', message: localize('computerUse.error.unsupportedPrompt', "Copilot Computer Use asked for permissions in a way this setup doesn't support. Answer its request in the chat instead.") };
}

// #endregion

/** How a setup reaches the chat whose turn waits. Implemented by the Copilot chat session. */
export interface ICopilotComputerUseSetupChat {
	/** The chat channel URI. */
	readonly chatUri: string;
	/** Inserts the setup's chat input request, or replaces it in place while it is still open. */
	requestInput(request: ChatInputRequest): void;
	/** Completes the setup's chat input request on behalf of the host. */
	completeInput(requestId: string, response: ChatInputResponseKind): void;
}

/** The app that holds the permissions; see {@link IComputerUseStatusV1.helperApp}. */
export interface ICopilotComputerUseHelperApp {
	readonly path: string;
	/** Reads the app's icon as a PNG data URL; `undefined` while the app or its icon is missing. Never rejects. */
	readIcon(): Promise<string | undefined>;
}

interface IPendingPrompt {
	readonly offered: IComputerUsePermissionPrompt;
	/** The ordinary form of the prompt, which the chat input request carries for clients without the setup UI. */
	readonly input: ChatInputRequest;
	/** Completes the plugin's elicitation; completing it again has no effect. */
	readonly result: DeferredPromise<ElicitationResult>;
}

interface ISetup {
	readonly id: string;
	readonly chat: ICopilotComputerUseSetupChat;
	state: ComputerUseSetupState;
	round: number;
	/** The open chat input request; `undefined` once a client or the host completed it. */
	cardId: string | undefined;
	prompt: IPendingPrompt | undefined;
	/** The action sent for the previous prompt. Its outcome is the next prompt, or the plugin moving past its check. */
	sent: IComputerUseSetupActionV1 | undefined;
	/** Whether the host sent {@link sent} on its own, not for the user. */
	sentAutomatically: boolean;
	error: IComputerUseErrorV1 | undefined;
}

interface IQueuedAction extends IComputerUseSetupActionV1 {
	readonly setupId: string;
	readonly round: number;
	/** Sent by the host on its own, so an outcome that changed nothing is no error. */
	readonly automatic?: boolean;
}

const MAX_REMEMBERED_NONCES = 128;
const MAX_QUEUED_ACTIONS = 16;
const MAX_FINISHED_SETUPS = 8;
/** Coalesces the bursts of Accessibility changes one switch in System Settings can cause. */
const ACCESSIBILITY_CHANGE_DEBOUNCE_MS = 500;
/** How long after asking macOS for Accessibility a change may only mean that macOS added the app to its list. */
const ACCESSIBILITY_PROMPT_SETTLE_MS = 2000;

/**
 * Turns the plugin's repeated permission prompts into one setup per waiting turn, shared by every chat of the local
 * macOS Agent Host, because the permissions and the helper that holds them are per user, not per chat.
 *
 * Publishes `vscode.computerUse.status` and takes requests from `vscode.computerUse.request`, claiming each nonce and
 * clearing the key before acting. Actions only answer the plugin's pending prompts, so everything runs through the
 * plugin's MCP connection, which the Copilot runtime owns; nothing here starts processes or grants anything. Actions
 * run one at a time across all setups, so native prompts never overlap; a request for an older round is dropped.
 *
 * When macOS reports an Accessibility change, every setup that waits for Accessibility checks again on its own, so a
 * grant in System Settings shows up without the user asking.
 */
export class CopilotComputerUsePermissionSetup extends Disposable {

	private readonly _setups = new Map<string, ISetup>();
	private readonly _queue: IQueuedAction[] = [];
	private readonly _seenNonces = new Set<string>();
	/** Chats whose user declined setup in their current turn. */
	private readonly _declinedChats = new Set<ICopilotComputerUseSetupChat>();
	private readonly _permissions: Record<ComputerUsePermission, ComputerUsePermissionState> = { accessibility: 'unknown', screenRecording: 'unknown' };
	private _verifiedAt: number | undefined;
	/** The setup whose action is in flight. */
	private _working: ISetup | undefined;
	/** When the plugin last answered a request for Accessibility, which shows macOS's prompt. */
	private _accessibilityRequestedAt: number | undefined;
	private _helperAppIcon: string | undefined;
	private _readingHelperAppIcon = false;

	constructor(
		/** The app that holds the permissions, and how to read its icon once the plugin installed it. */
		private readonly _helperApp: ICopilotComputerUseHelperApp | undefined,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostMacAccessibilityTrustService accessibilityTrust: IAgentHostMacAccessibilityTrustService,
	) {
		super();
		this._discardStaleRequest();
		this._register(this._configurationService.onDidRootConfigChange(() => this._handleRequest()));
		const accessibilityCheck = this._register(new RunOnceScheduler(() => this._checkAccessibilityAgain(), ACCESSIBILITY_CHANGE_DEBOUNCE_MS));
		this._register(runOnChange(accessibilityTrust.changes, () => {
			if (this._isAskingForAccessibility()) {
				this._logService.info('[ComputerUse] Ignoring an Accessibility change while macOS asks for Accessibility');
			} else {
				accessibilityCheck.schedule();
			}
		}));
		this._register(toDisposable(() => {
			for (const setup of this._setups.values()) {
				setup.prompt?.result.complete({ action: 'cancel' });
			}
			this._setups.clear();
			this._queue.length = 0;
			this._working = undefined;
			this._configurationService.publishRootTransientValues?.({ [COMPUTER_USE_STATUS_KEY]: undefined });
		}));
		this._publish();
	}

	/**
	 * Takes over one permission prompt of the plugin in `chat`, showing or updating the chat's setup request. The
	 * promise resolves once, when the user chose an action, the setup ended, or the chat stopped waiting.
	 */
	handlePrompt(chat: ICopilotComputerUseSetupChat, offered: IComputerUsePermissionPrompt, input: ChatInputRequest): Promise<ElicitationResult> {
		if (this._store.isDisposed) {
			return Promise.resolve({ action: 'cancel' });
		}
		if (this._declinedChats.has(chat)) {
			// The user turned setup down in this turn; the plugin re-asks for every tool call, so don't ask them again.
			this._logService.info('[ComputerUse] Declining a permission prompt: setup was declined in this turn');
			return Promise.resolve({ action: 'decline' });
		}
		// The prompt after an action continues its setup. The plugin asks one thing at a time, so a prompt that is
		// still open in the chat was abandoned; the new prompt replaces it in the same setup.
		let setup = this._working?.chat === chat ? this._working : this._activeSetups(chat)[0];
		if (!setup) {
			setup = { id: generateUuid(), chat, state: 'needsPermissions', round: 0, cardId: undefined, prompt: undefined, sent: undefined, sentAutomatically: false, error: undefined };
			this._setups.set(setup.id, setup);
		}
		setup.prompt?.result.complete({ action: 'cancel' });
		if (setup.sent?.action === 'request' && setup.sent.permission === 'accessibility') {
			this._accessibilityRequestedAt = Date.now();
		}
		// The plugin installed its helper app before it could find permissions missing.
		this._readHelperAppIcon();
		this._recordVerified(offered.missing);
		// Only a check the user asked for reports that it changed nothing.
		setup.error = setup.sent?.action === 'recheck' && !setup.sentAutomatically ? stillNotGrantedError(offered.missing) : undefined;
		setup.round++;
		setup.sent = undefined;
		setup.sentAutomatically = false;
		setup.state = 'needsPermissions';
		setup.prompt = { offered, input, result: new DeferredPromise<ElicitationResult>() };
		if (this._working === setup) {
			this._working = undefined;
		}
		this._logService.info(`[ComputerUse] Setup ${setup.id} round ${setup.round}: missing ${[...offered.missing].join(', ')}`);
		this._showInput(setup);
		this._publish();
		const result = setup.prompt.result.p;
		this._drain();
		return result;
	}

	/**
	 * Handles a client's answer to a setup's chat input request; `false` when `requestId` is not one. Declining or
	 * cancelling ends the setup. Accepting submits the chosen action like a request, which clients without the setup UI
	 * do by answering the request's ordinary questions; like the plugin, an answer without a choice checks again.
	 */
	respondToInput(chat: ICopilotComputerUseSetupChat, requestId: string, response: ChatInputResponseKind, answers: Record<string, ChatInputAnswer> | undefined): boolean {
		const setup = [...this._setups.values()].find(candidate => candidate.chat === chat && candidate.cardId === requestId);
		if (!setup) {
			return false;
		}
		setup.cardId = undefined;
		if (response !== ChatInputResponseKind.Accept) {
			if (response === ChatInputResponseKind.Decline) {
				this._declinedChats.add(chat);
			}
			this._end(setup, undefined, response === ChatInputResponseKind.Decline ? 'decline' : 'cancel');
			return true;
		}
		const choice = selectedChoice(answers?.[CHOICE_FIELD]);
		const action = choice === undefined ? { action: 'recheck' as const } : actionForChoice(choice);
		if (action) {
			this._enqueue({ ...action, setupId: setup.id, round: setup.round });
		} else {
			// The plugin stops asking when it gets a choice it doesn't know.
			this._end(setup, undefined, 'cancel');
		}
		return true;
	}

	/**
	 * A tool call of the plugin completed in `chat`. Every tool call passes the plugin's permission check before doing
	 * anything else, and the check only lets a call continue without asking again once the helper verified both
	 * permissions. A call that succeeded after an action therefore proves the setup is done; a failed one does not,
	 * because the action may not have reached the plugin.
	 */
	onToolCallCompleted(chat: ICopilotComputerUseSetupChat, success: boolean): void {
		for (const setup of this._activeSetups(chat)) {
			if (setup.state === 'working' && success) {
				this._ready(setup);
			} else {
				this._end(setup, setup.state === 'working' ? unconfirmedError() : notWaitingError(), 'cancel');
			}
		}
	}

	/** The plugin asked something other than its permission prompt in `chat`, which it only does once its check passed. */
	onOtherPrompt(chat: ICopilotComputerUseSetupChat): void {
		for (const setup of this._activeSetups(chat)) {
			if (setup.state === 'working') {
				this._ready(setup);
			}
		}
	}

	/**
	 * The plugin asked for permissions in `chat` in a form this version does not recognize. The setup can't answer it,
	 * and it says nothing about the permissions, so the setup ends and the ordinary elicitation UI takes over.
	 */
	onUnrecognizedPrompt(chat: ICopilotComputerUseSetupChat): void {
		for (const setup of this._activeSetups(chat)) {
			this._end(setup, unsupportedPromptError(), 'cancel');
		}
	}

	/** `chat` stopped waiting: its turn ended or was cancelled, or its session is going away. */
	cancelChat(chat: ICopilotComputerUseSetupChat): void {
		this._declinedChats.delete(chat);
		for (const setup of this._activeSetups(chat)) {
			// The chat's turn is over, so its request is left as the turn left it.
			setup.cardId = undefined;
			this._end(setup, notWaitingError(), 'cancel');
		}
	}

	/**
	 * macOS changed which apps it trusts for Accessibility, perhaps because the user turned on Copilot Computer Use in
	 * System Settings. The change names no app, so every setup that waits for Accessibility checks again once.
	 */
	private _checkAccessibilityAgain(): void {
		if (this._isAskingForAccessibility()) {
			this._logService.info('[ComputerUse] Ignoring an Accessibility change while macOS asks for Accessibility');
			return;
		}
		for (const setup of this._setups.values()) {
			if (setup.state === 'needsPermissions' && setup.prompt?.offered.missing.has('accessibility')) {
				this._logService.info(`[ComputerUse] Setup ${setup.id} round ${setup.round}: macOS changed Accessibility, checking again`);
				this._enqueue({ setupId: setup.id, round: setup.round, action: 'recheck', automatic: true });
			}
		}
	}

	/**
	 * Whether macOS may be asking for Accessibility. Asking adds the app to macOS's list, a change of its own, and shows
	 * a prompt that the helper holds open; an automatic check restarts the helper, which would close that prompt.
	 */
	private _isAskingForAccessibility(): boolean {
		const asks = (action: IComputerUseSetupActionV1 | undefined) => action?.action === 'request' && action.permission === 'accessibility';
		return asks(this._working?.sent)
			|| this._queue.some(asks)
			|| (this._accessibilityRequestedAt !== undefined && Date.now() - this._accessibilityRequestedAt < ACCESSIBILITY_PROMPT_SETTLE_MS);
	}

	private _readHelperAppIcon(): void {
		const helperApp = this._helperApp;
		if (!helperApp || this._helperAppIcon || this._readingHelperAppIcon) {
			return;
		}
		this._readingHelperAppIcon = true;
		void helperApp.readIcon().then(icon => {
			this._readingHelperAppIcon = false;
			if (icon && !this._store.isDisposed) {
				this._helperAppIcon = icon;
				this._publish();
			}
		});
	}

	private _activeSetups(chat: ICopilotComputerUseSetupChat): ISetup[] {
		return [...this._setups.values()].filter(setup => setup.chat === chat && (setup.state === 'needsPermissions' || setup.state === 'working'));
	}

	private _showInput(setup: ISetup): void {
		const prompt = setup.prompt;
		if (!prompt) {
			return;
		}
		// Kept while open so each prompt replaces the request in place; a completed request gets a successor.
		setup.cardId ??= generateUuid();
		setup.chat.requestInput(withComputerUseSetupCard(withChatInputRequestPurpose({ ...prompt.input, id: setup.cardId }, ChatInputRequestPurpose.Elicitation), setup.id));
	}

	private _closeInput(setup: ISetup, response: ChatInputResponseKind): void {
		const cardId = setup.cardId;
		setup.cardId = undefined;
		if (cardId) {
			setup.chat.completeInput(cardId, response);
		}
	}

	private _ready(setup: ISetup): void {
		this._logService.info(`[ComputerUse] Setup ${setup.id} is ready`);
		this._recordVerified(new Set());
		setup.state = 'ready';
		setup.sent = undefined;
		setup.error = undefined;
		this._finish(setup, ChatInputResponseKind.Accept);
	}

	private _end(setup: ISetup, error: IComputerUseErrorV1 | undefined, elicitation: 'decline' | 'cancel'): void {
		if (setup.state === 'ready' || setup.state === 'ended') {
			return;
		}
		this._logService.info(`[ComputerUse] Setup ${setup.id} ended (${error?.code ?? elicitation})`);
		const prompt = setup.prompt;
		setup.state = 'ended';
		setup.prompt = undefined;
		setup.sent = undefined;
		setup.error = error;
		this._finish(setup, elicitation === 'decline' ? ChatInputResponseKind.Decline : ChatInputResponseKind.Cancel);
		prompt?.result.complete({ action: elicitation });
	}

	private _finish(setup: ISetup, response: ChatInputResponseKind): void {
		if (this._working === setup) {
			this._working = undefined;
		}
		this._closeInput(setup, response);
		const finished = [...this._setups.values()].filter(candidate => candidate.state === 'ready' || candidate.state === 'ended');
		for (const stale of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_SETUPS))) {
			this._setups.delete(stale.id);
		}
		this._publish();
		this._drain();
	}

	private _recordVerified(missing: ReadonlySet<ComputerUsePermission>): void {
		for (const permission of computerUsePermissions) {
			this._permissions[permission] = missing.has(permission) ? 'notGranted' : 'granted';
		}
		this._verifiedAt = Date.now();
	}

	// #region Requests

	private _discardStaleRequest(): void {
		if (this._configurationService.getRootConfigValues?.()[COMPUTER_USE_REQUEST_KEY] !== undefined) {
			this._logService.info('[ComputerUse] Discarding a setup request written before setup was available');
			this._configurationService.updateRootConfig({ [COMPUTER_USE_REQUEST_KEY]: undefined });
		}
	}

	private _handleRequest(): void {
		const value = this._configurationService.getRootConfigValues?.()[COMPUTER_USE_REQUEST_KEY];
		if (value === undefined) {
			return;
		}
		const request = isComputerUseRequest(value) ? value : undefined;
		const isNew = !!request && !this._seenNonces.has(request.nonce);
		if (request) {
			this._seenNonces.add(request.nonce);
			if (this._seenNonces.size > MAX_REMEMBERED_NONCES) {
				const oldest = this._seenNonces.values().next().value;
				if (oldest !== undefined) {
					this._seenNonces.delete(oldest);
				}
			}
		}
		// Clearing re-enters this handler synchronously; the claim above makes that a no-op.
		this._configurationService.updateRootConfig({ [COMPUTER_USE_REQUEST_KEY]: undefined });
		if (!request) {
			this._logService.warn('[ComputerUse] Ignoring a malformed setup request');
			return;
		}
		if (isNew) {
			this._enqueue({ setupId: request.setupId, round: request.round, action: request.action, ...(request.permission ? { permission: request.permission } : {}) });
		}
	}

	private _enqueue(action: IQueuedAction): void {
		// Every action makes the plugin verify again, so an automatic check adds nothing to a setup with an action
		// waiting, and running one first would make the user's action stale.
		if (action.automatic && this._queue.some(queued => queued.setupId === action.setupId)) {
			return;
		}
		if (!action.automatic) {
			const waiting = this._queue.findIndex(queued => queued.setupId === action.setupId && queued.automatic);
			if (waiting !== -1) {
				this._queue.splice(waiting, 1);
			}
		}
		if (this._queue.length >= MAX_QUEUED_ACTIONS) {
			this._logService.warn(`[ComputerUse] Dropping a '${action.action}' request: too many requests are waiting`);
			return;
		}
		this._queue.push(action);
		this._drain();
	}

	/** Sends queued actions while none is in flight; one that no longer matches its setup's prompt is dropped. */
	private _drain(): void {
		while (!this._working && !this._store.isDisposed) {
			const next = this._queue.shift();
			if (!next) {
				return;
			}
			const setup = this._setups.get(next.setupId);
			const prompt = setup?.state === 'needsPermissions' && setup.round === next.round ? setup.prompt : undefined;
			const choice = prompt && isOffered(prompt.offered, next) ? choiceFor(next.action, next.permission) : undefined;
			if (!setup || !prompt || !choice) {
				this._logService.info(`[ComputerUse] Dropping a '${next.action}' request for an older or unavailable step`);
				// A client may have completed the request to send it; keep the prompt answerable.
				if (setup && !setup.cardId) {
					this._showInput(setup);
				}
				continue;
			}
			if (next.automatic && this._isAskingForAccessibility()) {
				this._logService.info(`[ComputerUse] Setup ${setup.id}: not checking again on its own while macOS asks for Accessibility`);
				continue;
			}
			this._logService.info(`[ComputerUse] Setup ${setup.id} round ${setup.round}: sending '${choice}'${next.automatic ? ' on its own' : ''}`);
			setup.prompt = undefined;
			setup.state = 'working';
			setup.sent = next.permission ? { action: next.action, permission: next.permission } : { action: next.action };
			setup.sentAutomatically = !!next.automatic;
			setup.error = undefined;
			this._working = setup;
			this._publish();
			prompt.result.complete({ action: 'accept', content: { [CHOICE_FIELD]: choice } });
		}
	}

	// #endregion

	private _publish(): void {
		if (this._store.isDisposed) {
			return;
		}
		const working = this._working;
		const status: IComputerUseStatusV1 = {
			schemaVersion: 1,
			permissions: computerUsePermissions.map(permission => ({ permission, state: this._permissions[permission] })),
			...(this._verifiedAt !== undefined ? { verifiedAt: this._verifiedAt } : {}),
			...(working?.sent ? { operation: { setupId: working.id, ...working.sent } } : {}),
			setups: [...this._setups.values()].map(setup => ({
				id: setup.id,
				chat: setup.chat.chatUri,
				state: setup.state,
				round: setup.round,
				actions: setup.state === 'needsPermissions' && setup.prompt ? offeredActions(setup.prompt.offered) : [],
				...(setup.error ? { error: setup.error } : {}),
			})),
			...(this._helperApp ? { helperApp: { path: this._helperApp.path, ...(this._helperAppIcon ? { icon: this._helperAppIcon } : {}) } } : {}),
		};
		this._configurationService.publishRootTransientValues?.({ [COMPUTER_USE_STATUS_KEY]: status });
	}
}
