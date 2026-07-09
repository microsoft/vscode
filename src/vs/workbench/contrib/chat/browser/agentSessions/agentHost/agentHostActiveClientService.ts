/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { equals } from '../../../../../../base/common/objects.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import type { SessionActiveClient, ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService, IToolData, IToolSet } from '../../../common/tools/languageModelToolsService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { AgentCustomizationSyncProvider } from './agentCustomizationSyncProvider.js';
import { resolveCustomizationRefs } from './agentHostLocalCustomizations.js';
import { toolDataToDefinition } from './agentHostToolUtils.js';
import { IAgentHostToolSetEnablementService, isToolEnabledInSet } from './agentHostToolSetEnablementService.js';
import { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';

export const IAgentHostActiveClientService = createDecorator<IAgentHostActiveClientService>('agentHostActiveClientService');

/** The exposed `syncProvider` is the same instance the service uses to resolve customizations; the contribution wires it into its harness so opt-out toggles propagate. */
export interface IAgentRegistration extends IDisposable {
	readonly syncProvider: ICustomizationSyncProvider;
}

export interface IAgentHostActiveClientService {
	readonly _serviceBrand: undefined;

	/**
	 * Constructs the per-sessionType {@link AgentCustomizationSyncProvider}
	 * and {@link SyncedCustomizationBundler}, builds the `customizations`
	 * observable from them, wires it to {@link IPromptsService} change events,
	 * and resolves the initial value. Disposing the returned handle tears all
	 * of that down. The created `syncProvider` is exposed on the returned
	 * object so the contribution can pass the same instance to its
	 * customization harness.
	 */
	registerForAgent(sessionType: string): IAgentRegistration;

	/** Returns a {@link SessionActiveClient} for `sessionType` using the caller-supplied `clientId`. Customizations are empty when `sessionType` has not been registered. */
	getActiveClient(sessionType: string, clientId: string): SessionActiveClient;

	getCustomizations(sessionType: string): IObservable<readonly ClientPluginCustomization[]>;

	/**
	 * Returns the tools this client advertises to the agent host for `sessionType`.
	 *
	 * Chat Customizations are the source of truth: a tool is advertised only when it is an enabled
	 * member of a tool set surfaced in the Agents window Tools section (`deprecated !== true`).
	 * Editor-only tool sets are not created in the Agents window. Enablement is tri-state per
	 * {@link IAgentHostToolSetEnablementService}.
	 */
	getClientTools(sessionType: string): IObservable<readonly ToolDefinition[]>;
}

export class AgentHostActiveClientService extends Disposable implements IAgentHostActiveClientService {
	declare readonly _serviceBrand: undefined;

	private readonly _customizationsByType: ISettableObservable<ReadonlyMap<string, IObservable<readonly ClientPluginCustomization[]>>>;

	private readonly _allToolsObs: IObservable<readonly IToolData[]>;
	private readonly _allToolSetsObs: IObservable<Iterable<IToolSet>>;

	/** Cached per-`sessionType` advertised-tools observable, so callers (e.g. autoruns) reuse one stable derived. */
	private readonly _clientToolsByType = new Map<string, IObservable<readonly ToolDefinition[]>>();

	constructor(
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IAgentHostToolSetEnablementService private readonly _toolSetEnablementService: IAgentHostToolSetEnablementService,
	) {
		super();
		this._customizationsByType = observableValue('agentHostCustomizationsByType', new Map());

		// Pass `undefined` for the model: agent-host sessions use server-side model selection.
		this._allToolsObs = this._toolsService.observeTools(undefined);
		this._allToolSetsObs = this._toolsService.toolSets;
	}

	registerForAgent(sessionType: string): IAgentRegistration {
		const store = new DisposableStore();
		const syncProvider = store.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
		const bundler = store.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));
		const customizations = observableValue<readonly ClientPluginCustomization[]>('agentCustomizations', []);
		let updateSeq = 0;
		const updateCustomizations = async () => {
			const seq = ++updateSeq;
			try {
				const refs = await resolveCustomizationRefs(this._fileService, this._promptsService, syncProvider, this._agentPluginService, this._mcpService, this._configurationResolverService, bundler, sessionType);
				if (seq !== updateSeq) {
					return;
				}
				if (equals(customizations.get(), refs)) {
					return;
				}
				customizations.set(refs, undefined);
			} catch (err) {
				onUnexpectedError(err);
			}
		};
		// Many of the events below can fire in quick succession (e.g. during
		// initialization or when a config change touches several providers at
		// once), so debounce the re-resolution into a single update.
		const updateDelayer = store.add(new Delayer<void>(CUSTOMIZATION_UPDATE_DEBOUNCE_DELAY));
		const scheduleUpdate = () => {
			updateDelayer.trigger(() => updateCustomizations()).catch(() => { /* delayer disposed */ });
		};
		store.add(syncProvider.onDidChange(() => scheduleUpdate()));
		store.add(Event.any(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
		)(() => scheduleUpdate()));
		// Re-resolve when MCP servers configured in VS Code change (added,
		// removed, enabled/disabled, or reconfigured) so they stay in sync.
		store.add(autorun(reader => {
			for (const server of this._mcpService.servers.read(reader)) {
				server.enablement.read(reader);
				server.readDefinitions().read(reader);
			}
			scheduleUpdate();
		}));
		store.add(this._setCustomizations(sessionType, customizations));
		return {
			syncProvider,
			dispose: () => store.dispose(),
		};
	}

	private _setCustomizations(sessionType: string, customizations: IObservable<readonly ClientPluginCustomization[]>): IDisposable {
		const next = new Map(this._customizationsByType.get());
		next.set(sessionType, customizations);
		this._customizationsByType.set(next, undefined);
		return toDisposable(() => {
			const current = this._customizationsByType.get();
			if (current.get(sessionType) !== customizations) {
				return;
			}
			const removed = new Map(current);
			removed.delete(sessionType);
			this._customizationsByType.set(removed, undefined);
		});
	}

	getActiveClient(sessionType: string, clientId: string): SessionActiveClient {
		return {
			clientId,
			tools: [...this.getClientTools(sessionType).get()],
			customizations: [...(this._customizationsByType.get().get(sessionType)?.get() ?? [])],
		};
	}

	getCustomizations(sessionType: string): IObservable<readonly ClientPluginCustomization[]> {
		return derived(reader => this._customizationsByType.read(reader).get(sessionType)?.read(reader) ?? EMPTY_CUSTOMIZATIONS);
	}

	getClientTools(sessionType: string): IObservable<readonly ToolDefinition[]> {
		let obs = this._clientToolsByType.get(sessionType);
		if (!obs) {
			obs = derived(reader => {
				const tools = this._allToolsObs.read(reader);
				const toolSets = this._allToolSetsObs.read(reader);
				const enablement = this._toolSetEnablementService.observe(sessionType).read(reader);

				// Collect the ids of tools that are enabled members of at least one tool set surfaced in
				// the Agents window Tools section (non-deprecated).
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
}

const EMPTY_CUSTOMIZATIONS: readonly ClientPluginCustomization[] = Object.freeze([]);

/** Debounce window (ms) used to coalesce bursts of customization change events into a single re-resolution. */
const CUSTOMIZATION_UPDATE_DEBOUNCE_DELAY = 50;

registerSingleton(IAgentHostActiveClientService, AgentHostActiveClientService, InstantiationType.Delayed);
