/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DeferredPromise, Limiter, Promises, RunOnceScheduler, raceCancellation, raceTimeout } from '../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { PositionOrRange, RangeMapping, SingleRangeMapping } from '../../../../editor/common/core/ranges/rangeMapping.js';
import { StructuralDiffClassification, StructuralDiffNode, StructuralDiffResult, SymbolKind, symbolKindNames } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { StructuralDiffs } from '../../../../editor/contrib/structuralDiff/common/structuralDiff.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISCMProvider, ISCMResource, ISCMResourceGroup } from './scm.js';

export const SCM_STRUCTURAL_DIFF_ID_PREFIX = 'scmStructuralDiff:';

/** Structural changes load when a file is expanded, for example many at once when a view with expanded files is restored. Only a few are analyzed at a time. */
const MAX_CONCURRENT_LOADS = 3;

/** A load that takes longer is abandoned, so one hung provider cannot occupy a load slot forever. */
const MAX_LOAD_TIME_MS = 30_000;

interface SCMStructuralDiffElementBase {
	/**
	 * Identifies the item or status that the element shows. It stays the same when the structural
	 * changes of a file are reloaded, so the tree keeps focus, selection and collapse state.
	 */
	readonly id: string;
	/** Identifies the result that contains the element, see {@link SCMStructuralDiffModel.isCurrent}. */
	readonly generation: number;
	readonly resource: ISCMResource;
	readonly order: number;
}

export interface SCMStructuralDiffNode extends SCMStructuralDiffElementBase {
	readonly type: 'structuralDiff';
	readonly node: StructuralDiffNode;
	readonly parent: ISCMResource | SCMStructuralDiffNode;
	readonly children: readonly SCMStructuralDiffNode[];
	/**
	 * For an item that only exists in the original document, the position in the modified document where it was
	 * deleted. An inline diff only shows the modified document, so it shows a deleted item there.
	 */
	readonly deletedAt?: IPosition;
}

export interface SCMStructuralDiffStatus extends SCMStructuralDiffElementBase {
	readonly type: 'structuralDiffStatus';
	readonly status: 'incomplete' | 'error' | 'timedOut';
	readonly parent: ISCMResource;
}

export type SCMStructuralDiffElement = SCMStructuralDiffNode | SCMStructuralDiffStatus;

/**
 * A step from a parent to a structural item: its kind and name, whether it was added, where it starts in the original
 * document, and its position among siblings that have all of these in common.
 */
type ItemKey = readonly [kind: SymbolKind, name: string, added: boolean, line: number, column: number, ordinal: number];

function createElementId(resource: ISCMResource, path: readonly (ItemKey | string)[]): string {
	const group = resource.resourceGroup;
	return SCM_STRUCTURAL_DIFF_ID_PREFIX + JSON.stringify([group.provider.id, group.id, resource.sourceUri.toString(), ...path]);
}

export function isSCMStructuralDiffElement(element: unknown): element is SCMStructuralDiffElement {
	return typeof element === 'object' && element !== null && 'type' in element
		&& (element.type === 'structuralDiff' || element.type === 'structuralDiffStatus');
}

export function getSCMStructuralDiffLabel(element: SCMStructuralDiffElement): string {
	if (element.type === 'structuralDiffStatus') {
		return element.status === 'incomplete'
			? localize('structuralDiff.incomplete', "Partial structural changes")
			: element.status === 'timedOut'
				? localize('structuralDiff.timedOut', "Structural changes took too long to load")
				: localize('structuralDiff.error', "Unable to load structural changes");
	}
	return (element.node.modifiedItem ?? element.node.originalItem)!.name;
}

export function getSCMStructuralDiffChange(element: SCMStructuralDiffElement): { readonly type: 'added' | 'deleted' | 'modified' | 'renamed'; readonly label: string } | undefined {
	if (element.type === 'structuralDiffStatus') {
		return undefined;
	}
	if (!element.node.originalItem) {
		return { type: 'added', label: localize('structuralDiff.added', "Added") };
	}
	if (!element.node.modifiedItem) {
		return { type: 'deleted', label: localize('structuralDiff.deleted', "Deleted") };
	}
	if (element.node.originalItem.name !== element.node.modifiedItem.name) {
		return {
			type: 'renamed',
			label: localize('structuralDiff.renamed', "Renamed from {0} to {1}", element.node.originalItem.name, element.node.modifiedItem.name),
		};
	}
	if (element.node.originalChanges.length > 0 || element.node.modifiedChanges.length > 0) {
		return { type: 'modified', label: localize('structuralDiff.changed', "Changed") };
	}
	return undefined;
}

