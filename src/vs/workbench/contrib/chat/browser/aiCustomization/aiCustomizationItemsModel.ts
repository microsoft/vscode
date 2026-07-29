/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, isPluginCustomizationItem } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { AICustomizationItemNormalizer, EmptyItemProviderItemSource, IAICustomizationItemSource, IAICustomizationListItem, ItemProviderItemSource, PureItemProviderItemSource } from './aiCustomizationItemSource.js';
import { PromptsServiceCustomizationItemProvider } from './promptsServiceCustomizationItemProvider.js';
import { URI } from '../../../../../base/common/uri.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { isAgentHostTarget } from '../agentSessions/agentSessions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';


/**
 * The set of sections whose items are sourced from the customization
 * harness pipeline (extension-contributed providers, sync providers,
 * and the prompts-service fallback). McpServers / Models have their
 * own dedicated services and are not modeled here. Plugins keep a
 * dedicated count observable because remote harnesses can contribute
 * plugin rows through the same provider pipeline.
 */
export const ITEMS_MODEL_SECTIONS = [
	AICustomizationManagementSection.Agents,
	AICustomizationManagementSection.Skills,
	AICustomizationManagementSection.Instructions,
	AICustomizationManagementSection.Prompts,
	AICustomizationManagementSection.Hooks,
] as const;

export type ItemsModelSection = typeof ITEMS_MODEL_SECTIONS[number];

export const IAICustomizationItemsModel = createDecorator<IAICustomizationItemsModel>('aiCustomizationItemsModel');

/**
 * Single source of truth for the items rendered by the AI Customizations
 * editor and observed by sidebar surfaces (counts/badges).
 *
 * The model owns the per-active-harness item source
 * cache and exposes the unfiltered, normalized list of items per section.
 * Both the editor and any sidebar surface read from these observables so
 * there is exactly one discovery path for customizations.
 */
export interface IAICustomizationItemsModel {
	readonly _serviceBrand: undefined;

	/**
	 * Returns an observable of the unfiltered, normalized list items for the
	 * given prompts-based section under the currently active harness.
	 */
	getItems(section: ItemsModelSection): IObservable<readonly IAICustomizationListItem[]>;

	/**
	 * Returns the live item source for the active harness.
	 * Editor consumers may need this to access provider-level affordances
	 * (e.g. debug reporting). The returned source is reused across the
	 * lifetime of the active descriptor.
	 */
	getActiveItemSource(): IAICustomizationItemSource;

	/**
	 * Convenience: an observable of the count for the given section.
	 */
	getCount(section: ItemsModelSection): IObservable<number>;

	/**
	 * Returns an observable of the Plugins section count. This combines
	 * locally installed plugins with plugin rows supplied by the active
	 * customization harness provider.
	 */
	getPluginCount(): IObservable<number>;

	/**
	 * Resolves once the most recent fetch for `section` has settled. Useful for
	 * tests / fixtures that need rendered output to reflect at least one fetch.
	 * Calling this also marks the section as observed (i.e. starts a fetch if
	 * none has been kicked off yet).
	 */
	whenSectionLoaded(section: ItemsModelSection): Promise<void>;
}

export class AICustomizationItemsModel extends Disposable implements IAICustomizationItemsModel {
	declare readonly _serviceBrand: undefined;

	private readonly itemNormalizer: AICustomizationItemNormalizer;

	/**
	 * Cached source per active descriptor. Keyed by descriptor reference (not id) so that
	 * an external harness re-registering under the same id (e.g. extension reload) gets a
	 * fresh source bound to the new provider. Pruned when its descriptor is no longer
	 * present in `availableHarnesses`.
	 */
	private readonly sourceCache = this._register(new MutableDisposable<IAICustomizationItemSource>());
	private pendingRefetchSource: IAICustomizationItemSource | undefined;
	private readonly refetchObservedScheduler = this._register(new RunOnceScheduler(() => {
		const source = this.pendingRefetchSource;
		if (!source || this._store.isDisposed) {
			return;
		}
		this.refetchObserved(source);
	}, 0));

