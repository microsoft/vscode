/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableSignal } from '../../../../../base/common/observable.js';
import { ISessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ChatPermissionLevel, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IPermissionPickerDelegate } from '../../../../contrib/copilotChatSessions/browser/permissionPicker.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

/**
 * The well-known session-config property name for tool auto-approval. The
 * Agent Host Protocol's session-config schema is intentionally generic — only
 * this property *name* (and the enum values below) is a convention shared
 * across implementations that want to opt into VS Code's unified
 * permission-picker UI. Agents that don't advertise this exact shape fall
 * back to the generic per-property picker.
 */
export const AUTO_APPROVE_PROPERTY = 'autoApprove';

/**
 * The set of enum values the unified permission picker understands for the
 * `autoApprove` property. Mirrors `ChatPermissionLevel` in
 * `vs/workbench/contrib/chat/common/constants.ts`.
 *
 * `autopilot` is optional (an agent may choose not to advertise it).
 * `default` is required as the baseline level.
 */
const KNOWN_AUTO_APPROVE_VALUES: ReadonlySet<string> = new Set(['default', 'autoApprove', 'autopilot']);
const REQUIRED_AUTO_APPROVE_VALUE = 'default';

/**
 * Returns `true` when an `autoApprove` session-config property uses the
 * shape the unified permission picker expects: a string enum that is a
 * subset of `default | autoApprove | autopilot` and contains at least
 * `default`.
 *
 * Callers use this to decide whether to render the unified
 * {@link PermissionPicker} (with its built-in warning dialogs, autopilot
 * gating, and policy enforcement) or fall back to the generic per-property
 * picker.
 */
export function isWellKnownAutoApproveSchema(schema: ISessionConfigPropertySchema): boolean {
	if (schema.type !== 'string' || !Array.isArray(schema.enum) || schema.enum.length === 0) {
		return false;
	}
	if (!schema.enum.includes(REQUIRED_AUTO_APPROVE_VALUE)) {
		return false;
	}
	return schema.enum.every(value => KNOWN_AUTO_APPROVE_VALUES.has(value));
}

/**
 * {@link IPermissionPickerDelegate} backed by the active session's AHP
 * `autoApprove` config property.
 *
 * - `currentPermissionLevel` derives from the active session's
 *   `provider.getSessionConfig(...).values.autoApprove`, recomputed when the
 *   active session changes or when any agent-host provider fires
 *   `onDidChangeSessionConfig`.
 * - `setPermissionLevel(level)` calls `provider.setSessionConfigValue(sessionId,
 *   'autoApprove', level)` for the active session's provider.
 * - `isApplicable` is `true` only when the active session's `autoApprove`
 *   schema matches the well-known shape, so the picker hides itself for
 *   non-conforming agents (which fall back to the generic per-property
 *   picker) and when no agent-host session is active.
 */
export class AgentHostPermissionPickerDelegate extends Disposable implements IPermissionPickerDelegate {

	/** Fires every time any agent-host provider's session config changes. */
	private readonly _configChangedSignal = observableSignal('agentHostPermissionPicker.configChanged');
	private readonly _providerSubscriptions = this._register(new DisposableMap<string>());

	readonly currentPermissionLevel: IObservable<ChatPermissionLevel>;
	readonly isApplicable: IObservable<boolean>;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._watchProviders(this._sessionsProvidersService.getProviders());
		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.removed) {
				this._providerSubscriptions.deleteAndDispose(provider.id);
			}
			this._watchProviders(e.added);
			this._configChangedSignal.trigger(undefined);
		}));

		this.currentPermissionLevel = derived(this, reader => this._readLevel(reader));
		this.isApplicable = derived(this, reader => this._readIsWellKnown(reader));
	}

	setPermissionLevel(level: ChatPermissionLevel): void {
		const session = this._sessionsManagementService.activeSession.get();
		if (!session) {
			return;
		}
		const provider = this._getProvider(session.providerId);
		if (!provider) {
			return;
		}
		provider.setSessionConfigValue(session.sessionId, AUTO_APPROVE_PROPERTY, level)
			.catch(() => { /* best-effort */ });
	}

	private _readLevel(reader: IReader): ChatPermissionLevel {
		this._configChangedSignal.read(reader);
		const session = this._sessionsManagementService.activeSession.read(reader);
		if (!session) {
			return ChatPermissionLevel.Default;
		}
		const provider = this._getProvider(session.providerId);
		if (!provider) {
			return ChatPermissionLevel.Default;
		}
		const value = provider.getSessionConfig(session.sessionId)?.values[AUTO_APPROVE_PROPERTY];
		return isChatPermissionLevel(value) ? value : ChatPermissionLevel.Default;
	}

	private _readIsWellKnown(reader: IReader): boolean {
		this._configChangedSignal.read(reader);
		const session = this._sessionsManagementService.activeSession.read(reader);
		if (!session) {
			return false;
		}
		const provider = this._getProvider(session.providerId);
		if (!provider) {
			return false;
		}
		const schema = provider.getSessionConfig(session.sessionId)?.schema.properties[AUTO_APPROVE_PROPERTY];
		return !!schema && isWellKnownAutoApproveSchema(schema);
	}

	private _getProvider(providerId: string): IAgentHostSessionsProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		return provider && isAgentHostProvider(provider) ? provider : undefined;
	}

	private _watchProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			if (!isAgentHostProvider(provider) || this._providerSubscriptions.has(provider.id)) {
				continue;
			}
			this._providerSubscriptions.set(provider.id, provider.onDidChangeSessionConfig(() => {
				this._configChangedSignal.trigger(undefined);
			}));
		}
	}
}
