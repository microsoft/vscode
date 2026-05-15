/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { createTimeout, timeout } from '../../../../../base/common/async.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IResourceLabel as IMultiDiffResourceLabel, IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService, IWorkspace } from '../../../../../platform/workspace/common/workspace.js';
import { ResourceLabel } from '../../../../browser/labels.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

class FixtureWorkbenchUIElementFactory implements IWorkbenchUIElementFactory {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IMultiDiffResourceLabel {
		const label = this._instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri(uri, options = {}) {
				if (!uri) {
					label.element.clear();
				} else {
					label.element.setFile(uri, { strikethrough: options.strikethrough });
				}
			},
			dispose() {
				label.dispose();
			}
		};
	}
}

const ORIGINAL_CODE_1 = `function greet(name: string): string {
	return 'Hello, ' + name;
}

function main() {
	console.log(greet('World'));
}`;

const MODIFIED_CODE_1 = `function greet(name: string, greeting = 'Hello'): string {
	return \`\${greeting}, \${name}!\`;
}

function farewell(name: string): string {
	return \`Goodbye, \${name}!\`;
}

function main() {
	console.log(greet('World'));
	console.log(farewell('World'));
}`;

const ORIGINAL_CODE_2 = `export interface Config {
	host: string;
	port: number;
}

export const defaultConfig: Config = {
	host: 'localhost',
	port: 3000,
};`;

const MODIFIED_CODE_2 = `export interface Config {
	host: string;
	port: number;
	secure: boolean;
	timeout: number;
}

export const defaultConfig: Config = {
	host: 'localhost',
	port: 8080,
	secure: true,
	timeout: 30000,
};`;

const ORIGINAL_CODE_3 = `import { Config } from './config';

export function createServer(config: Config) {
	return { config };
}`;

const MODIFIED_CODE_3 = `import { Config } from './config';

export function createServer(config: Config) {
	const { host, port, secure } = config;
	const protocol = secure ? 'https' : 'http';
	console.log(\`Starting server at \${protocol}://\${host}:\${port}\`);
	return { config, url: \`\${protocol}://\${host}:\${port}\` };
}`;

function renderMultiDiffEditor({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext): void {
	container.style.width = '800px';
	container.style.height = '600px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createCommonServices(disposableStore, theme, new TestDiffProviderFactoryService());

	const textModels = disposableStackStore.add(new DisposableStore());
	const { doc1, doc2, doc3 } = createDocuments(instantiationService, textModels);
	const widget = disposableStackStore.add(createWidget(instantiationService, container));

	const model: IMultiDiffEditorModel = {
		documents: ValueWithChangeEvent.const([doc1, doc2, doc3]),
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

function createCommonServices(disposableStore: DisposableStore, theme: ComponentFixtureContext['theme'], diffProviderFactory: IDiffProviderFactoryService) {
	return createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			reg.defineInstance(IDiffProviderFactoryService, diffProviderFactory);
			reg.definePartialInstance(IEditorProgressService, {
				show: () => ({ total: () => { }, worked: () => { }, done: () => { } }),
			});
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
			reg.definePartialInstance(INotebookDocumentService, { getNotebook: () => undefined });
			registerWorkbenchServices(reg);
		},
	});
}

function createWidget(instantiationService: IInstantiationService, container: HTMLElement) {
	const uiFactory = instantiationService.createInstance(FixtureWorkbenchUIElementFactory);
	return instantiationService.createInstance(
		MultiDiffEditorWidget,
		container,
		uiFactory,
	);
}

function createDocuments(instantiationService: TestInstantiationService, textModels: DisposableStore) {
	const original1 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_1, URI.parse('inmemory://original/greet.ts'), 'typescript'));
	const modified1 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_1, URI.parse('inmemory://modified/greet.ts'), 'typescript'));
	const original2 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_2, URI.parse('inmemory://original/config.ts'), 'typescript'));
	const modified2 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_2, URI.parse('inmemory://modified/config.ts'), 'typescript'));
	const original3 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_3, URI.parse('inmemory://original/server.ts'), 'typescript'));
	const modified3 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_3, URI.parse('inmemory://modified/server.ts'), 'typescript'));
	return {
		doc1: RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original1, modified: modified1 }, { dispose() { } }),
		doc2: RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original2, modified: modified2 }, { dispose() { } }),
		doc3: RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original3, modified: modified3 }, { dispose() { } }),
	};
}

function renderMultiDiffEditorIncrementalUpdate() {
	return ({ container, disposableStore, disposableStackStore, theme }: ComponentFixtureContext) => {
		container.style.width = '800px';
		container.style.height = '600px';
		container.style.border = '1px solid var(--vscode-editorWidget-border)';

		// First file: sync diffs (already resolved). Files 2+3: 800ms delay.
		const delayedFactory = new DelayedDiffProviderFactoryService(800);
		const instantiationService = createCommonServices(disposableStore, theme, delayedFactory);

		const textModels = disposableStackStore.add(new DisposableStore());
		const { doc1, doc2, doc3 } = createDocuments(instantiationService, textModels);
		const widget = disposableStackStore.add(createWidget(instantiationService, container));

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
		const instantiationService = createCommonServices(disposableStore, theme, delayedFactory);

		const textModels = disposableStackStore.add(new DisposableStore());
		const widget = disposableStackStore.add(createWidget(instantiationService, container));

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
