/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { equals } from '../../../../../../base/common/objects.js';
import { derived, IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import type { SessionActiveClient, ToolDefinition } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { AgentCustomizationSyncProvider } from './agentCustomizationSyncProvider.js';
import { resolveCustomizationRefs } from './agentHostLocalCustomizations.js';
import { toolDataToDefinition } from './agentHostToolUtils.js';
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

	readonly clientTools: IObservable<readonly ToolDefinition[]>;
}

export class AgentHostActiveClientService extends Disposable implements IAgentHostActiveClientService {
	declare readonly _serviceBrand: undefined;

	private readonly _customizationsByType: ISettableObservable<ReadonlyMap<string, IObservable<readonly ClientPluginCustomization[]>>>;
	readonly clientTools: IObservable<readonly ToolDefinition[]>;

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._customizationsByType = observableValue('agentHostCustomizationsByType', new Map());

		// Pass `undefined` for the model: agent-host sessions use server-side model selection.
		const allToolsObs = toolsService.observeTools(undefined);
		const allowlistObs = observableConfigValue<string[]>(ChatConfiguration.AgentHostClientTools, [], configurationService);
		this.clientTools = derived(reader => {
			const allowlist = new Set(allowlistObs.read(reader));
			return allToolsObs.read(reader)
				.filter(t => t.toolReferenceName !== undefined && allowlist.has(t.toolReferenceName))
				.map(toolDataToDefinition);
		});
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
				const refs = await resolveCustomizationRefs(this._fileService, this._promptsService, syncProvider, this._agentPluginService, bundler, sessionType);
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
		store.add(syncProvider.onDidChange(() => updateCustomizations()));
		store.add(Event.any(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
		)(() => updateCustomizations()));
		updateCustomizations();
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
			tools: [...this.clientTools.get()],
			customizations: [...(this._customizationsByType.get().get(sessionType)?.get() ?? [])],
		};
	}

	getCustomizations(sessionType: string): IObservable<readonly ClientPluginCustomization[]> {
		return derived(reader => this._customizationsByType.read(reader).get(sessionType)?.read(reader) ?? EMPTY_CUSTOMIZATIONS);
	}
}

const EMPTY_CUSTOMIZATIONS: readonly ClientPluginCustomization[] = Object.freeze([]);

registerSingleton(IAgentHostActiveClientService, AgentHostActiveClientService, InstantiationType.Delayed);
