/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { createTimeout, timeout } from '../../../../../base/common/async.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ComponentFixtureContext, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { createMultiDiffEditorFixtureDocuments, createMultiDiffEditorFixtureServices, createMultiDiffEditorFixtureWidget } from './multiDiffEditorFixtureUtils.js';

function renderMultiDiffEditor({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext): void {
	container.style.width = '800px';
	container.style.height = '600px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, new TestDiffProviderFactoryService());

	const textModels = disposableStackStore.add(new DisposableStore());
	const { doc1, doc2, doc3 } = createMultiDiffEditorFixtureDocuments(instantiationService, textModels);
	const widget = disposableStackStore.add(createMultiDiffEditorFixtureWidget(instantiationService, container));

	const model: IMultiDiffEditorModel = {
		documents: ValueWithChangeEvent.const([doc1, doc2, doc3]),
	};

	const viewModel = disposableStackStore.add(widget.createViewModel(model));
	widget.setViewModel(viewModel);
	widget.layout(new Dimension(800, 600));

	disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));
}

// A long unchanged prefix/suffix around a single change so `hideUnchangedRegions`
// collapses the surrounding context into "N hidden lines" widgets.
const UNCHANGED_BLOCK = Array.from({ length: 20 }, (_, i) => `const value${i} = ${i};`).join('\n');
const ORIGINAL_HIDDEN = `${UNCHANGED_BLOCK}\nconst changed = 'before';\n${UNCHANGED_BLOCK}`;
const MODIFIED_HIDDEN = `${UNCHANGED_BLOCK}\nconst changed = 'after';\nconst added = true;\n${UNCHANGED_BLOCK}`;

/**
 * Renders the multi-diff in inline view with `hideOriginalLineNumbers` (the
 * Agents window Changes editor configuration): the original line-number column
 * is dropped so the code sits flush left, while the full expandable
 * hidden-region widgets are still shown.
 */
function renderMultiDiffEditorHideOriginalLineNumbers({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext): void {
	container.style.width = '800px';
	container.style.height = '600px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, new TestDiffProviderFactoryService());

	const textModels = disposableStackStore.add(new DisposableStore());
	const original = textModels.add(createTextModel(instantiationService, ORIGINAL_HIDDEN, URI.parse('inmemory://original/settings.ts'), 'typescript'));
	const modified = textModels.add(createTextModel(instantiationService, MODIFIED_HIDDEN, URI.parse('inmemory://modified/settings.ts'), 'typescript'));
	const doc = RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original, modified }, { dispose() { } });

	const widget = disposableStackStore.add(createMultiDiffEditorFixtureWidget(instantiationService, container, {
		hideOriginalLineNumbers: true,
		hideUnchangedRegions: { enabled: true },
	}));
	// `hideOriginalLineNumbers` only affects the inline view.
	widget.setRenderSideBySide(false);

	const model: IMultiDiffEditorModel = {
		documents: ValueWithChangeEvent.const([doc]),
	};

	const viewModel = disposableStackStore.add(widget.createViewModel(model));
	widget.setViewModel(viewModel);
	widget.layout(new Dimension(800, 600));

	disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));
}

class DelayedDiffProviderFactoryService implements IDiffProviderFactoryService {
	declare readonly _serviceBrand: undefined;
	constructor(private readonly _delayMs: number) { }
	createDiffProvider(): IDocumentDiffProvider {
		return new DelayedDocumentDiffProvider(this._delayMs);
	}
}

class DelayedDocumentDiffProvider implements IDocumentDiffProvider {
	readonly onDidChange: Event<void> = () => toDisposable(() => { });
	constructor(private readonly _delayMs: number) { }

	async computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions, cancellationToken: CancellationToken): Promise<IDocumentDiff> {
		await timeout(this._delayMs, cancellationToken);
		if (cancellationToken.isCancellationRequested || original.isDisposed() || modified.isDisposed()) {
			return ({
				changes: [],
				quitEarly: true,
				identical: false,
				moves: [],

			});
		}
		const result = linesDiffComputers.getDefault().computeDiff(original.getLinesContent(), modified.getLinesContent(), options);
		return {
			changes: result.changes,
			quitEarly: result.hitTimeout,
			identical: original.getValue() === modified.getValue(),
			moves: result.moves,
		};
	}
}

