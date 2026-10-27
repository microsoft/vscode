/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, IDocumentDiffProviderOptions } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { StructuralDiff, StructuralDiffContext, StructuralDiffProvider, SymbolKind } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../editor/common/services/languageFeaturesService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISCMProvider, ISCMResource, ISCMResourceGroup } from '../../common/scm.js';
import { SCMStructuralDiffModel, getSCMStructuralDiffAriaLabel, getSCMStructuralDiffDescription, getSCMStructuralDiffLabel } from '../../common/scmStructuralDiff.js';

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
	blockOriginal?: DeferredPromise<void>;
	failModified = false;

	constructor(readonly original: ITextModel, readonly modified: ITextModel) { super(); }

	override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		this.requested.push(resource);
		const isOriginal = extUri.isEqual(resource, this.original.uri);
		if (isOriginal && this.blockOriginal) {
			await this.blockOriginal.p;
		}
		if (!isOriginal && this.failModified) {
			throw new Error('Cannot resolve modified model');
		}
		const model = isOriginal ? this.original : this.modified;
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
	let registration: { dispose(): void };
	let errors: number;
	let languageChanges: Emitter<{ model: ITextModel; oldLanguageId: string }>;

	setup(() => {
		original = store.add(createTextModel('class Calculator {\n\trun() { return 1; }\n}', undefined, undefined, URI.parse('git:/file.ts')));
		modified = store.add(createTextModel('class Calculator {\n\trun() { return 2; }\n}', undefined, undefined, URI.file('file.ts')));
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
		registration = store.add(features.structuralDiffProvider.register({ scheme: 'file', language: 'plaintext', pattern: '**/*.ts' }, provider));
		languageChanges = store.add(new Emitter<{ model: ITextModel; oldLanguageId: string }>());
		errors = 0;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(ITextModelService, resolver);
		instantiationService.set(ILanguageFeaturesService, features);
		instantiationService.set(IModelService, new class extends mock<IModelService>() {
			override readonly onModelLanguageChanged = languageChanges.event;
			override getModel(): ITextModel | null { return null; }
		});
		instantiationService.set(ILanguageService, new class extends mock<ILanguageService>() {
			override readonly onDidChange = Event.None;
			override guessLanguageIdByFilepathOrFirstLine(): string { return 'plaintext'; }
		});
		instantiationService.set(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		});
		instantiationService.set(ILogService, new class extends NullLogService {
			override error(): void { errors++; }
		});
		instantiationService.set(IEditorWorkerService, new class extends mock<IEditorWorkerService>() {
			override async computeDiff(_original: URI, _modified: URI, options: IDocumentDiffProviderOptions): Promise<IDocumentDiff> {
				const result = linesDiffComputers.getDefault().computeDiff(original.getLinesContent(), modified.getLinesContent(), options);
				return { identical: false, quitEarly: result.hitTimeout, changes: result.changes, moves: result.moves };
			}
		});
		model = store.add(instantiationService.createInstance(SCMStructuralDiffModel));
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

	test('checks eligibility without loading models or invoking providers', () => {
		assert.deepStrictEqual({
			supported: model.hasChildren(resource),
			unsupported: model.hasChildren(new TestResource(group, URI.file('notes.md'), original.uri, URI.file('notes.md'))),
			staged: model.hasChildren(new TestResource(group, modified.uri, original.uri, URI.parse('git:/index.ts'))),
			added: model.hasChildren(new TestResource(group, modified.uri, undefined, modified.uri)),
			deleted: model.hasChildren(new TestResource(group, modified.uri, original.uri, undefined)),
			requests: resolver.requested, calls: provider.calls,
		}, { supported: true, unsupported: false, staged: false, added: false, deleted: false, requests: [], calls: 0 });
	});

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
		const children = await model.getChildren(resource);
		assert.deepStrictEqual({ labels: children.map(getSCMStructuralDiffLabel), errors }, { labels: ['Unable to load structural changes'], errors: 1 });
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
});
