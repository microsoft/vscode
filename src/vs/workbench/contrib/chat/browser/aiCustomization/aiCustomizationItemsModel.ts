/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, ICustomizationItemProvider, IHarnessDescriptor } from '../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { AICustomizationItemNormalizer, IAICustomizationItemSource, IAICustomizationListItem, ProviderCustomizationItemSource } from './aiCustomizationItemSource.js';
import { PromptsServiceCustomizationItemProvider } from './promptsServiceCustomizationItemProvider.js';

/**
 * The set of sections whose items are sourced from the customization
 * harness pipeline (extension-contributed providers, sync providers,
 * and the prompts-service fallback). McpServers / Plugins / Models
 * have their own dedicated services and are not modeled here.
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
 * The model owns the per-active-harness `ProviderCustomizationItemSource`
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
	 * Returns the live `ProviderCustomizationItemSource` for the active harness.
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
	 * The fallback item provider used when the active descriptor has neither
	 * an `itemProvider` nor a `syncProvider`. Exposed for the debug report.
	 */
	getPromptsServiceItemProvider(): ICustomizationItemProvider;

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
	private readonly promptsServiceItemProvider: PromptsServiceCustomizationItemProvider;

	/**
	 * Cached source per active descriptor. Keyed by descriptor reference (not id) so that
	 * an external harness re-registering under the same id (e.g. extension reload) gets a
	 * fresh source bound to the new provider. Pruned when its descriptor is no longer
	 * present in `availableHarnesses`.
	 */
	private readonly sourceCache = new Map<IHarnessDescriptor, IAICustomizationItemSource>();

	private readonly perSection = new Map<ItemsModelSection, ISettableObservable<readonly IAICustomizationListItem[]>>();
	private readonly perSectionCount = new Map<ItemsModelSection, IObservable<number>>();
	private readonly fetchSeq = new Map<ItemsModelSection, number>();
	/** Promise of the most recent fetch per section (resolves regardless of stale-discard). */
	private readonly perSectionPending = new Map<ItemsModelSection, Promise<void>>();
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
		@IAgentPluginService agentPluginService: IAgentPluginService,
		@IProductService productService: IProductService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
	) {
		super();

		this.itemNormalizer = new AICustomizationItemNormalizer(
			workspaceContextService,
			workspaceService,
			labelService,
			agentPluginService,
			productService,
		);
		this.promptsServiceItemProvider = new PromptsServiceCustomizationItemProvider(
			() => this.harnessService.getActiveDescriptor(),
			this.promptsService,
			this.workspaceService,
			productService,
		);

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
			const available = this.harnessService.availableHarnesses.read(reader);
			this.harnessService.activeHarness.read(reader);
			this.pruneSourceCache(available);
			const descriptor = this.harnessService.getActiveDescriptor();
			const source = this.getOrCreateSource(descriptor);
			sourceChangeListener.value = source.onDidChange(() => this.refetchObserved(source));
			this.refetchObserved(source);
		}));

		// Workspace folder changes / active project root changes affect the items the
		// prompts service surfaces (e.g. workspace vs. user classification).
		this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.refetchObserved(this.getActiveItemSource())));
		this._register(autorun(reader => {
			this.workspaceService.activeProjectRoot.read(reader);
			this.refetchObserved(this.getActiveItemSource());
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

	getActiveItemSource(): IAICustomizationItemSource {
		return this.getOrCreateSource(this.harnessService.getActiveDescriptor());
	}

	getPromptsServiceItemProvider(): ICustomizationItemProvider {
		return this.promptsServiceItemProvider;
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

	private getOrCreateSource(descriptor: IHarnessDescriptor): IAICustomizationItemSource {
		const cached = this.sourceCache.get(descriptor);
		if (cached) {
			return cached;
		}
		const itemProvider = descriptor.itemProvider ?? (descriptor.syncProvider ? undefined : this.promptsServiceItemProvider);
		const source = new ProviderCustomizationItemSource(
			itemProvider,
			descriptor.syncProvider,
			this.promptsService,
			this.workspaceService,
			this.fileService,
			this.pathService,
			this.itemNormalizer,
		);
		this.sourceCache.set(descriptor, source);
		return source;
	}

	private pruneSourceCache(available: readonly IHarnessDescriptor[]): void {
		const live = new Set(available);
		for (const descriptor of this.sourceCache.keys()) {
			if (!live.has(descriptor)) {
				this.sourceCache.delete(descriptor);
			}
		}
	}

	private refetchObserved(source: IAICustomizationItemSource): void {
		for (const section of this.observedSections) {
			this.refetchSection(section, source);
		}
	}

	private refetchSection(section: ItemsModelSection, source: IAICustomizationItemSource): void {
		const seq = (this.fetchSeq.get(section) ?? 0) + 1;
		this.fetchSeq.set(section, seq);
		const promptType = sectionToPromptType(section);
		const observable = this.perSection.get(section)!;
		const pending = source.fetchItems(promptType).then(items => {
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