export function getSCMStructuralDiffChangeAnnotation(element: SCMStructuralDiffElement): { readonly label: string; readonly description: string } | undefined {
	if (element.type === 'structuralDiffStatus' || !element.node.originalItem || !element.node.modifiedItem
		|| element.node.originalItem.name !== element.node.modifiedItem.name) {
		return undefined;
	}
	const changes = [...element.node.originalChanges, ...element.node.modifiedChanges];
	const declarationChanged = changes.some(change => change.classification === StructuralDiffClassification.Header);
	const implementationChanged = changes.some(change => change.classification === StructuralDiffClassification.Implementation);
	if (declarationChanged && implementationChanged) {
		return {
			label: localize({ key: 'structuralDiff.declImplAnnotation', comment: ['Short annotation: declaration and implementation both changed.'] }, "decl+impl"),
			description: localize('structuralDiff.declImplChanged', "Declaration and implementation changed"),
		};
	}
	if (declarationChanged) {
		return {
			label: localize({ key: 'structuralDiff.declAnnotation', comment: ['Short annotation: decl abbreviates declaration.'] }, "decl"),
			description: localize('structuralDiff.declChanged', "Declaration changed"),
		};
	}
	if (implementationChanged) {
		return {
			label: localize({ key: 'structuralDiff.implAnnotation', comment: ['Short annotation: impl abbreviates implementation.'] }, "impl"),
			description: localize('structuralDiff.implChanged', "Implementation changed"),
		};
	}
	return undefined;
}

export function getSCMStructuralDiffDescription(element: SCMStructuralDiffElement): string | undefined {
	if (element.type === 'structuralDiffStatus') {
		return undefined;
	}
	const details = (element.node.modifiedItem ?? element.node.originalItem)!.detail;
	const status = getSCMStructuralDiffChangeAnnotation(element)?.description ?? getSCMStructuralDiffChange(element)?.label;
	return [status, details].filter(value => !!value).join(', ') || undefined;
}

export function getSCMStructuralDiffAriaLabel(element: SCMStructuralDiffElement): string {
	if (element.type === 'structuralDiffStatus') {
		return getSCMStructuralDiffLabel(element);
	}
	const item = (element.node.modifiedItem ?? element.node.originalItem)!;
	const description = getSCMStructuralDiffDescription(element);
	return description
		? localize('structuralDiff.ariaLabelWithDescription', "{0}, {1}, {2}", item.name, symbolKindNames[item.kind], description)
		: localize('structuralDiff.ariaLabel', "{0}, {1}", item.name, symbolKindNames[item.kind]);
}

class StructuralDiffEntry extends Disposable {
	readonly cancellation = this._register(new CancellationTokenSource());
	readonly listeners = this._register(new DisposableStore());
	readonly references = this._register(new DisposableStore());
	private readonly disposal = new DeferredPromise<void>();
	/** Settles when the entry is disposed, for example because its file was collapsed or the view was hidden. */
	readonly whenDisposed = this.disposal.p;
	pending?: Promise<readonly SCMStructuralDiffElement[]>;
	children?: readonly SCMStructuralDiffElement[];
	disposed = false;
	timedOut = false;

	constructor(readonly resource: ISCMResource, readonly generation: number) {
		super();
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.cancellation.cancel();
			this.disposal.complete();
			super.dispose();
		}
	}
}

/**
 * Whether any structural diff provider is registered, regardless of the languages it supports.
 * This decides whether the feature is offered at all. Whether a file can show structural
 * changes is decided per resource by {@link SCMStructuralDiffModel.hasChildren}, so changes
 * that span many languages need no special handling.
 */
export function hasSCMStructuralDiffProvider(languageFeaturesService: ILanguageFeaturesService): boolean {
	return languageFeaturesService.structuralDiffProvider.allNoModel().length > 0;
}

export class SCMStructuralDiffModel extends Disposable {
	private _enabled = false;
	get enabled(): boolean { return this._enabled; }
	private visible = true;

