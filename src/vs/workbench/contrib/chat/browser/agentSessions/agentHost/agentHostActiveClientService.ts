/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, Delayer } from '../../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { hash } from '../../../../../../base/common/hash.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { equals } from '../../../../../../base/common/objects.js';
import { autorun, derived, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { type IExtUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { AgentCustomization, SessionActiveClient, ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService, IToolData, IToolSet } from '../../../common/tools/languageModelToolsService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { AgentCustomizationSyncProvider } from './agentCustomizationSyncProvider.js';
import { type ILocalCustomizationSyncOptions, resolveCustomizationRefs, resolveLocalCustomAgents } from './agentHostLocalCustomizations.js';
import { toolDataToDefinition } from './agentHostToolUtils.js';
import { IAgentHostToolSetEnablementService, isToolEnabledInSet } from './agentHostToolSetEnablementService.js';
import { type ISyncedCustomizationOrigin, SyncedCustomizationBundler } from './syncedCustomizationBundler.js';

export const IAgentHostActiveClientService = createDecorator<IAgentHostActiveClientService>('agentHostActiveClientService');

/** Identity a published customization set is resolved against. Refcounted; disposed by each holder. */
export interface IAgentCustomizationScope extends IDisposable {
	readonly customizations: IObservable<readonly ClientPluginCustomization[]>;
	readonly customAgents: IObservable<readonly AgentCustomization[]>;
	/** Tools available to this scope's active client. */
	readonly tools: IObservable<readonly ToolDefinition[]>;
	/** Composed active-client view for this scope. */
	activeClient(clientId: string): IObservable<SessionActiveClient>;
	/**
	 * `false` until the initial customization resolution completes. Publishing an
	 * unresolved scope would transiently wipe the host's customization state.
	 */
	readonly isResolved: IObservable<boolean>;
	/** Resolves once the scope's initial customization resolution has completed. */
	whenResolved(): Promise<void>;
}

/** Registration-level customization state for an agent harness. */
export interface IAgentRegistration extends IDisposable {
	readonly syncProvider: ICustomizationSyncProvider;
	/** Acquires (or shares) the scope for `roots`. Refcounted: torn down when the last holder disposes. */
	acquireScope(roots: readonly URI[]): IAgentCustomizationScope;
	/** Recovers provenance for a synced URI produced by any scope of this agent. */
	getOrigin(syncedUri: URI): ISyncedCustomizationOrigin | undefined;
	isBundledMcpServer(pluginUri: string, serverName: string): boolean;
}

export type IAgentRegistrationOptions = ILocalCustomizationSyncOptions;

export interface IAgentHostActiveClientService {
	readonly _serviceBrand: undefined;

	/** Registers an agent harness and its registration-level customization sync provider. */
	registerForAgent(sessionType: string, options?: IAgentRegistrationOptions): IAgentRegistration;

	/** Acquires a customization scope for a registered agent. Returns `undefined` when `sessionType` has no registration. */
	acquireScope(sessionType: string, roots: readonly URI[]): IAgentCustomizationScope | undefined;
	areScopeRootsEqual(first: readonly URI[] | undefined, second: readonly URI[]): boolean;
	isBundledMcpServer(pluginUri: string, serverName: string): boolean;
}

class AgentRegistration extends Disposable implements IAgentRegistration {

	readonly syncProvider: ICustomizationSyncProvider;

	private readonly _scopes = new Map<string, AgentCustomizationScope>();
	private _isDisposed = false;

	constructor(
		private readonly _sessionType: string,
		private readonly _options: IAgentRegistrationOptions | undefined,
		private readonly _instantiationService: IInstantiationService,
		storageService: IStorageService,
		private readonly _extUri: IExtUri,
		private readonly _getClientTools: (sessionType: string) => IObservable<readonly ToolDefinition[]>,
		private readonly _onDispose: () => void,
	) {
		super();
		this.syncProvider = this._register(new AgentCustomizationSyncProvider(_sessionType, storageService));
	}

	acquireScope(roots: readonly URI[]): IAgentCustomizationScope {
		const normalizedRoots = normalizeRoots(roots, this._extUri);
		const scopeKey = getScopeKey(normalizedRoots, this._extUri);
		let scope = this._scopes.get(scopeKey);
		if (!scope) {
			// Referenced by the teardown callback below, which only runs once the
			// scope has been constructed.
			const createdScope: AgentCustomizationScope = this._instantiationService.createInstance(
				AgentCustomizationScope,
				this._sessionType,
				normalizedRoots,
				scopeKey,
				this.syncProvider,
				this._options,
				this._getClientTools,
				() => this._removeScope(scopeKey, createdScope),
			);
			scope = createdScope;
			this._scopes.set(scopeKey, scope);
		}
		return scope.acquire();
	}

	getOrigin(syncedUri: URI): ISyncedCustomizationOrigin | undefined {
		for (const scope of this._scopes.values()) {
			const origin = scope.getOrigin(syncedUri);
			if (origin) {
				return origin;
			}
		}
		return undefined;
	}

	isBundledMcpServer(pluginUri: string, serverName: string): boolean {
		return [...this._scopes.values()].some(scope => scope.isBundledMcpServer(pluginUri, serverName));
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		const scopes = [...this._scopes.values()];
		this._scopes.clear();
		for (const scope of scopes) {
			scope.dispose();
		}
		super.dispose();
		this._onDispose();
	}

	private _removeScope(scopeKey: string, scope: AgentCustomizationScope): void {
		if (this._scopes.get(scopeKey) === scope) {
			this._scopes.delete(scopeKey);
		}
	}
}

/** Owns the customization bundle and resolution lifecycle for one working-directory scope. */
class AgentCustomizationScope extends Disposable {

	private readonly _bundler: SyncedCustomizationBundler;
	private readonly _updateDelayer: Delayer<void>;
	private readonly _customizations = observableValue<readonly ClientPluginCustomization[]>('agentCustomizations', []);
	private readonly _customAgents = observableValue<readonly AgentCustomization[]>('agentCustomAgents', []);
	private readonly _isResolved = observableValue('agentCustomizationsResolved', false);
	private readonly _initialResolution = new DeferredPromise<void>();
	private readonly _activeClients = new Map<string, IObservable<SessionActiveClient>>();
	private _refCount = 0;
	private _updateSeq = 0;
	private _isDisposed = false;

	get customizations(): IObservable<readonly ClientPluginCustomization[]> {
		return this._customizations;
	}

	get customAgents(): IObservable<readonly AgentCustomization[]> {
		return this._customAgents;
	}

	get tools(): IObservable<readonly ToolDefinition[]> {
		return this._getClientTools(this._sessionType);
	}

	get isResolved(): IObservable<boolean> {
		return this._isResolved;
	}

	constructor(
		private readonly _sessionType: string,
		private readonly _roots: readonly URI[],
		scopeKey: string,
		private readonly _syncProvider: ICustomizationSyncProvider,
		private readonly _options: IAgentRegistrationOptions | undefined,
		private readonly _getClientTools: (sessionType: string) => IObservable<readonly ToolDefinition[]>,
		private readonly _onDispose: () => void,
		@IFileService private readonly _fileService: IFileService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
	) {
		super();
		this._bundler = this._register(instantiationService.createInstance(SyncedCustomizationBundler, createScopeAuthority(_sessionType, scopeKey)));
		this._updateDelayer = this._register(new Delayer<void>(CUSTOMIZATION_UPDATE_DEBOUNCE_DELAY));

		const updateCustomizations = async () => {
			const seq = ++this._updateSeq;
			let completedInitialResolution = false;
			try {
				const [refs, agents] = await Promise.all([
					resolveCustomizationRefs(
						this._fileService,
						this._promptsService,
						this._syncProvider,
						this._agentPluginService,
						this._mcpService,
						this._configurationResolverService,
						this._bundler,
						this._sessionType,
						this._options,
						this._roots,
					),
					resolveLocalCustomAgents(this._fileService, this._promptsService, this._syncProvider, this._agentPluginService, this._sessionType, this._options),
				]);
				if (seq !== this._updateSeq) {
					return;
				}
				transaction(tx => {
					if (!equals(this._customizations.get(), refs)) {
						this._customizations.set(refs, tx);
					}
					if (!equals(this._customAgents.get(), agents)) {
						this._customAgents.set(agents, tx);
					}
					this._isResolved.set(true, tx);
				});
				completedInitialResolution = true;
			} catch (err) {
				onUnexpectedError(err);
				if (seq === this._updateSeq) {
					transaction(tx => this._isResolved.set(true, tx));
					completedInitialResolution = true;
				}
			} finally {
				if (completedInitialResolution && !this._initialResolution.isSettled) {
					this._initialResolution.complete();
				}
			}
		};
		const scheduleUpdate = () => {
			this._updateDelayer.trigger(() => updateCustomizations()).catch(() => { /* delayer disposed */ });
		};

		this._register(this._syncProvider.onDidChange(() => scheduleUpdate()));
		this._register(Event.any(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
		)(() => scheduleUpdate()));
		this._register(autorun(reader => {
			for (const plugin of this._agentPluginService.plugins.read(reader)) {
				plugin.enablement.read(reader);
				plugin.hooks.read(reader);
				plugin.commands.read(reader);
				plugin.skills.read(reader);
				plugin.agents.read(reader);
				plugin.instructions.read(reader);
				plugin.mcpServerDefinitions.read(reader);
			}
			scheduleUpdate();
		}));
		this._register(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				server.enablement.read(reader);
				server.readDefinitions().read(reader);
			}
			scheduleUpdate();
		}));
	}

	acquire(): IAgentCustomizationScope {
		this._refCount++;
		let released = false;
		return {
			customizations: this.customizations,
			customAgents: this.customAgents,
			tools: this.tools,
			isResolved: this.isResolved,
			whenResolved: () => this._initialResolution.p,
			activeClient: clientId => this.activeClient(clientId),
			dispose: () => {
				if (!released) {
					released = true;
					this._release();
				}
			},
		};
	}

	getOrigin(syncedUri: URI): ISyncedCustomizationOrigin | undefined {
		return this._bundler.getOrigin(syncedUri);
	}

	isBundledMcpServer(pluginUri: string, serverName: string): boolean {
		return this._bundler.isBundledMcpServer(pluginUri, serverName);
	}

	activeClient(clientId: string): IObservable<SessionActiveClient> {
		let activeClient = this._activeClients.get(clientId);
		if (!activeClient) {
			activeClient = derived(reader => {
				// Keep changes to the complete scope picture in the composed view's
				// dependency set so consumers can coalesce a customization burst.
				this._customAgents.read(reader);
				return {
					clientId,
					tools: [...this.tools.read(reader)],
					customizations: [...this._customizations.read(reader)],
				};
			});
			this._activeClients.set(clientId, activeClient);
		}
		return activeClient;
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._updateSeq++;
		if (!this._initialResolution.isSettled) {
			this._initialResolution.complete();
		}
		super.dispose();
		this._onDispose();
	}

	private _release(): void {
		if (--this._refCount === 0) {
			this.dispose();
		}
	}
}