function renderMultiDiffEditorIncrementalUpdate() {
	return ({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext) => {
		container.style.width = '800px';
		container.style.height = '600px';
		container.style.border = '1px solid var(--vscode-editorWidget-border)';

		// First file: sync diffs (already resolved). Files 2+3: 800ms delay.
		const delayedFactory = new DelayedDiffProviderFactoryService(800);
		const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, delayedFactory);

		const textModels = disposableStackStore.add(new DisposableStore());
		const { doc1, doc2, doc3 } = createMultiDiffEditorFixtureDocuments(instantiationService, textModels);
		const widget = disposableStackStore.add(createMultiDiffEditorFixtureWidget(instantiationService, container));

		// Start with only doc1 — its diff resolves immediately (800ms virtual)
		const documents = new ValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>([doc1]);
		const model: IMultiDiffEditorModel = { documents };
		const viewModel = disposableStackStore.add(widget.createViewModel(model));
		widget.setViewModel(viewModel);
		disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));

		widget.layout(new Dimension(800, 600));

		// At T=900ms: add doc2 and doc3. Their diffs take 800ms (resolve at T=1700ms).
		// The 1s gate means they appear at min(T=1700ms, T=1900ms) = T=1700ms.
		disposableStore.add(createTimeout(900, () => {
			documents.value = [doc1, doc2, doc3];
		}));
	};
}

function renderMultiDiffEditorDocumentSwap() {
	return ({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext) => {
		container.style.width = '800px';
		container.style.height = '600px';
		container.style.border = '1px solid var(--vscode-editorWidget-border)';

		const delayedFactory = new DelayedDiffProviderFactoryService(800);
		const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, delayedFactory);

		const textModels = disposableStackStore.add(new DisposableStore());
		const widget = disposableStackStore.add(createMultiDiffEditorFixtureWidget(instantiationService, container));

		const makeDoc = (origText: string, modText: string, name: string) => {
			const original = textModels.add(createTextModel(instantiationService, origText, URI.parse(`inmemory://original/${name}`), 'typescript'));
			const modified = textModels.add(createTextModel(instantiationService, modText, URI.parse(`inmemory://modified/${name}`), 'typescript'));
			return RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original, modified }, { dispose() { } });
		};

		// Each document has exactly one line change.
		const codeA_orig = 'const greeting = "hello";';
		const codeA_mod = 'const greeting = "hi";';
		const codeB_orig = 'const port = 3000;';
		const codeB_mod = 'const port = 8080;';
		const codeD_orig = 'const env = "development";';
		const codeD_mod = 'const env = "production";';

		const docA = makeDoc(codeA_orig, codeA_mod, 'greet.ts');
		const docB = makeDoc(codeB_orig, codeB_mod, 'config.ts');

		// Start with A and B
		const documents = new ValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>([docA, docB]);
		const model: IMultiDiffEditorModel = { documents };
		const viewModel = disposableStackStore.add(widget.createViewModel(model));
		widget.setViewModel(viewModel);
		widget.layout(new Dimension(800, 600));

		// At T=900ms: replace with A, C, D.
		// C has the same content as B but a different URI.
		// D is a new document.
		disposableStore.add(createTimeout(900, () => {
			const docC = makeDoc(codeB_orig, codeB_mod, 'config-v2.ts');
			const docD = makeDoc(codeD_orig, codeD_mod, 'server.ts');
			documents.value = [docA, docC, docD];
		}));

		disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));
	};
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	MultiDiffEditor: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderMultiDiffEditor(context),
	}),
	MultiDiffEditorHideOriginalLineNumbers: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderMultiDiffEditorHideOriginalLineNumbers(context),
	}),
	MultiDiffEditorIncrementalPending: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: true, durationMs: 1200 },
		render: renderMultiDiffEditorIncrementalUpdate(),
	}),
	MultiDiffEditorIncrementalResolved: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: true, durationMs: 2000 },
		render: renderMultiDiffEditorIncrementalUpdate(),
	}),
	MultiDiffEditorIncrementalResolvedRealtime: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: renderMultiDiffEditorIncrementalUpdate(),
	}),
	MultiDiffEditorDocumentSwapBefore: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: true, durationMs: 100 },
		render: renderMultiDiffEditorDocumentSwap(),
	}),
	MultiDiffEditorDocumentSwapAfter: defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { enabled: true, durationMs: 2000 },
		render: renderMultiDiffEditorDocumentSwap(),
	}),
	MultiDiffEditorDocumentSwapRealtime: defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		render: renderMultiDiffEditorDocumentSwap(),
	}),
});