	/** Whether any structural diff provider is registered, see {@link hasSCMStructuralDiffProvider}. */
	readonly hasProvider: IObservable<boolean>;

	private readonly entries = this._register(new DisposableMap<ISCMResource, StructuralDiffEntry>());
	private readonly loadLimiter = this._register(new Limiter<readonly SCMStructuralDiffElement[]>(MAX_CONCURRENT_LOADS));
	private readonly _onDidChange = this._register(new Emitter<ISCMResource | undefined>());
	readonly onDidChange = this._onDidChange.event;
	private generation = 0;
	private readonly pendingChanges = new Set<ISCMResource>();
	private readonly changeScheduler = this._register(new RunOnceScheduler(() => {
		const resources = [...this.pendingChanges];
		this.pendingChanges.clear();
		for (const resource of resources) {
			this._onDidChange.fire(resource);
		}
	}, 150));

	constructor(
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@ITextResourceConfigurationService private readonly configurationService: ITextResourceConfigurationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.hasProvider = observableFromEvent(this, this.languageFeaturesService.structuralDiffProvider.onDidChange, () => hasSCMStructuralDiffProvider(this.languageFeaturesService));
		this._register(this.languageFeaturesService.structuralDiffProvider.onDidChange(() => {
			if (!this._enabled) {
				return;
			}
			this.clear();
			this._onDidChange.fire(undefined);
		}));
		this._register(this.modelService.onModelLanguageChanged(({ model }) => {
			if (!this.isActive) {
				return;
			}
			for (const [resource] of this.entries) {
				if (this.uriIdentityService.extUri.isEqual(resource.multiDiffEditorModifiedUri, model.uri)
					|| this.uriIdentityService.extUri.isEqual(resource.multiDiffEditorOriginalUri, model.uri)) {
					this.entries.deleteAndDispose(resource);
				}
			}
			this._onDidChange.fire(undefined);
		}));
		this._register(this.languageService.onDidChange(() => {
			if (this.isActive) {
				this._onDidChange.fire(undefined);
			}
		}));
	}

	setEnabled(enabled: boolean): void {
		if (this._enabled === enabled) {
			return;
		}
		this._enabled = enabled;
		if (!enabled) {
			this.clear();
		}
		this._onDidChange.fire(undefined);
	}

	/**
	 * Called when the view is shown or hidden. A hidden view keeps no results and analyzes no files, even when a refresh
	 * of its tree asks for the children of an expanded file, because refreshes can still run after the view was hidden.
	 * Files remain expandable, so the tree keeps them expanded and loads their children when it is shown again.
	 */
	setVisible(visible: boolean): void {
		this.visible = visible;
		if (!visible) {
			this.clear();
		}
	}

	hasChildren(resource: ISCMResource): boolean {
		if (!this.enabled) {
			return false;
		}
		const entry = this.entries.get(resource);
		if (entry?.children !== undefined) {
			return entry.children.length > 0;
		}
		return this.canProvide(resource);
	}

	getChildren(resource: ISCMResource): Promise<readonly SCMStructuralDiffElement[]> {
		if (this._store.isDisposed || !this.visible || !this.canProvide(resource)) {
			return Promise.resolve([]);
		}
		let entry = this.entries.get(resource);
		if (entry === undefined) {
			entry = new StructuralDiffEntry(resource, ++this.generation);
			this.entries.set(resource, entry);
		}
		if (entry.children !== undefined) {
			return Promise.resolve(entry.children);
		}
		// The tree makes refreshes of the group and the root wait for this request, so it settles as soon as the entry is
		// disposed, even while the file still waits for a load slot. A timeout does not dispose the entry and shows its status.
		entry.pending ??= Promise.race([this.loadLimiter.queue(() => this.loadWithinBudget(entry)), entry.whenDisposed.then(() => [])]);
		return entry.pending;
	}

	isCurrent(element: SCMStructuralDiffElement): boolean {
		const entry = this.entries.get(element.resource);
		return entry !== undefined && !entry.disposed && entry.generation === element.generation;
	}

	release(resource: ISCMResource): void {
		this.entries.deleteAndDispose(resource);
		this._onDidChange.fire(resource);
	}