export class AgentHostActiveClientService extends Disposable implements IAgentHostActiveClientService {
	declare readonly _serviceBrand: undefined;

	private readonly _allToolsObs: IObservable<readonly IToolData[]>;
	private readonly _allToolSetsObs: IObservable<Iterable<IToolSet>>;
	private readonly _clientToolsByType = new Map<string, IObservable<readonly ToolDefinition[]>>();
	private readonly _registrationsByType = new Map<string, AgentRegistration>();
	private _isDisposed = false;

	constructor(
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostToolSetEnablementService private readonly _toolSetEnablementService: IAgentHostToolSetEnablementService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
		this._allToolsObs = this._toolsService.observeTools(undefined);
		this._allToolSetsObs = this._toolsService.toolSets;
	}

	registerForAgent(sessionType: string, options?: IAgentRegistrationOptions): IAgentRegistration {
		// Referenced by the teardown callback below, which only runs once the
		// registration has been constructed.
		const registration: AgentRegistration = new AgentRegistration(
			sessionType,
			options,
			this._instantiationService,
			this._storageService,
			this._uriIdentityService.extUri,
			type => this._getClientTools(type),
			() => {
				if (this._registrationsByType.get(sessionType) === registration) {
					this._registrationsByType.delete(sessionType);
				}
			},
		);
		this._registrationsByType.set(sessionType, registration);
		return registration;
	}

