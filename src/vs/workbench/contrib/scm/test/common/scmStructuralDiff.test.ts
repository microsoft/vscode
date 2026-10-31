/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, IDocumentDiffProviderOptions } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { StructuralDiff, StructuralDiffClassification, StructuralDiffContext, StructuralDiffProvider, SymbolKind } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../editor/common/services/languageFeaturesService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISCMProvider, ISCMResource, ISCMResourceGroup } from '../../common/scm.js';
import { SCMStructuralDiffModel, getSCMStructuralDiffAriaLabel, getSCMStructuralDiffChange, getSCMStructuralDiffChangeAnnotation, getSCMStructuralDiffDescription, getSCMStructuralDiffLabel } from '../../common/scmStructuralDiff.js';

class TestResource extends mock<ISCMResource>() {
	constructor(
		override readonly resourceGroup: ISCMResourceGroup,
		override readonly sourceUri: URI,
		override readonly multiDiffEditorOriginalUri: URI | undefined,
		override readonly multiDiffEditorModifiedUri: URI | undefined,
	) { super(); }
}

class TestResolver extends mock<ITextModelService>() {
	readonly requested: URI[] = [];
	readonly released: URI[] = [];
	readonly additionalModels: ITextModel[] = [];
	blockOriginal?: DeferredPromise<void>;
	failModified = false;

	constructor(readonly original: ITextModel, readonly modified: ITextModel) { super(); }

	getModel(resource: URI): ITextModel {
		const model = [this.original, this.modified, ...this.additionalModels].find(model => extUri.isEqual(resource, model.uri));
		assert.ok(model, `Unexpected model reference: ${resource}`);
		return model;
	}

	override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		this.requested.push(resource);
		const isOriginal = extUri.isEqual(resource, this.original.uri);
		if (isOriginal && this.blockOriginal) {
			await this.blockOriginal.p;
		}
		if (!isOriginal && this.failModified) {
			throw new Error('Cannot resolve modified model');
		}
		const model = this.getModel(resource);
		return {
			object: new class extends mock<IResolvedTextEditorModel>() {
				override readonly textEditorModel = model;
			},
			dispose: () => this.released.push(resource),
		};
	}
}

class TestProvider implements StructuralDiffProvider {
	result: StructuralDiff | undefined;
	pending?: DeferredPromise<StructuralDiff | undefined>;
	started?: DeferredPromise<CancellationToken>;
	calls = 0;
	original?: ITextModel;
	modified?: ITextModel;
	context?: StructuralDiffContext;

	async provideStructuralDiff(original: ITextModel, modified: ITextModel, context: StructuralDiffContext, token: CancellationToken): Promise<StructuralDiff | undefined> {
		this.calls++;
		this.original = original;
		this.modified = modified;
		this.context = context;
		this.started?.complete(token);
		return this.pending?.p ?? this.result;
	}
}

