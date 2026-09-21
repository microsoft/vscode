/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../../base/common/equals.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, ITransaction, observableValue, runOnChange, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { NativeCliActivity } from '../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatInteractivity, IChat, ISession, ISessionCapabilities, ISessionChangesSummary, SessionStatus, toSessionId } from '../../../../services/sessions/common/session.js';
import { ISessionTerminal, ISessionTerminalService } from '../../../../services/terminal/browser/sessionTerminalService.js';
import { NativeCliSessionChanges } from '../browser/nativeCliSessionChanges.js';
import { getNativeCliDefinition, IStoredNativeCliSession, NATIVE_CLI_PROVIDER_ID, NATIVE_CLI_SESSION_SCHEME, resolveNativeCliWorkspace } from '../common/nativeCli.js';
import type { NativeCliSessionRuntime } from './nativeCliSessionRuntime.js';

export class NativeCliSession extends Disposable implements ISession, ISessionTerminal {
	readonly id = this._data.id;
	readonly kind = this._data.kind;
	readonly folder = URI.parse(this._data.folder);
	readonly providerId = NATIVE_CLI_PROVIDER_ID;
	readonly presentation = 'terminal';
	readonly presentationLabel = getNativeCliDefinition(this.kind).sessionType.label;
	readonly icon = getNativeCliDefinition(this.kind).sessionType.icon;
	readonly sessionType = getNativeCliDefinition(this.kind).sessionType.id;
	readonly resource = URI.from({ scheme: NATIVE_CLI_SESSION_SCHEME, path: `/${this.id}` });
	readonly sessionId = toSessionId(this.providerId, this.resource);
	readonly nativeSessionId = observableValue(this, this._data.nativeSessionId);
	readonly resourceAliases = derived(this, reader => {
		const id = this.nativeSessionId.read(reader) ?? (this.kind !== 'codex' ? this.id : undefined);
		if (!id) {
			return [];
		}
		const schemes = this.kind === 'copilot' ? [SessionType.CopilotCLI, SessionType.AgentHostCopilot]
			: this.kind === 'claude' ? [SessionType.AgentHostClaude] : [SessionType.AgentHostCodex];
		return schemes.map(scheme => URI.from({ scheme, path: `/${id}` }));
	});
	readonly createdAt = new Date(this._data.createdAt);
	readonly title = observableValue(this, this._data.title);
	readonly updatedAt = observableValue(this, new Date(this._data.updatedAt));
	readonly status = observableValue(this, this._data.hasStarted ? SessionStatus.Completed : SessionStatus.Untitled);
	readonly isArchived = observableValue(this, this._data.isArchived);
	readonly isRead = observableValue(this, this._data.isRead);
	private readonly _runtime = observableValue<NativeCliSessionRuntime | undefined>(this, undefined);
	readonly instance = derived(this, reader => this._runtime.read(reader)?.instance.read(reader));
	readonly isRunning = derived(this, reader => this._runtime.read(reader)?.isRunning.read(reader) ?? false);
	readonly isStarting = derived(this, reader => this._runtime.read(reader)?.isStarting.read(reader) ?? false);
	readonly isInitializing = derived(this, reader => this._runtime.read(reader)?.isInitializing.read(reader) ?? false);
	readonly error = derived(this, reader => this._runtime.read(reader)?.error.read(reader));
	readonly warning = derived(this, reader => this._runtime.read(reader)?.warning.read(reader));
	/** Title of the conversation the shared CLI process currently shows instead of this one, and whether a switch to this one is underway. */
	readonly displaysOtherSession = derived(this, reader => {
		const runtime = this._runtime.read(reader);
		const foreground = runtime?.foregroundSession.read(reader);
		if (!runtime?.isRunning.read(reader) || !foreground || foreground === this) {
			return undefined;
		}
		return { title: foreground.title.read(reader), switching: runtime.pendingConversation.read(reader) === this };
	});
	readonly isNewSessionRequestInProgress = this.isStarting;
	readonly loading = this.isStarting;
	readonly modelId = constObservable(undefined);
	readonly mode = constObservable(undefined);
	readonly lastTurnEnd = observableValue<Date | undefined>(this, undefined);
	readonly capabilities = constObservable<ISessionCapabilities>({ supportsMultipleChats: false, supportsRename: true, supportsDelete: true });
	readonly description = derived<IMarkdownString | undefined>(this, reader => {
		const error = this.error.read(reader) ?? this._changes.error.read(reader);
		return error ? { value: error } : undefined;
	});
	readonly workspace;
	readonly changes;
	readonly changesSummary;
	readonly changesets;
	readonly hasGitRepository;
	readonly chats;
	readonly mainChat;