	acquireScope(sessionType: string, roots: readonly URI[]): IAgentCustomizationScope | undefined {
		return this._registrationsByType.get(sessionType)?.acquireScope(roots);
	}

	areScopeRootsEqual(first: readonly URI[] | undefined, second: readonly URI[]): boolean {
		return areCustomizationScopeRootsEqual(first, second, this._uriIdentityService.extUri);
	}

	isBundledMcpServer(pluginUri: string, serverName: string): boolean {
		return [...this._registrationsByType.values()].some(registration => registration.isBundledMcpServer(pluginUri, serverName));
	}

	private _getClientTools(sessionType: string): IObservable<readonly ToolDefinition[]> {
		let obs = this._clientToolsByType.get(sessionType);
		if (!obs) {
			obs = derived(reader => {
				const tools = this._allToolsObs.read(reader);
				const toolSets = this._allToolSetsObs.read(reader);
				const enablement = this._toolSetEnablementService.observe(sessionType).read(reader);
				const enabledToolIds = new Set<string>();
				for (const ts of toolSets) {
					if (ts.deprecated) {
						continue;
					}
					for (const tool of ts.getTools(reader)) {
						if (isToolEnabledInSet(enablement, ts.id, tool.id)) {
							enabledToolIds.add(tool.id);
						}
					}
				}
				return tools.filter(t => enabledToolIds.has(t.id)).map(toolDataToDefinition);
			});
			this._clientToolsByType.set(sessionType, obs);
		}
		return obs;
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		const registrations = [...this._registrationsByType.values()];
		this._registrationsByType.clear();
		for (const registration of registrations) {
			registration.dispose();
		}
		super.dispose();
	}
}

