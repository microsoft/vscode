/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IResourceLabel as IMultiDiffResourceLabel, IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { IDiffEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ResourceLabel } from '../../../../browser/labels.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, registerWorkbenchServices } from '../fixtureUtils.js';

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

const originalCode1 = `function greet(name: string): string {
	return 'Hello, ' + name;
}

function main() {
	console.log(greet('World'));
}`;

const modifiedCode1 = `function greet(name: string, greeting = 'Hello'): string {
	return \`\${greeting}, \${name}!\`;
}

function farewell(name: string): string {
	return \`Goodbye, \${name}!\`;
}

function main() {
	console.log(greet('World'));
	console.log(farewell('World'));
}`;

const originalCode2 = `export interface Config {
	host: string;
	port: number;
}

export const defaultConfig: Config = {
	host: 'localhost',
	port: 3000,
};`;

const modifiedCode2 = `export interface Config {
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

const originalCode3 = `import { Config } from './config';

export function createServer(config: Config) {
	return { config };
}`;

const modifiedCode3 = `import { Config } from './config';

export function createServer(config: Config) {
	const { host, port, secure } = config;
	const protocol = secure ? 'https' : 'http';
	console.log(\`Starting server at \${protocol}://\${host}:\${port}\`);
	return { config, url: \`\${protocol}://\${host}:\${port}\` };
}`;

export function createMultiDiffEditorFixtureServices(disposableStore: DisposableStore, theme: ComponentFixtureContext['theme'], diffProviderFactory: IDiffProviderFactoryService) {
	return createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
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

export function createMultiDiffEditorFixtureWidget(instantiationService: IInstantiationService, container: HTMLElement, diffEditorOptions?: IDiffEditorOptions) {
	const uiFactory = instantiationService.createInstance(FixtureWorkbenchUIElementFactory);
	return instantiationService.createInstance(
		MultiDiffEditorWidget,
		container,
		uiFactory,
		diffEditorOptions,
	);
}

export function createMultiDiffEditorFixtureDocuments(instantiationService: TestInstantiationService, textModels: DisposableStore) {
	const original1 = textModels.add(createTextModel(instantiationService, originalCode1, URI.parse('inmemory://original/greet.ts'), 'typescript'));
	const modified1 = textModels.add(createTextModel(instantiationService, modifiedCode1, URI.parse('inmemory://modified/greet.ts'), 'typescript'));
	const original2 = textModels.add(createTextModel(instantiationService, originalCode2, URI.parse('inmemory://original/config.ts'), 'typescript'));
	const modified2 = textModels.add(createTextModel(instantiationService, modifiedCode2, URI.parse('inmemory://modified/config.ts'), 'typescript'));
	const original3 = textModels.add(createTextModel(instantiationService, originalCode3, URI.parse('inmemory://original/server.ts'), 'typescript'));
	const modified3 = textModels.add(createTextModel(instantiationService, modifiedCode3, URI.parse('inmemory://modified/server.ts'), 'typescript'));
	return {
		doc1: RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original1, modified: modified1 }, { dispose() { } }),
		doc2: RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original2, modified: modified2 }, { dispose() { } }),
		doc3: RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original: original3, modified: modified3 }, { dispose() { } }),
	};
}
