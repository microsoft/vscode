/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { LayoutData, ReferenceWidget } from '../../../../editor/contrib/gotoSymbol/browser/peek/referencesWidget.js';
import { ReferencesModel } from '../../../../editor/contrib/gotoSymbol/browser/referencesModel.js';
import * as peekView from '../../../../editor/contrib/peekView/browser/peekView.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';

import '../../../../editor/contrib/peekView/browser/media/peekViewWidget.css';
import '../../../../editor/contrib/gotoSymbol/browser/peek/referencesWidget.css';
import '../../../../base/browser/ui/codicons/codiconStyles.js';

const SAMPLE_CODE = `import { readFile, writeFile } from 'fs';

function processFile(path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		readFile(path, 'utf8', (err, data) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(data.toUpperCase());
		});
	});
}

async function main() {
	const result = await processFile('./input.txt');
	await writeFile('./output.txt', result);
	console.log('Done processing file');
}

main();
`;

function renderPeekReference({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '700px';
	container.style.height = '400px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.defineInstance(peekView.IPeekViewService, new class extends mock<peekView.IPeekViewService>() {
				declare readonly _serviceBrand: undefined;
				override addExclusiveWidget(_editor: ICodeEditor, _widget: peekView.PeekViewWidget) { }
			});
			reg.defineInstance(ITextModelService, new class extends mock<ITextModelService>() {
				declare readonly _serviceBrand: undefined;
				override async createModelReference(): Promise<never> {
					throw new Error('Not implemented in fixture');
				}
				override canHandleResource() { return false; }
				override registerTextModelContentProvider() { return { dispose: () => { } }; }
			});
		},
	});

	const uri = URI.parse('inmemory://peek-fixture.ts');
	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		uri,
		'typescript'
	));

	const editorWidgetOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			minimap: { enabled: false },
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			fontSize: 14,
			cursorBlinking: 'solid',
		},
		editorWidgetOptions
	));

	editor.setModel(textModel);
	editor.focus();

	const layoutData: LayoutData = { ratio: 0.7, heightInLines: 10 };

	const referenceWidget = instantiationService.createInstance(
		ReferenceWidget,
		editor,
		true,
		layoutData,
	);
	disposableStore.add(referenceWidget);

	const range = { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 21 };
	referenceWidget.setTitle('processFile');
	referenceWidget.setMetaTitle('3 references');
	referenceWidget.show(range);

	const links = [
		{ uri, range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 21 } },
		{ uri, range: { startLineNumber: 16, startColumn: 26, endLineNumber: 16, endColumn: 37 } },
		{ uri, range: { startLineNumber: 20, startColumn: 1, endLineNumber: 20, endColumn: 5 } },
	];

	const model = new ReferencesModel(links, 'processFile');
	disposableStore.add(model);
	referenceWidget.setModel(model);
}

export default defineThemedFixtureGroup({
	PeekReferences: defineComponentFixture({
		render: renderPeekReference,
	}),
});
