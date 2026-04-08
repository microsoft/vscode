/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IResourceLabel as IMultiDiffResourceLabel, IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService, IWorkspace } from '../../../../../platform/workspace/common/workspace.js';
import { ResourceLabel } from '../../../../browser/labels.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

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

function renderMultiDiffEditor({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '800px';
	container.style.height = '600px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			reg.define(IDiffProviderFactoryService, TestDiffProviderFactoryService);
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

	const uiFactory = instantiationService.createInstance(FixtureWorkbenchUIElementFactory);

	const widget = disposableStore.add(instantiationService.createInstance(
		MultiDiffEditorWidget,
		container,
		uiFactory,
	));

	// Text models must be disposed after the widget releases its references.
	// DisposableStore disposes in insertion order, so we add a cleanup disposable
	// after the widget that first clears the view model, then disposes text models.
	const textModels = new DisposableStore();
	disposableStore.add(toDisposable(() => {
		widget.setViewModel(undefined);
		textModels.dispose();
	}));

	const original1 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_1, URI.parse('inmemory://original/greet.ts'), 'typescript'));
	const modified1 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_1, URI.parse('inmemory://modified/greet.ts'), 'typescript'));

	const original2 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_2, URI.parse('inmemory://original/config.ts'), 'typescript'));
	const modified2 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_2, URI.parse('inmemory://modified/config.ts'), 'typescript'));

	const original3 = textModels.add(createTextModel(instantiationService, ORIGINAL_CODE_3, URI.parse('inmemory://original/server.ts'), 'typescript'));
	const modified3 = textModels.add(createTextModel(instantiationService, MODIFIED_CODE_3, URI.parse('inmemory://modified/server.ts'), 'typescript'));

	const documents: RefCounted<IDocumentDiffItem>[] = [
		RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original1, modified: modified1 }, { dispose() { } }),
		RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original2, modified: modified2 }, { dispose() { } }),
		RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original3, modified: modified3 }, { dispose() { } }),
	];

	const model: IMultiDiffEditorModel = {
		documents: ValueWithChangeEvent.const(documents),
	};

	const viewModel = widget.createViewModel(model);
	widget.setViewModel(viewModel);

	widget.layout(new Dimension(800, 600));
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	MultiDiffEditor: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderMultiDiffEditor(context),
	}),
});
