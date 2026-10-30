/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Limiter, RunOnceScheduler, raceTimeout } from '../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { StructuralDiffClassification, StructuralDiffNode, symbolKindNames } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { StructuralDiffTimeoutError, getStructuralDiff } from '../../../../editor/contrib/structuralDiff/common/structuralDiff.js';
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
	readonly id: string;
	readonly generation: number;
	readonly resource: ISCMResource;
	readonly order: number;
}

export interface SCMStructuralDiffNode extends SCMStructuralDiffElementBase {
	readonly type: 'structuralDiff';
	readonly node: StructuralDiffNode;
	readonly parent: ISCMResource | SCMStructuralDiffNode;
	readonly children: readonly SCMStructuralDiffNode[];
}

export interface SCMStructuralDiffStatus extends SCMStructuralDiffElementBase {
	readonly type: 'structuralDiffStatus';
	readonly status: 'incomplete' | 'error' | 'timedOut';
	readonly parent: ISCMResource;
}

export type SCMStructuralDiffElement = SCMStructuralDiffNode | SCMStructuralDiffStatus;

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
	return (element.node.modified ?? element.node.original)!.name;
}

export function getSCMStructuralDiffChange(element: SCMStructuralDiffElement): { readonly type: 'added' | 'deleted' | 'modified'; readonly label: string } | undefined {
	if (element.type === 'structuralDiffStatus') {
		return undefined;
	}
	if (!element.node.original) {
		return { type: 'added', label: localize('structuralDiff.added', "Added") };
	}
	if (!element.node.modified) {
		return { type: 'deleted', label: localize('structuralDiff.deleted', "Deleted") };
	}
	if (element.node.original.name !== element.node.modified.name
		|| element.node.originalChanges.length > 0 || element.node.modifiedChanges.length > 0) {
		return { type: 'modified', label: localize('structuralDiff.changed', "Changed") };
	}
	return undefined;
}