function normalizeRoots(roots: readonly URI[], extUri: IExtUri): readonly URI[] {
	const rootsByUri = new ResourceMap<URI>(root => extUri.getComparisonKey(root));
	for (const root of roots) {
		rootsByUri.set(root, root);
	}
	// Ordinal (not locale) ordering: this order feeds `getScopeKey`, whose hash
	// becomes an on-disk plugin cache directory name on the agent host side.
	return [...rootsByUri.values()].sort((a, b) => {
		const left = extUri.getComparisonKey(a);
		const right = extUri.getComparisonKey(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
}

/** Returns whether two working-directory sets describe the same customization scope. */
export function areCustomizationScopeRootsEqual(first: readonly URI[] | undefined, second: readonly URI[], extUri: IExtUri): boolean {
	const toComparisonKey = (root: URI) => extUri.getComparisonKey(root);
	const firstRoots = new ResourceSet(first ?? [], toComparisonKey);
	const secondRoots = new ResourceSet(second, toComparisonKey);
	return firstRoots.size === secondRoots.size && [...firstRoots].every(root => secondRoots.has(root));
}

function getScopeKey(roots: readonly URI[], extUri: IExtUri): string {
	return roots.map(root => extUri.getComparisonKey(root)).join('\n');
}

function createScopeAuthority(sessionType: string, scopeKey: string): string {
	return `${sessionType}-${hash(scopeKey)}`;
}

/** Debounce window (ms) used to coalesce bursts of customization change events into a single re-resolution. */
const CUSTOMIZATION_UPDATE_DEBOUNCE_DELAY = 50;

registerSingleton(IAgentHostActiveClientService, AgentHostActiveClientService, InstantiationType.Delayed);