	private readonly _changes: NativeCliSessionChanges;
	private _hasStarted = this._data.hasStarted;
	private _pendingActivity: NativeCliActivity = 'idle';
	private _titleIsUserDefined = this._data.titleIsUserDefined;
	private _hasPromptTitle = this._data.hasPromptTitle ?? this._data.titleIsUserDefined;
	readonly hasInteraction = observableValue(this, this._data.hasInteraction ?? this._data.hasStarted);
	private _authentication = this._data.authentication;
	private _copilotModel = this._data.copilotModel;
	readonly restoreRuntimeResource = this._data.runtimeResource;
	lifecycleTimestamp = this._data.lifecycleTimestamp ?? 0;

	constructor(
		private readonly _data: IStoredNativeCliSession,
		private readonly _onChange: () => void,
		private readonly _createRuntime: (session: NativeCliSession) => NativeCliSessionRuntime,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionTerminalService sessionTerminalService: ISessionTerminalService,
	) {
		super();
		const workspace = resolveNativeCliWorkspace(this.folder);
		if (!workspace) {
			throw new Error('Native CLI sessions require a local folder');
		}
		this._changes = this._register(instantiationService.createInstance(NativeCliSessionChanges, workspace, _data.baseRef));
		this.workspace = this._changes.workspace;
		this.changes = this._changes.changes;
		this.changesets = this._changes.changesets;
		this.hasGitRepository = this._changes.hasGitRepository;
		this.changesSummary = derivedOpts<ISessionChangesSummary | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
			if (!this._changes.hasResolved.read(reader)) {
				return _data.changesSummary;
			}
			const changes = this.changes.read(reader);
			return { files: changes.length, additions: changes.reduce((total, change) => total + change.insertions, 0), deletions: changes.reduce((total, change) => total + change.deletions, 0) };
		});
		const chat: IChat = {
			resource: this.resource, createdAt: this.createdAt, title: this.title, updatedAt: this.updatedAt,
			status: this.status, changes: this.changes, checkpoints: constObservable(undefined),
			modelId: this.modelId, modelSource: constObservable(undefined), mode: this.mode,
			isArchived: this.isArchived, isRead: this.isRead,
			interactivity: derived(this, reader => this.isArchived.read(reader) ? ChatInteractivity.ReadOnly : ChatInteractivity.Full),
			description: this.description, lastTurnEnd: this.lastTurnEnd, capabilities: constObservable({ canRename: true, canDelete: false }),
		};
		this.mainChat = constObservable(chat);
		this.chats = constObservable([chat]);
		this._register(sessionTerminalService.registerSessionTerminal(this.sessionId, this));
		this._register(runOnChange(this._changes.baseRef, () => this.changed()));
		this._register(runOnChange(this.changesSummary, () => this.changed()));
	}

	/** Pure read; use {@link ensureAuthentication} to materialize the runtime on demand. */
	get authentication(): NativeCliSessionRuntime['authentication'] {
		return this._runtime.get()?.authentication;
	}

	/**
	 * Returns the account configuration, creating the runtime on first use. Creating a
	 * runtime writes an observable, so this must never be called from a `derived` compute.
	 */
	ensureAuthentication(): NativeCliSessionRuntime['authentication'] {
		return this._getRuntime().authentication;
	}

	get runtime(): NativeCliSessionRuntime | undefined {
		return this._runtime.get();
	}

	get hasStarted(): boolean {
		return this._hasStarted;
	}

	changed(): void {
		this._onChange();
	}

	markOpened(tx?: ITransaction): void {
		this._hasStarted = true;
		if (this.status.get() === SessionStatus.Untitled) {
			this.setActivity(this._pendingActivity, tx);
		}
		this.changed();
	}

	initializeChanges(): Promise<void> {
		return this._changes.initialize();
	}

	refreshChanges(): Promise<void> {
		return this._changes.refresh();
	}

	prepareStart(query?: string): Promise<void> {
		const runtime = this._getRuntime();
		if (runtime.session === this) {
			return runtime.start(query);
		}
		if (runtime.isRunning.get() || runtime.isStarting.get() || runtime.isReconnecting) {
			// The conversation lives in a process already showing another one; ask that CLI to show it.
			return runtime.showConversation(this);
		}
		// A stopped shared process leaves this conversation to launch its own CLI.
		this._runtime.set(undefined, undefined);
		return this._getRuntime().start(query);
	}

	async start(query?: string): Promise<void> {
		await this.prepareStart(query);
		if (this._store.isDisposed || !this.isRunning.get()) {
			throw new CancellationError();
		}
		this.markOpened();
	}

	reconnect(): Promise<boolean> {
		if (this.restoreRuntimeResource === null) {
			return Promise.resolve(false);
		}
		return this._getRuntime().reconnect();
	}

	/** Whether this conversation is one of several open in the runtime's process rather than the one it shows. */
	get isBackground(): boolean {
		const runtime = this._runtime.get();
		return !!runtime && runtime.session !== this;
	}

	private _getRuntime(): NativeCliSessionRuntime {
		let runtime = this._runtime.get();
		if (!runtime) {
			runtime = this._createRuntime(this);
			this._runtime.set(runtime, undefined);
		}
		return runtime;
	}

	detachRuntime(tx: ITransaction | undefined): void {
		const runtime = this._runtime.get();
		if (runtime) {
			this._authentication = runtime.authentication?.source.get();
			this._copilotModel = runtime.authentication?.model.get();
			this._runtime.set(undefined, tx);
			this.setActivity('idle', tx);
		}
	}

	attachRuntime(runtime: NativeCliSessionRuntime, tx: ITransaction | undefined): void {
		this._runtime.set(runtime, tx);
		this.markOpened(tx);
	}

	setActivity(activity: NativeCliActivity, tx?: ITransaction): void {
		if (!this.hasStarted) {
			this._pendingActivity = activity;
			return;
		}
		const status = activity === 'working' ? SessionStatus.InProgress : activity === 'input' ? SessionStatus.NeedsInput : activity === 'error' ? SessionStatus.Error : SessionStatus.Completed;
		if (this.status.get() === status) {
			return;
		}
		const wasWorking = this.status.get() === SessionStatus.InProgress || this.status.get() === SessionStatus.NeedsInput;
		const apply = (tx: ITransaction) => {
			this.status.set(status, tx);
			this.updatedAt.set(new Date(), tx);
			if (wasWorking && activity === 'idle') {
				this.lastTurnEnd.set(new Date(), tx);
			}
		};
		if (tx) {
			apply(tx);
		} else {
			transaction(apply);
		}
		this.changed();
	}

	acceptTerminalTitle(title: string): void {
		if (this.kind !== 'claude') {
			return;
		}
		const value = title.trim().replace(/^[\u2733\u273b\u273d\u25d0\u25d1\u2800-\u28ff]\s+/u, '');
		if (!value || /^(?:GitHub Copilot|Copilot|Claude Code|Claude|Codex)(?:\s+v?\d.*)?$/i.test(value) || this._titleIsUserDefined) {
			return;
		}
		// The stripped glyph animates, so the raw title changes on every spinner frame
		// while this value stays the same; persisting each one rebuilds the whole list.
		const next = value.slice(0, 160);
		if (this.title.get() === next) {
			return;
		}
		this.title.set(next, undefined);
		this._hasPromptTitle = true;
		this.changed();
	}

	acceptCliTitle(title: string): void {
		if (!this._titleIsUserDefined && title.trim() && this.title.get() !== title.trim()) {
			this.title.set(title.trim().slice(0, 160), undefined);
			this._hasPromptTitle = true;
			this.changed();
		}
	}

	acceptPromptTitle(title: string | undefined): void {
		this.hasInteraction.set(true, undefined);
		if (title && !this._titleIsUserDefined && !this._hasPromptTitle) {
			this.title.set(title, undefined);
			this._hasPromptTitle = true;
			this.changed();
		}
	}

	rename(title: string): void {
		this._titleIsUserDefined = true;
		this.title.set(title, undefined);
		this.updatedAt.set(new Date(), undefined);
		this.changed();
	}

	setArchived(archived: boolean): void {
		this.isArchived.set(archived, undefined);
		if (archived) {
			this.stop();
		}
		this.changed();
	}

	stop(): void {
		const runtime = this._runtime.get();
		if (runtime && runtime.session !== this) {
			// Stopping a background conversation must not kill the process showing another one.
			this.detachRuntime(undefined);
			this.changed();
			return;
		}
		runtime?.stop();
	}

	serialize(): IStoredNativeCliSession {
		const runtime = this._runtime.get();
		const authentication = runtime?.authentication?.source.get() ?? this._authentication;
		return {
			...this._data, title: this.title.get(), updatedAt: this.updatedAt.get().getTime(),
			isArchived: this.isArchived.get(), isRead: this.isRead.get(), hasStarted: this._hasStarted,
			titleIsUserDefined: this._titleIsUserDefined, hasPromptTitle: this._hasPromptTitle,
			hasInteraction: this.hasInteraction.get(),
			nativeSessionId: this.nativeSessionId.get(), baseRef: this._changes.baseRef.get(), changesSummary: this.changesSummary.get(),
			authentication, copilotModel: authentication === 'copilot' ? runtime?.authentication?.model.get() ?? this._copilotModel : undefined,
			runtimeResource: runtime?.instance.get() ? runtime.resource.toString() : this._hasStarted ? null : undefined,
			lifecycleTimestamp: this.lifecycleTimestamp,
			copilotForegroundTimestamp: runtime?.copilotForegroundTimestamp ?? this._data.copilotForegroundTimestamp,
		};
	}
}