	private readonly perSection = new Map<ItemsModelSection, ISettableObservable<readonly IAICustomizationListItem[]>>();
	private readonly perSectionCount = new Map<ItemsModelSection, IObservable<number>>();
	private readonly fetchSeq = new Map<ItemsModelSection, number>();
	/** Promise of the most recent fetch per section (resolves regardless of stale-discard). */
	private readonly perSectionPending = new Map<ItemsModelSection, Promise<void>>();
	private readonly remotePluginNames = observableValue<readonly string[]>('aiCustomizationRemotePluginNames', []);
	private readonly pluginCount = derived(reader => {
		const installed = this.agentPluginService.plugins.read(reader);
		// Match PluginListWidget's installed-name derivation
		// (see installedPluginToItem in pluginListWidget.ts) so the model and
		// editor widget agree on what counts as a duplicate when a plugin's
		// `label` is empty/undefined.
		const installedNames = new Set(installed.map(p => (p.label || basename(p.uri)).toLowerCase()));
		const remoteNames = this.remotePluginNames.read(reader);
		const uniqueRemote = remoteNames.filter(name => name && !installedNames.has(name.toLowerCase()));
		return installed.length + uniqueRemote.length;
	});
	private pluginCountObserved = false;
	private pluginFetchSeq = 0;
	/**
	 * Sections that have been observed at least once. The model only fetches on
	 * demand: first `getItems`/`getCount` for a section triggers an initial fetch,
	 * and subsequent harness/source/workspace change events refetch only sections
	 * that have already been read. This avoids 5x provider enumeration on startup.
	 */
	private readonly observedSections = new Set<ItemsModelSection>();