	/** Releases the cached results of all resources in the group, for example because the group was removed. */
	invalidateGroup(group: ISCMResourceGroup): void {
		for (const [resource] of this.entries) {
			if (resource.resourceGroup === group) {
				this.entries.deleteAndDispose(resource);
			}
		}
	}

	/**
	 * Releases the cached results of resources that are no longer in the group, for example because
	 * their status changed. Results of the remaining resources are kept, because content changes
	 * already invalidate them.
	 */
	releaseRemovedResources(group: ISCMResourceGroup): void {
		let resources: Set<ISCMResource> | undefined;
		for (const [resource] of this.entries) {
			if (resource.resourceGroup === group) {
				resources ??= new Set(group.resources);
				if (!resources.has(resource)) {
					this.entries.deleteAndDispose(resource);
				}
			}
		}
	}

	invalidateProvider(provider: ISCMProvider): void {
		for (const [resource] of this.entries) {
			if (resource.resourceGroup.provider === provider) {
				this.entries.deleteAndDispose(resource);
			}
		}
	}

	private clear(): void {
		this.changeScheduler.cancel();
		this.pendingChanges.clear();
		this.entries.clearAndDisposeAll();
	}

	/** Language changes cannot affect the tree unless structural children are enabled and a provider can supply them. */
	private get isActive(): boolean {
		return this._enabled && hasSCMStructuralDiffProvider(this.languageFeaturesService);
	}

	private canProvide(resource: ISCMResource): boolean {
		if (!this.enabled) {
			return false;
		}
		const modified = resource.multiDiffEditorModifiedUri;
		if (!resource.multiDiffEditorOriginalUri || !modified) {
			return false;
		}
		const model = this.modelService.getModel(modified);
		const registry = this.languageFeaturesService.structuralDiffProvider;
		return model ? registry.has(model)
			: registry.hasForResource(modified, this.languageService.guessLanguageIdByFilepathOrFirstLine(modified) ?? 'plaintext');
	}

	private invalidate(entry: StructuralDiffEntry): void {
		if (!entry.disposed && this.entries.get(entry.resource) === entry) {
			this.entries.deleteAndDispose(entry.resource);
			this.pendingChanges.add(entry.resource);
			this.changeScheduler.schedule();
		}
	}