suite('SCM structural diff model', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let original: ITextModel;
	let modified: ITextModel;
	let resource: ISCMResource;
	let group: ISCMResourceGroup;
	let resolver: TestResolver;
	let provider: TestProvider;
	let features: LanguageFeaturesService;
	let model: SCMStructuralDiffModel;
	let instantiationService: TestInstantiationService;
	let registration: { dispose(): void };
	let errors: number;
	let maxComputationTimeSetting: unknown;
	let textDiffTimedOut: boolean;
	let textDiffTimeBudgets: number[];
	let languageChanges: Emitter<{ model: ITextModel; oldLanguageId: string }>;
	let languageRegistryChanges: Emitter<void>;

	setup(() => {
		const fileUri = URI.file('file.ts');
		original = store.add(createTextModel('class Calculator {\n\trun() { return 1; }\n}', undefined, undefined, fileUri.with({ scheme: 'git', query: JSON.stringify({ path: fileUri.fsPath, ref: '' }) })));
		modified = store.add(createTextModel('class Calculator {\n\trun() { return 2; }\n}', undefined, undefined, fileUri));
		const scmProvider = new class extends mock<ISCMProvider>() {
			override readonly id = 'test';
		};
		group = new class extends mock<ISCMResourceGroup>() {
			override readonly provider = scmProvider;
			override readonly id = 'workingTree';
		};
		resource = new TestResource(group, modified.uri, original.uri, modified.uri);
		resolver = new TestResolver(original, modified);
		features = new LanguageFeaturesService();
		provider = new TestProvider();
		provider.result = createResult();
		registration = store.add(features.structuralDiffProvider.register([
			{ scheme: 'file', language: 'plaintext', pattern: '**/*.ts' },
			{ scheme: 'git', language: 'plaintext', pattern: '**/*.ts' },
		], provider));
		languageChanges = store.add(new Emitter<{ model: ITextModel; oldLanguageId: string }>());
		languageRegistryChanges = store.add(new Emitter<void>());
		errors = 0;
		maxComputationTimeSetting = undefined;
		textDiffTimedOut = false;
		textDiffTimeBudgets = [];
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(ITextModelService, resolver);
		instantiationService.set(ILanguageFeaturesService, features);
		instantiationService.set(IModelService, new class extends mock<IModelService>() {
			override readonly onModelLanguageChanged = languageChanges.event;
			override getModel(): ITextModel | null { return null; }
		});
		instantiationService.set(ILanguageService, new class extends mock<ILanguageService>() {
			override readonly onDidChange = languageRegistryChanges.event;
			override guessLanguageIdByFilepathOrFirstLine(): string { return 'plaintext'; }
		});
		instantiationService.set(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		});
		instantiationService.set(ILogService, new class extends NullLogService {
			override error(): void { errors++; }
		});
		instantiationService.set(ITextResourceConfigurationService, new class extends mock<ITextResourceConfigurationService>() {
			override getValue<T>(): T { return maxComputationTimeSetting as T; }
		});
		instantiationService.set(IEditorWorkerService, new class extends mock<IEditorWorkerService>() {
			override async computeDiff(originalUri: URI, modifiedUri: URI, options: IDocumentDiffProviderOptions): Promise<IDocumentDiff> {
				textDiffTimeBudgets.push(options.maxComputationTimeMs);
				const result = linesDiffComputers.getDefault().computeDiff(resolver.getModel(originalUri).getLinesContent(), resolver.getModel(modifiedUri).getLinesContent(), options);
				return { identical: false, quitEarly: textDiffTimedOut || result.hitTimeout, changes: result.changes, moves: result.moves };
			}
		});
		model = store.add(instantiationService.createInstance(SCMStructuralDiffModel));
		model.setEnabled(true);
	});

	function createResult(): StructuralDiff {
		const originalEntity = { name: 'Calculator', kind: SymbolKind.Class, range: original.getFullModelRange() };
		const modifiedEntity = { name: 'Calculator', kind: SymbolKind.Class, range: modified.getFullModelRange() };
		return {
			root: {
				id: 'file', original: { ...originalEntity, kind: SymbolKind.File }, modified: { ...modifiedEntity, kind: SymbolKind.File },
				originalChanges: [], modifiedChanges: [],
				children: [{
					id: 'class', original: originalEntity, modified: modifiedEntity, originalChanges: [], modifiedChanges: [],
					children: [{
						id: 'method',
						original: { name: 'run', kind: SymbolKind.Method, range: new Range(2, 1, 2, original.getLineMaxColumn(2)), selectionRange: new Range(2, 2, 2, 5) },
						modified: { name: 'run', kind: SymbolKind.Method, range: new Range(2, 1, 2, modified.getLineMaxColumn(2)), selectionRange: new Range(2, 2, 2, 5) },
						originalChanges: [], modifiedChanges: [], children: [],
					}],
				}],
			},
			isIncomplete: false,
		};
	}

	function createStagedResource(): { staged: ISCMResource; head: ITextModel } {
		const head = store.add(createTextModel('class Calculator {\n\trun() { return 0; }\n}', undefined, undefined, original.uri.with({ query: JSON.stringify({ path: modified.uri.fsPath, ref: 'HEAD' }) })));
		resolver.additionalModels.push(head);
		const stagedGroup = new class extends mock<ISCMResourceGroup>() {
			override readonly provider = group.provider;
			override readonly id = 'index';
		};
		return { staged: new TestResource(stagedGroup, modified.uri, head.uri, original.uri), head };
	}

	test('checks eligibility without loading models or invoking providers', () => {
		assert.deepStrictEqual({
			supported: model.hasChildren(resource),
			unsupported: model.hasChildren(new TestResource(group, URI.file('notes.md'), original.uri, URI.file('notes.md'))),
			staged: model.hasChildren(new TestResource(group, modified.uri, original.uri, URI.parse('git:/index.ts'))),
			added: model.hasChildren(new TestResource(group, modified.uri, undefined, modified.uri)),
			deleted: model.hasChildren(new TestResource(group, modified.uri, original.uri, undefined)),
			requests: resolver.requested, calls: provider.calls,
		}, { supported: true, unsupported: false, staged: true, added: false, deleted: false, requests: [], calls: 0 });
	});

	test('does not offer staged structural changes when the provider only supports working files', () => {
		const { staged } = createStagedResource();
		registration.dispose();
		store.add(features.structuralDiffProvider.register({ scheme: 'file', language: 'plaintext' }, provider));
		assert.deepStrictEqual({
			staged: model.hasChildren(staged), workingTree: model.hasChildren(resource),
			requests: resolver.requested, calls: provider.calls,
		}, { staged: false, workingTree: true, requests: [], calls: 0 });
	});

	test('keeps partially staged and working-tree comparisons separate for the same file', async () => {
		const { staged, head } = createStagedResource();
		const stagedChildren = await model.getChildren(staged);
		const stagedInputs = [provider.original?.uri, provider.modified?.uri];
		const stagedChanges = provider.context?.changes.map(change => [head.getValueInRange(change.originalRange), original.getValueInRange(change.modifiedRange)]);
		const workingChildren = await model.getChildren(resource);
		const workingInputs = [provider.original?.uri, provider.modified?.uri];
		const workingChanges = provider.context?.changes.map(change => [original.getValueInRange(change.originalRange), modified.getValueInRange(change.modifiedRange)]);
		modified.setValue('class Calculator {\n\trun() { return 3; }\n}');
		assert.deepStrictEqual({
			stagedInputs, workingInputs, stagedChanges, workingChanges,
			requests: resolver.requested, calls: provider.calls,
			distinctIds: stagedChildren[0].id !== workingChildren[0].id,
			stagedStillCurrent: model.isCurrent(stagedChildren[0]),
			workingStillCurrent: model.isCurrent(workingChildren[0]),
			stagedStillCached: await model.getChildren(staged) === stagedChildren,
		}, {
			stagedInputs: [head.uri, original.uri], workingInputs: [original.uri, modified.uri],
			stagedChanges: [['0', '1']], workingChanges: [['1', '2']],
			requests: [head.uri, original.uri, original.uri, modified.uri], calls: 2,
			distinctIds: true, stagedStillCurrent: true, workingStillCurrent: false, stagedStillCached: true,
		});
	});

	for (const changed of ['HEAD', 'index', 'group'] as const) {
		test(`invalidates staged results when ${changed} changes`, async () => {
			const { staged, head } = createStagedResource();
			const stagedChildren = await model.getChildren(staged);
			const workingChildren = await model.getChildren(resource);
			if (changed === 'HEAD') {
				head.setValue('class Calculator {\n\trun() { return 4; }\n}');
			} else if (changed === 'index') {
				original.setValue('class Calculator {\n\trun() { return 3; }\n}');
			} else {
				model.invalidateGroup(staged.resourceGroup);
			}
			const current = { staged: model.isCurrent(stagedChildren[0]), workingTree: model.isCurrent(workingChildren[0]) };
			const refreshed = await model.getChildren(staged);
			assert.deepStrictEqual({
				current, calls: provider.calls,
				newIdentity: refreshed[0].id !== stagedChildren[0].id,
				refreshedCurrent: model.isCurrent(refreshed[0]),
				inputs: [provider.original?.getValue(), provider.modified?.getValue()],
			}, {
				current: { staged: false, workingTree: changed !== 'index' }, calls: 3,
				newIdentity: true, refreshedCurrent: true,
				inputs: [head.getValue(), original.getValue()],
			});
		});
	}

	test('loads lazily, coalesces requests and wraps the returned hierarchy beneath the file', async () => {
		const first = model.getChildren(resource);
		const second = model.getChildren(resource);
		assert.strictEqual(first, second);
		const children = await first;
		const child = children[0];
		assert.ok(child.type === 'structuralDiff');
		assert.deepStrictEqual({
			labels: [getSCMStructuralDiffLabel(child), getSCMStructuralDiffLabel(child.children[0])],
			parentIsFile: child.parent === resource,
			nestedParent: child.children[0].parent === child,
			current: children.every(child => model.isCurrent(child)),
			requests: resolver.requested, calls: provider.calls,
			original: provider.original, modified: provider.modified,
			cached: await model.getChildren(resource) === children,
		}, {
			labels: ['Calculator', 'run'], parentIsFile: true, nestedParent: true, current: true,
			requests: [original.uri, modified.uri], calls: 1, original, modified, cached: true,
		});
	});

	test('does not resolve unsupported resources', async () => {
		registration.dispose();
		assert.deepStrictEqual({ children: await model.getChildren(resource), requests: resolver.requested }, { children: [], requests: [] });
	});

	test('starts disabled without resolving models or calling providers', async () => {
		const disabledModel = store.add(instantiationService.createInstance(SCMStructuralDiffModel));
		assert.deepStrictEqual({
			enabled: disabledModel.enabled,
			expandable: disabledModel.hasChildren(resource),
			children: await disabledModel.getChildren(resource),
			requests: resolver.requested,
			calls: provider.calls,
		}, { enabled: false, expandable: false, children: [], requests: [], calls: 0 });
	});

	test('disabling clears cached children and re-enabling loads a fresh result', async () => {
		const previous = await model.getChildren(resource);
		const changes: (ISCMResource | undefined)[] = [];
		store.add(model.onDidChange(resource => changes.push(resource)));
		model.setEnabled(false);
		const disabled = {
			expandable: model.hasChildren(resource),
			children: await model.getChildren(resource),
			current: model.isCurrent(previous[0]),
			released: resolver.released.slice(),
			calls: provider.calls,
		};
		model.setEnabled(true);
		const next = await model.getChildren(resource);
		assert.deepStrictEqual({
			disabled,
			enabled: model.enabled,
			newIdentity: next[0].id !== previous[0].id,
			current: model.isCurrent(next[0]),
			calls: provider.calls,
			changes,
		}, {
			disabled: { expandable: false, children: [], current: false, released: [original.uri, modified.uri], calls: 1 },
			enabled: true, newIdentity: true, current: true, calls: 2, changes: [undefined, undefined],
		});
	});

	test('disabling cancels an in-flight provider and discards its late result', async () => {
		provider.pending = new DeferredPromise<StructuralDiff | undefined>();
		provider.started = new DeferredPromise<CancellationToken>();
		const pending = model.getChildren(resource);
		const token = await provider.started.p;
		model.setEnabled(false);
		const children = await pending;
		await provider.pending.complete(provider.result);
		assert.deepStrictEqual({
			cancelled: token.isCancellationRequested,
			children,
			expandable: model.hasChildren(resource),
			released: resolver.released,
			calls: provider.calls,
		}, { cancelled: true, children: [], expandable: false, released: [original.uri, modified.uri], calls: 1 });
	});

	test('setting the current enabled state does not clear results or refresh the tree', async () => {
		const children = await model.getChildren(resource);
		const changes: (ISCMResource | undefined)[] = [];
		store.add(model.onDidChange(resource => changes.push(resource)));
		model.setEnabled(true);
		assert.deepStrictEqual({
			current: model.isCurrent(children[0]), released: resolver.released, changes,
		}, { current: true, released: [], changes: [] });
	});

	for (const invalidate of ['release', 'group', 'provider', 'clear'] as const) {
		test(`disposes model references and result identities on ${invalidate}`, async () => {
			const children = await model.getChildren(resource);
			switch (invalidate) {
				case 'release': model.release(resource); break;
				case 'group': model.invalidateGroup(group); break;
				case 'provider': model.invalidateProvider(group.provider); break;
				case 'clear': model.clear(); break;
			}
			const previousIsCurrent = model.isCurrent(children[0]);
			const next = await model.getChildren(resource);
			assert.deepStrictEqual({
				previousIsCurrent,
				differentId: next[0].id !== children[0].id,
				current: model.isCurrent(next[0]),
				released: resolver.released,
				calls: provider.calls,
			}, { previousIsCurrent: false, differentId: true, current: true, released: [original.uri, modified.uri], calls: 2 });
		});
	}

	test('updates availability when providers are removed and registered', async () => {
		const children = await model.getChildren(resource);
		registration.dispose();
		const removed = { expandable: model.hasChildren(resource), current: model.isCurrent(children[0]) };
		store.add(features.structuralDiffProvider.register({ scheme: 'file' }, provider));
		assert.deepStrictEqual({ removed, added: model.hasChildren(resource), released: resolver.released }, {
			removed: { expandable: false, current: false }, added: true, released: [original.uri, modified.uri],
		});
	});

	test('watches empty results so later edits can introduce structural children', async () => {
		provider.result = { ...createResult(), root: { ...createResult().root, children: [] } };
		const children = await model.getChildren(resource);
		const empty = { children, expandable: model.hasChildren(resource) };
		modified.setValue('class Changed {}');
		assert.deepStrictEqual({ empty, expandableAfterEdit: model.hasChildren(resource), released: resolver.released }, {
			empty: { children: [], expandable: false }, expandableAfterEdit: true, released: [original.uri, modified.uri],
		});
	});

	test('cancels stale requests and never publishes their result', async () => {
		provider.pending = new DeferredPromise<StructuralDiff | undefined>();
		provider.started = new DeferredPromise<CancellationToken>();
		const pending = model.getChildren(resource);
		const token = await provider.started.p;
		modified.setValue('class Changed {}');
		const children = await pending;
		await provider.pending.complete(provider.result);
		assert.deepStrictEqual({ children, cancelled: token.isCancellationRequested, released: resolver.released }, {
			children: [], cancelled: true, released: [original.uri, modified.uri],
		});
	});

	test('disposes late model references after the view is cleared', async () => {
		resolver.blockOriginal = new DeferredPromise<void>();
		const pending = model.getChildren(resource);
		model.clear();
		await resolver.blockOriginal.complete();
		assert.deepStrictEqual({
			children: await pending, requested: resolver.requested, released: resolver.released, calls: provider.calls,
		}, { children: [], requested: [original.uri], released: [original.uri], calls: 0 });
	});

	test('surfaces resolution errors as a status row and releases acquired models', async () => {
		resolver.failModified = true;
		const children = await model.getChildren(resource);
		assert.deepStrictEqual({
			labels: children.map(getSCMStructuralDiffLabel), errors, released: resolver.released, expandable: model.hasChildren(resource),
		}, { labels: ['Unable to load structural changes'], errors: 1, released: [original.uri], expandable: true });
	});

	test('preserves partial results and shows their incomplete status', async () => {
		provider.result = { ...createResult(), isIncomplete: true };
		const children = await model.getChildren(resource);
		assert.deepStrictEqual(children.map(child => [getSCMStructuralDiffLabel(child), child.order]), [
			['Calculator', 0], ['Partial structural changes', 1],
		]);
	});

	test('rejects duplicate node identities rather than corrupting the tree', async () => {
		const result = createResult();
		provider.result = { ...result, root: { ...result.root, children: [...result.root.children, ...result.root.children] } };
		const reported: string[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error.message));
		try {
			const children = await model.getChildren(resource);
			assert.deepStrictEqual({ labels: children.map(getSCMStructuralDiffLabel), reported, errors }, {
				labels: [], reported: [`Invalid structural diff: node 'class' must have an identifier that is unique within the result`], errors: 0,
			});
		} finally {
			setUnexpectedErrorHandler(previousHandler);
		}
	});

	test('describes deleted entities without relying on color', async () => {
		const result = createResult();
		const node = result.root.children[0];
		provider.result = { ...result, root: { ...result.root, children: [{ ...node, modified: undefined, children: [] }] } };
		const child = (await model.getChildren(resource))[0];
		assert.deepStrictEqual({
			label: getSCMStructuralDiffLabel(child), description: getSCMStructuralDiffDescription(child), aria: getSCMStructuralDiffAriaLabel(child),
		}, { label: 'Calculator', description: 'Deleted', aria: 'Calculator, class, Deleted' });
	});

	test('distinguishes direct changes from unchanged ancestor containers', async () => {
		const element = (await model.getChildren(resource))[0];
		assert.ok(element.type === 'structuralDiff');
		const change = { textChangeIndex: 0, range: new Range(2, 2, 2, 5), classification: StructuralDiffClassification.Implementation };
		const candidates = [
			element,
			{ ...element, node: { ...element.node, original: undefined } },
			{ ...element, node: { ...element.node, modified: undefined } },
			{ ...element, node: { ...element.node, originalChanges: [change] } },
			{ ...element, node: { ...element.node, modifiedChanges: [change] } },
		];
		assert.deepStrictEqual(candidates.map(candidate => ({
			change: getSCMStructuralDiffChange(candidate),
			description: getSCMStructuralDiffDescription(candidate),
			aria: getSCMStructuralDiffAriaLabel(candidate),
		})), [
			{ change: undefined, description: undefined, aria: 'Calculator, class' },
			{ change: { type: 'added', label: 'Added' }, description: 'Added', aria: 'Calculator, class, Added' },
			{ change: { type: 'deleted', label: 'Deleted' }, description: 'Deleted', aria: 'Calculator, class, Deleted' },
			{ change: { type: 'modified', label: 'Changed' }, description: 'Implementation changed', aria: 'Calculator, class, Implementation changed' },
			{ change: { type: 'modified', label: 'Changed' }, description: 'Implementation changed', aria: 'Calculator, class, Implementation changed' },
		]);
	});

	test('summarizes declaration and implementation changes from both snapshots', async () => {
		const element = (await model.getChildren(resource))[0];
		assert.ok(element.type === 'structuralDiff');
		const withChanges = (original: StructuralDiffClassification[], modified: StructuralDiffClassification[]) => ({
			...element,
			node: {
				...element.node,
				originalChanges: original.map(classification => ({ textChangeIndex: 0, range: new Range(2, 2, 2, 5), classification })),
				modifiedChanges: modified.map(classification => ({ textChangeIndex: 0, range: new Range(2, 2, 2, 5), classification })),
			},
		});
		const candidates = [
			withChanges([StructuralDiffClassification.Header], []),
			withChanges([], [StructuralDiffClassification.Header]),
			withChanges([StructuralDiffClassification.Implementation], []),
			withChanges([], [StructuralDiffClassification.Implementation]),
			withChanges([StructuralDiffClassification.Header], [StructuralDiffClassification.Implementation]),
			withChanges([StructuralDiffClassification.Implementation], [StructuralDiffClassification.Header]),
			withChanges([StructuralDiffClassification.Dependency], [StructuralDiffClassification.Other]),
			element,
			{ ...element, node: { ...withChanges([], [StructuralDiffClassification.Header]).node, original: undefined } },
			{ ...element, node: { ...withChanges([StructuralDiffClassification.Implementation], []).node, modified: undefined } },
		];
		assert.deepStrictEqual(candidates.map(getSCMStructuralDiffChangeAnnotation), [
			{ label: 'decl', description: 'Declaration changed' },
			{ label: 'decl', description: 'Declaration changed' },
			{ label: 'impl', description: 'Implementation changed' },
			{ label: 'impl', description: 'Implementation changed' },
			{ label: 'decl+impl', description: 'Declaration and implementation changed' },
			{ label: 'decl+impl', description: 'Declaration and implementation changed' },
			undefined, undefined, undefined, undefined,
		]);
	});

	test('represents paired entities with different names as renamed modifications', async () => {
		const element = (await model.getChildren(resource))[0];
		assert.ok(element.type === 'structuralDiff');
		const renamed = {
			...element,
			node: { ...element.node, modified: { ...element.node.modified!, name: 'RenamedCalculator' } },
		};
		const candidates = [
			renamed,
			{
				...renamed,
				node: {
					...renamed.node,
					modifiedChanges: [{ textChangeIndex: 0, range: new Range(1, 7, 1, 24), classification: StructuralDiffClassification.Header }],
				},
			},
		];
		assert.deepStrictEqual(candidates.map(candidate => ({
			name: getSCMStructuralDiffLabel(candidate),
			change: getSCMStructuralDiffChange(candidate),
			annotation: getSCMStructuralDiffChangeAnnotation(candidate),
			description: getSCMStructuralDiffDescription(candidate),
			aria: getSCMStructuralDiffAriaLabel(candidate),
		})), candidates.map(() => ({
			name: 'RenamedCalculator',
			change: { type: 'modified', label: 'Changed' },
			annotation: { label: 'rename', description: 'Renamed from Calculator to RenamedCalculator' },
			description: 'Renamed from Calculator to RenamedCalculator',
			aria: 'RenamedCalculator, class, Renamed from Calculator to RenamedCalculator',
		})));
	});

	test('invalidates results when the model language changes', async () => {
		const children = await model.getChildren(resource);
		languageChanges.fire({ model: modified, oldLanguageId: 'plaintext' });
		assert.deepStrictEqual({ current: model.isCurrent(children[0]), released: resolver.released }, { current: false, released: [original.uri, modified.uri] });
	});

	test('keeps cached results when an unrelated model changes language', async () => {
		const children = await model.getChildren(resource);
		const unrelated = store.add(createTextModel('', undefined, undefined, URI.file('unrelated.txt')));
		languageChanges.fire({ model: unrelated, oldLanguageId: 'plaintext' });
		await model.getChildren(resource);
		assert.deepStrictEqual({ current: model.isCurrent(children[0]), released: resolver.released, calls: provider.calls }, { current: true, released: [], calls: 1 });
	});

	test('reports provider availability regardless of the languages providers support', () => {
		const available: boolean[] = [];
		store.add(autorun(reader => available.push(model.hasProvider.read(reader))));
		registration.dispose();
		const python = features.structuralDiffProvider.register({ language: 'python' }, provider);
		const expandableForOtherLanguage = model.hasChildren(resource);
		const rust = features.structuralDiffProvider.register({ pattern: '**/*.rs' }, provider);
		python.dispose();
		rust.dispose();
		assert.deepStrictEqual({ available, expandableForOtherLanguage }, { available: [true, false, true, false], expandableForOtherLanguage: false });
	});

	test('ignores provider and language changes while disabled', () => {
		model.setEnabled(false);
		const changes: (ISCMResource | undefined)[] = [];
		store.add(model.onDidChange(resource => changes.push(resource)));
		registration.dispose();
		store.add(features.structuralDiffProvider.register({ scheme: 'file' }, provider));
		languageChanges.fire({ model: modified, oldLanguageId: 'plaintext' });
		languageRegistryChanges.fire();
		assert.deepStrictEqual(changes, []);
	});

	test('refreshes for language changes only while a provider is registered', () => {
		const changes: (ISCMResource | undefined)[] = [];
		store.add(model.onDidChange(resource => changes.push(resource)));
		const refreshes: number[] = [];
		const step = (action: () => void) => {
			action();
			refreshes.push(changes.length);
		};
		step(() => languageChanges.fire({ model: modified, oldLanguageId: 'plaintext' }));
		step(() => languageRegistryChanges.fire());
		step(() => registration.dispose());
		step(() => languageChanges.fire({ model: modified, oldLanguageId: 'plaintext' }));
		step(() => languageRegistryChanges.fire());
		// Cumulative tree refreshes: both language events with a provider, its removal, then both language events again without one.
		assert.deepStrictEqual(refreshes, [1, 2, 3, 3, 3]);
	});

	function createResources(count: number): ISCMResource[] {
		return Array.from({ length: count }, (_, index) => {
			const uri = URI.file(`file${index}.ts`);
			resolver.additionalModels.push(store.add(createTextModel(modified.getValue(), undefined, undefined, uri)));
			return new TestResource(group, uri, original.uri, uri);
		});
	}

	test('analyzes only a few files at a time and queues the rest', async () => {
		provider.pending = new DeferredPromise<StructuralDiff | undefined>();
		const loads = createResources(5).map(file => model.getChildren(file));
		await timeout(0);
		const started = provider.calls;
		await provider.pending.complete(provider.result);
		const loaded = (await Promise.all(loads)).map(children => children.length);
		assert.deepStrictEqual({ started, calls: provider.calls, loaded }, { started: 3, calls: 5, loaded: [1, 1, 1, 1, 1] });
	});

	test('skips queued files that were collapsed before their turn', async () => {
		provider.pending = new DeferredPromise<StructuralDiff | undefined>();
		const files = createResources(4);
		const loads = files.map(file => model.getChildren(file));
		await timeout(0);
		model.release(files[3]);
		await provider.pending.complete(provider.result);
		const loaded = (await Promise.all(loads)).map(children => children.length);
		assert.deepStrictEqual({ calls: provider.calls, loaded }, { calls: 3, loaded: [1, 1, 1, 0] });
	});

	test('shows a status row and stops the provider when loading takes too long', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		provider.pending = new DeferredPromise<StructuralDiff | undefined>();
		provider.started = new DeferredPromise<CancellationToken>();
		const start = Date.now();
		const children = await model.getChildren(resource);
		const token = await provider.started.p;
		assert.deepStrictEqual({
			labels: children.map(getSCMStructuralDiffLabel),
			elapsed: Date.now() - start,
			providerCancelled: token.isCancellationRequested,
			released: resolver.released,
			cached: await model.getChildren(resource) === children,
			calls: provider.calls,
			errors,
		}, {
			labels: ['Structural changes took too long to load'], elapsed: 30000, providerCancelled: true,
			released: [original.uri, modified.uri], cached: true, calls: 1, errors: 0,
		});
	}));

	test('shows a status row, not an error, when the text diff exceeds its time budget', async () => {
		textDiffTimedOut = true;
		maxComputationTimeSetting = 1234;
		const children = await model.getChildren(resource);
		assert.deepStrictEqual({
			labels: children.map(getSCMStructuralDiffLabel), errors, calls: provider.calls, budgets: textDiffTimeBudgets, released: resolver.released,
		}, {
			labels: ['Structural changes took too long to load'], errors: 0, calls: 0, budgets: [1234], released: [original.uri, modified.uri],
		});
	});
});