	constructor(
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ILabelService labelService: ILabelService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IProductService productService: IProductService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this.itemNormalizer = new AICustomizationItemNormalizer(labelService, productService);

		for (const section of ITEMS_MODEL_SECTIONS) {
			const items = observableValue<readonly IAICustomizationListItem[]>(`aiCustomizationItems:${section}`, []);
			this.perSection.set(section, items);
			this.perSectionCount.set(section, derived(reader => items.read(reader).length));
			this.fetchSeq.set(section, 0);
		}

		// Re-bind to the active source whenever the active harness or the set of available
		// harnesses changes (a new external provider may have registered for the already-
		// active id), prune the source cache, and refetch any observed sections.
		const sourceChangeListener = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			const activeSessionResource = this.harnessService.activeSessionResource.read(reader);
			const source = this.getOrCreateSource(activeSessionResource);
			sourceChangeListener.value = source.onDidAICustomizationItemsChange(() => {
				this.scheduleRefetchObserved(source);
			});
			this.scheduleRefetchObserved(source);
		}));

		// Workspace folder changes / active project root changes affect the items the
		// prompts service surfaces (e.g. workspace vs. user classification).
		this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.scheduleRefetchObserved(this.getActiveItemSource())));
		this._register(autorun(reader => {
			this.workspaceService.activeProjectRoot.read(reader);
			this.scheduleRefetchObserved(this.getActiveItemSource());
		}));
	}

	getItems(section: ItemsModelSection): IObservable<readonly IAICustomizationListItem[]> {
		this.markObserved(section);
		return this.perSection.get(section)!;
	}

	getCount(section: ItemsModelSection): IObservable<number> {
		this.markObserved(section);
		return this.perSectionCount.get(section)!;
	}

	getPluginCount(): IObservable<number> {
		this.markPluginCountObserved();
		return this.pluginCount;
	}

	getActiveItemSource(): IAICustomizationItemSource {
		return this.getOrCreateSource(this.harnessService.activeSessionResource.get());
	}

	whenSectionLoaded(section: ItemsModelSection): Promise<void> {
		this.markObserved(section);
		return this.perSectionPending.get(section) ?? Promise.resolve();
	}

	private markObserved(section: ItemsModelSection): void {
		if (this.observedSections.has(section) || this._store.isDisposed) {
			return;
		}
		this.observedSections.add(section);
		this.refetchSection(section, this.getActiveItemSource());
	}

	private markPluginCountObserved(): void {
		if (this.pluginCountObserved || this._store.isDisposed) {
			return;
		}
		this.pluginCountObserved = true;
		this.refetchPluginCount(this.getActiveItemSource());
	}

	private getOrCreateSource(sessionResource: URI): IAICustomizationItemSource {
		const cached = this.sourceCache.value;
		if (cached && isEqual(sessionResource, cached.sessionResource) && !(cached instanceof EmptyItemProviderItemSource)) {
			return cached;
		}
		const sessionType = getChatSessionType(sessionResource);
		const descriptor = this.harnessService.findHarnessById(sessionType);

		const getItemSource = () => {
			if (!descriptor) {
				this.logService.warn(`No harness descriptor found for session type ${sessionType}`);
				return new EmptyItemProviderItemSource(sessionResource);
			}
			if (isAgentHostTarget(sessionType)) {
				if (!descriptor.itemProvider) {
					this.logService.warn(`Agent-host session type ${sessionType} has no item provider`);
					return new EmptyItemProviderItemSource(sessionResource);
				}
				return new PureItemProviderItemSource(sessionResource, descriptor.itemProvider, this.itemNormalizer);
			} else {
				const itemProvider = descriptor.itemProvider ?? this.instantiationService.createInstance(PromptsServiceCustomizationItemProvider);
				return new ItemProviderItemSource(
					sessionResource,
					itemProvider,
					this.promptsService,
					this.workspaceService,
					this.fileService,
					this.pathService,
					this.itemNormalizer,
				);
			}
		};
		const source = getItemSource();
		this.sourceCache.value = source;
		return source;
	}

	private scheduleRefetchObserved(source: IAICustomizationItemSource): void {
		this.pendingRefetchSource = source;
		this.refetchObservedScheduler.schedule();
	}

	private refetchObserved(source: IAICustomizationItemSource): void {
		for (const section of this.observedSections) {
			this.refetchSection(section, source);
		}
		if (this.pluginCountObserved) {
			this.refetchPluginCount(source);
		}
	}

	private refetchSection(section: ItemsModelSection, source: IAICustomizationItemSource): void {
		const seq = (this.fetchSeq.get(section) ?? 0) + 1;
		this.fetchSeq.set(section, seq);
		const promptType = sectionToPromptType(section);
		const observable = this.perSection.get(section)!;
		const pending = source.fetchAICustomizationItems(promptType).then(items => {
			if (this._store.isDisposed) {
				return;
			}
			// Discard stale results (a newer fetch superseded this one).
			if (this.fetchSeq.get(section) !== seq) {
				return;
			}
			// Discard if the active source changed mid-fetch.
			if (this.getActiveItemSource() !== source) {
				return;
			}
			observable.set(items, undefined);
		}, e => {
			if (this._store.isDisposed) {
				return;
			}
			onUnexpectedError(e);
		});
		this.perSectionPending.set(section, pending);
	}

	private refetchPluginCount(source: IAICustomizationItemSource): void {
		const seq = ++this.pluginFetchSeq;
		const pending = source.fetchProviderItems().then(items => {
			return items
				.filter(item => isPluginCustomizationItem(item) && item.groupKey !== 'remote-client')
				.map(item => item.name ?? '');
		});

		pending.then(names => {
			if (this._store.isDisposed) {
				return;
			}
			if (this.pluginFetchSeq !== seq) {
				return;
			}
			if (this.getActiveItemSource() !== source) {
				return;
			}
			this.remotePluginNames.set(names, undefined);
		}, e => {
			if (!this._store.isDisposed) {
				onUnexpectedError(e);
			}
		});
	}
}

function sectionToPromptType(section: ItemsModelSection): PromptsType {
	switch (section) {
		case AICustomizationManagementSection.Agents: return PromptsType.agent;
		case AICustomizationManagementSection.Skills: return PromptsType.skill;
		case AICustomizationManagementSection.Instructions: return PromptsType.instructions;
		case AICustomizationManagementSection.Hooks: return PromptsType.hook;
		case AICustomizationManagementSection.Prompts:
		default: return PromptsType.prompt;
	}
}

registerSingleton(IAICustomizationItemsModel, AICustomizationItemsModel, InstantiationType.Delayed);