	private checkCancellation(entry: StructuralDiffEntry): void {
		if (entry.disposed || entry.cancellation.token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	/** Keeps the document loaded while the entry exists and invalidates the entry when the document changes, also after a failure. */
	private async resolveModel(entry: StructuralDiffEntry, resource: URI): Promise<ITextModel> {
		this.checkCancellation(entry);
		const reference = await this.textModelService.createModelReference(resource);
		if (entry.disposed || entry.cancellation.token.isCancellationRequested) {
			reference.dispose();
			throw new CancellationError();
		}
		entry.references.add(reference);
		const model = reference.object.textEditorModel;
		entry.listeners.add(model.onDidChangeContent(() => this.invalidate(entry)));
		entry.listeners.add(model.onWillDispose(() => this.invalidate(entry)));
		return model;
	}

	/**
	 * Loads within the time budget, so a load that never completes cannot occupy one of the limited load slots forever.
	 * Cancelling an entry does not interrupt loading its documents, so a cancelled load stops waiting for them and frees
	 * its slot right away. Documents that are loaded later are released when they arrive.
	 */
	private async loadWithinBudget(entry: StructuralDiffEntry): Promise<readonly SCMStructuralDiffElement[]> {
		const children = await raceTimeout(raceCancellation(this.load(entry), entry.cancellation.token, []), MAX_LOAD_TIME_MS, () => {
			entry.timedOut = true;
			entry.cancellation.cancel();
		});
		return children && !entry.timedOut ? children : this.fail(entry, 'timedOut');
	}

	private async load(entry: StructuralDiffEntry): Promise<readonly SCMStructuralDiffElement[]> {
		const resource = entry.resource;
		try {
			// Both documents are loaded even when one of them cannot be, so that every document that can be loaded is watched.
			const [original, modified] = await Promises.settled([
				this.resolveModel(entry, resource.multiDiffEditorOriginalUri!),
				this.resolveModel(entry, resource.multiDiffEditorModifiedUri!),
			]);
			const result = await this.computeStructuralDiff(entry, original, modified);
			this.checkCancellation(entry);
			const toModified = new RangeMapping((result?.context.changes ?? []).map(change => new SingleRangeMapping(Range.lift(change.originalRange), Range.lift(change.modifiedRange))));
			const toOriginal = toModified.reverse();
			// A position in changed text maps to the start of the change in the other document.
			const startOf = (mapped: PositionOrRange) => mapped.range?.getStartPosition() ?? mapped.position!;
			const wrap = (nodes: readonly StructuralDiffNode[], parent: ISCMResource | SCMStructuralDiffNode, path: readonly ItemKey[]): SCMStructuralDiffNode[] => {
				const ordinals = new Map<string, number>();
				return nodes.map((node, order) => {
					const item = (node.originalItem ?? node.modifiedItem)!;
					// Edits of the working file do not change the original document, so a position in it identifies an item,
					// even when siblings with the same name start or stop changing. An added item is located through the text changes.
					const start = node.originalItem ? Range.getStartPosition(node.originalItem.range) : startOf(toOriginal.mapPosition(Range.getStartPosition(node.modifiedItem!.range)));
					const identity = [item.kind, item.name, !node.originalItem, start.lineNumber, start.column] as const;
					const key = JSON.stringify(identity);
					const ordinal = ordinals.get(key) ?? 0;
					ordinals.set(key, ordinal + 1);
					const nodePath: ItemKey[] = [...path, [...identity, ordinal]];
					const children: SCMStructuralDiffNode[] = [];
					const element: SCMStructuralDiffNode = {
						type: 'structuralDiff', id: createElementId(resource, nodePath),
						generation: entry.generation, resource, node, parent, order, children,
						...(node.modifiedItem ? {} : { deletedAt: startOf(toModified.mapPosition(start)) }),
					};
					children.push(...wrap(node.children, element, nodePath));
					return element;
				});
			};
			const children: SCMStructuralDiffElement[] = result ? wrap(result.root.children, resource, []) : [];
			if (result?.isIncomplete) {
				children.push(this.createStatus(entry, 'incomplete', children.length));
			}
			entry.children = children;
			if (children.length === 0) {
				this._onDidChange.fire(resource);
			}
			return children;
		} catch (error) {
			// A load that timed out already shows its status, and the view disposes an entry when it cancels loading it. Any
			// other error, even a cancellation error, is a failure.
			if (entry.timedOut || entry.disposed) {
				return [];
			}
			if (error instanceof StructuralDiffs.TimeoutError) {
				this.logService.info('[SCM] Structural changes took too long to compute', resource.sourceUri, error.message);
				return this.fail(entry, 'timedOut');
			}
			this.logService.error('[SCM] Error loading structural changes', resource.sourceUri, error);
			return this.fail(entry, 'error');
		}
	}

	/**
	 * Computes the structural diff of the documents. A provider can reject with a cancellation error of its own, for example
	 * when its language server restarts. Like a provider that fails, it then supplies no result, and the documents remain
	 * watched, so an edit analyzes the file again.
	 */
	private async computeStructuralDiff(entry: StructuralDiffEntry, original: ITextModel, modified: ITextModel): Promise<StructuralDiffResult | undefined> {
		try {
			return await StructuralDiffs.compute(this.editorWorkerService, this.configurationService, this.languageFeaturesService.structuralDiffProvider, original, modified, entry.cancellation.token);
		} catch (error) {
			if (isCancellationError(error) && !entry.disposed && !entry.cancellation.token.isCancellationRequested) {
				return undefined;
			}
			throw error;
		}
	}

	/**
	 * Shows a status row instead of structural changes until the entry is invalidated. Like a result, a failure keeps the
	 * documents that could be loaded, so editing one of them analyzes the file again.
	 */
	private fail(entry: StructuralDiffEntry, status: 'error' | 'timedOut'): readonly SCMStructuralDiffElement[] {
		if (entry.disposed) {
			return [];
		}
		const children = [this.createStatus(entry, status, 0)];
		entry.children = children;
		return children;
	}

	private createStatus(entry: StructuralDiffEntry, status: SCMStructuralDiffStatus['status'], order: number): SCMStructuralDiffStatus {
		return {
			type: 'structuralDiffStatus', id: createElementId(entry.resource, ['status', status]),
			generation: entry.generation, resource: entry.resource, parent: entry.resource, order, status,
		};
	}
}
