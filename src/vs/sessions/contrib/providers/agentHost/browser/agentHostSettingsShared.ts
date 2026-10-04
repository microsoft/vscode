/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import {
	AbstractAgentHostConfigFileSystemProvider,
	AbstractAgentHostConfigSchemaRegistrar,
} from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostConfigEditor.js';

// Re-export the target-neutral primitives so existing sessions-module
// consumers/tests can keep importing them from this module.
export {
	buildAgentHostConfigJsonSchema,
	convertPropertySchema,
	serializeAgentHostConfigDocument,
} from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostConfigEditor.js';
export type {
	AgentHostConfigPropertyFilter,
	IAgentHostConfigLike,
	IAgentHostSettingsLocale,
} from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostConfigEditor.js';


// ============================================================================
// Sessions-specific glue over the target-neutral Agent Host config editor
// infrastructure (`vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostConfigEditor.ts`).
//
// Both the per-session (`agent-session-settings://...`) and the per-host
// (`agent-host-settings://...`) synthetic settings editors in the sessions
// (agent) window are keyed by an `ISessionsProvidersService`-resolved
// `IAgentHostSessionsProvider`, and support multiple concurrent providers
// (local + remote). This module supplies that provider lookup, discovery,
// and lifecycle on top of the shared, target-neutral base classes.
// ============================================================================

/**
 * Base context shared by all sessions-window settings filesystem providers.
 * Subclasses extend with any additional state they need (e.g. a sessionId).
 */
export interface IAgentHostSettingsContext {
	readonly providerId: string;
}

/**
 * Abstract filesystem provider backing the sessions-window's synthetic
 * agent-host settings JSONC editors. Resolves the {@link IAgentHostSessionsProvider}
 * target from `ctx.providerId` via {@link ISessionsProvidersService}; subclasses
 * still supply scheme-specific URI parsing, config-fetching, and change/replace
 * hooks (see {@link AbstractAgentHostConfigFileSystemProvider}).
 */
export abstract class AbstractSessionsAgentHostConfigFileSystemProvider<TContext extends IAgentHostSettingsContext> extends AbstractAgentHostConfigFileSystemProvider<TContext, IAgentHostSessionsProvider> {

	constructor(
		@ISessionsProvidersService protected readonly _sessionsProvidersService: ISessionsProvidersService,
		@ILogService logService: ILogService,
	) {
		super(logService);
	}

	protected _resolveTarget(ctx: TContext): IAgentHostSessionsProvider | undefined {
		return this._lookupProvider(ctx.providerId);
	}

	protected override _missingTargetError(ctx: TContext): Error {
		return createFileSystemProviderError(`Unknown agent host provider: ${ctx.providerId}`, FileSystemProviderErrorCode.FileNotFound);
	}

	protected _lookupProvider(providerId: string): IAgentHostSessionsProvider | undefined {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		return provider;
	}
}

/**
 * Abstract base for the sessions-window schema registrars. Adds discovery
 * and lifecycle tracking of every registered {@link IAgentHostSessionsProvider}
 * (local + remote) on top of the shared, target-neutral
 * {@link AbstractAgentHostConfigSchemaRegistrar}, which only knows how to
 * register/refresh/dispose a schema for a single target once told to.
 */
export abstract class AbstractMultiProviderAgentHostConfigSchemaRegistrar<TTarget> extends AbstractAgentHostConfigSchemaRegistrar<TTarget> {

	/** Per-provider subscriptions. */
	private readonly _providerSubscriptions = this._register(new DisposableMap<string /* providerId */>());

	constructor(
		@ISessionsProvidersService protected readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		for (const provider of this._sessionsProvidersService.getProviders()) {
			this._onProviderAdded(provider);
		}
		this._register(this._sessionsProvidersService.onDidChangeProviders(e => {
			for (const provider of e.added) {
				this._onProviderAdded(provider);
			}
			for (const provider of e.removed) {
				this._providerSubscriptions.deleteAndDispose(provider.id);
			}
		}));
	}

	// ---- Subclass hooks -----------------------------------------------------

	/** Enumerate the targets currently tracked on a provider (used for cleanup). */
	protected abstract _targetsForProvider(provider: IAgentHostSessionsProvider): readonly TTarget[];

	/**
	 * Subscribe to change signals from {@link provider}. The subclass should
	 * invoke {@link onChanged} when a tracked target's config changes and
	 * {@link onRemoved} when a tracked target disappears.
	 */
	protected abstract _observeProvider(
		provider: IAgentHostSessionsProvider,
		onChanged: (target: TTarget) => void,
		onRemoved: (target: TTarget) => void,
	): IDisposable;

	// ---- Internal -----------------------------------------------------------

	private _onProviderAdded(provider: ISessionsProvider): void {
		if (!isAgentHostProvider(provider)) {
			return;
		}
		const store = new DisposableStore();

		store.add(this._observeProvider(
			provider,
			target => {
				// Only refresh if we already have a registration; otherwise the
				// next `readFile` will pick up the latest schema on demand.
				if (!this._isRegistered(target)) {
					return;
				}
				this._refreshSchema(target);
			},
			target => this._disposeSchemaForTarget(target),
		));

		// On provider disposal, drop all schemas registered for this provider.
		store.add(toDisposable(() => {
			for (const target of this._targetsForProvider(provider)) {
				this._disposeSchemaForTarget(target);
			}
		}));

		this._providerSubscriptions.set(provider.id, store);
	}
}