export function getSCMStructuralDiffChangeAnnotation(element: SCMStructuralDiffElement): { readonly label: string; readonly description: string } | undefined {
	if (element.type === 'structuralDiffStatus' || !element.node.original || !element.node.modified) {
		return undefined;
	}
	if (element.node.original.name !== element.node.modified.name) {
		return {
			label: localize('structuralDiff.renameAnnotation', "rename"),
			description: localize('structuralDiff.renamed', "Renamed from {0} to {1}", element.node.original.name, element.node.modified.name),
		};
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
	const details = (element.node.modified ?? element.node.original)!.detail;
	const status = getSCMStructuralDiffChangeAnnotation(element)?.description ?? getSCMStructuralDiffChange(element)?.label;
	return [status, details].filter(value => !!value).join(', ') || undefined;
}

export function getSCMStructuralDiffAriaLabel(element: SCMStructuralDiffElement): string {
	if (element.type === 'structuralDiffStatus') {
		return getSCMStructuralDiffLabel(element);
	}
	const entity = (element.node.modified ?? element.node.original)!;
	const description = getSCMStructuralDiffDescription(element);
	return description
		? localize('structuralDiff.ariaLabelWithDescription', "{0}, {1}, {2}", entity.name, symbolKindNames[entity.kind], description)
		: localize('structuralDiff.ariaLabel', "{0}, {1}", entity.name, symbolKindNames[entity.kind]);
}

class StructuralDiffEntry extends Disposable {
	readonly cancellation = this._register(new CancellationTokenSource());
	readonly listeners = this._register(new DisposableStore());
	readonly references = this._register(new DisposableStore());
	pending?: Promise<readonly SCMStructuralDiffElement[]>;
	children?: readonly SCMStructuralDiffElement[];
	disposed = false;
	timedOut = false;

	constructor(readonly resource: ISCMResource, readonly generation: number) {
		super();
	}

	releaseModels(): void {
		this.listeners.clear();
		this.references.clear();
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.cancellation.cancel();
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

	/** Whether any structural diff provider is registered, see {@link hasSCMStructuralDiffProvider}. */
	readonly hasProvider = observableFromEvent(this, this.languageFeaturesService.structuralDiffProvider.onDidChange, () => hasSCMStructuralDiffProvider(this.languageFeaturesService));

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
		if (this._store.isDisposed || !this.canProvide(resource)) {
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
		entry.pending ??= this.loadLimiter.queue(() => this.loadWithinBudget(entry));
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

	invalidateGroup(group: ISCMResourceGroup): void {
		for (const [resource] of this.entries) {
			if (resource.resourceGroup === group) {
				this.entries.deleteAndDispose(resource);
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

	clear(): void {
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
		if (!resource.multiDiffEditorOriginalUri || !modified
			|| !this.uriIdentityService.extUri.isEqual(modified, resource.sourceUri)) {
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

	private async resolveModel(entry: StructuralDiffEntry, resource: URI): Promise<ITextModel> {
		this.checkCancellation(entry);
		const reference = await this.textModelService.createModelReference(resource);
		if (entry.disposed || entry.cancellation.token.isCancellationRequested) {
			reference.dispose();
			throw new CancellationError();
		}
		entry.references.add(reference);
		return reference.object.textEditorModel;
	}

	/** Loads within the time budget, so a load that never completes cannot occupy one of the limited load slots forever. */
	private async loadWithinBudget(entry: StructuralDiffEntry): Promise<readonly SCMStructuralDiffElement[]> {
		const children = await raceTimeout(this.load(entry), MAX_LOAD_TIME_MS, () => {
			entry.timedOut = true;
			entry.cancellation.cancel();
		});
		return children ?? this.fail(entry, 'timedOut');
	}

	private async load(entry: StructuralDiffEntry): Promise<readonly SCMStructuralDiffElement[]> {
		const resource = entry.resource;
		try {
			const original = await this.resolveModel(entry, resource.multiDiffEditorOriginalUri!);
			const modified = await this.resolveModel(entry, resource.multiDiffEditorModifiedUri!);
			for (const model of new Set([original, modified])) {
				entry.listeners.add(model.onDidChangeContent(() => this.invalidate(entry)));
				entry.listeners.add(model.onWillDispose(() => this.invalidate(entry)));
			}
			const result = await getStructuralDiff(this.editorWorkerService, this.configurationService, this.languageFeaturesService.structuralDiffProvider, original, modified, entry.cancellation.token);
			this.checkCancellation(entry);
			const ids = new Set<string>();
			const wrap = (node: StructuralDiffNode, parent: ISCMResource | SCMStructuralDiffNode, order: number): SCMStructuralDiffNode => {
				if (typeof node.id !== 'string' || ids.has(node.id) || (!node.original && !node.modified)) {
					throw new Error('Invalid structural diff node identity');
				}
				ids.add(node.id);
				const children: SCMStructuralDiffNode[] = [];
				const element: SCMStructuralDiffNode = {
					type: 'structuralDiff', id: `${SCM_STRUCTURAL_DIFF_ID_PREFIX}${entry.generation}:node:${node.id}`,
					generation: entry.generation, resource, node, parent, order, children,
				};
				children.push(...node.children.map((child, index) => wrap(child, element, index)));
				return element;
			};
			const children: SCMStructuralDiffElement[] = result?.root.children.map((node, index) => wrap(node, resource, index)) ?? [];
			if (result?.isIncomplete) {
				children.push(this.createStatus(entry, 'incomplete', children.length));
			}
			entry.children = children;
			if (children.length === 0) {
				this._onDidChange.fire(resource);
			}
			return children;
		} catch (error) {
			if (entry.timedOut) {
				return [];
			}
			if (entry.disposed || isCancellationError(error)) {
				if (!entry.disposed) {
					this.entries.deleteAndDispose(resource);
				}
				return [];
			}
			if (error instanceof StructuralDiffTimeoutError) {
				this.logService.info('[SCM] Structural changes took too long to compute', resource.sourceUri, error.message);
				return this.fail(entry, 'timedOut');
			}
			this.logService.error('[SCM] Error loading structural changes', resource.sourceUri, error);
			return this.fail(entry, 'error');
		}
	}

	/** Releases the models and shows a status row instead of structural changes, until the entry is invalidated. */
	private fail(entry: StructuralDiffEntry, status: 'error' | 'timedOut'): readonly SCMStructuralDiffElement[] {
		if (entry.disposed) {
			return [];
		}
		entry.releaseModels();
		const children = [this.createStatus(entry, status, 0)];
		entry.children = children;
		return children;
	}

	private createStatus(entry: StructuralDiffEntry, status: SCMStructuralDiffStatus['status'], order: number): SCMStructuralDiffStatus {
		return {
			type: 'structuralDiffStatus', id: `${SCM_STRUCTURAL_DIFF_ID_PREFIX}${entry.generation}:status:${status}`,
			generation: entry.generation, resource: entry.resource, parent: entry.resource, order, status,
		};
	}
}
