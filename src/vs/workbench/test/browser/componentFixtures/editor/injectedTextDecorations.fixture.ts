/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorWidgetOptions, CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorContributionInstantiation, IEditorContributionDescription } from '../../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { DocumentColorProvider } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ColorDetector } from '../../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import '../../../../../editor/contrib/colorPicker/browser/colorPicker.css';
import { InlineProgressManager } from '../../../../../editor/contrib/inlineProgress/browser/inlineProgress.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const colorDetectorContribution: IEditorContributionDescription = {
	id: ColorDetector.ID,
	ctor: ColorDetector,
	instantiation: EditorContributionInstantiation.AfterFirstRender,
};

async function renderColorDecorators(context: ComponentFixtureContext): Promise<void> {
	const { editor } = createEditor(
		context,
		'.red { color: #ff0000; }\n.green { color: #00ff00; }\n.blue { color: #0000ff; }',
		'css',
		[colorDetectorContribution],
		{ colorDecorators: true },
		languageFeaturesService => context.disposableStore.add(languageFeaturesService.colorProvider.register('*', new class implements DocumentColorProvider {
			provideDocumentColors() {
				return [
					{ range: new Range(1, 15, 1, 22), color: { red: 1, green: 0, blue: 0, alpha: 1 } },
					{ range: new Range(2, 17, 2, 24), color: { red: 0, green: 1, blue: 0, alpha: 1 } },
					{ range: new Range(3, 16, 3, 23), color: { red: 0, green: 0, blue: 1, alpha: 1 } },
				];
			}

			provideColorPresentations() {
				return [];
			}
		}))
	);
	editor.getContribution(ColorDetector.ID);
	await timeout(0);
}

async function renderInlineProgress(context: ComponentFixtureContext): Promise<void> {
	const { editor, instantiationService } = createEditor(context, 'const result = await work();', 'typescript');
	const progress = context.disposableStore.add(instantiationService.createInstance(InlineProgressManager, 'fixture', editor));
	void progress.showWhile(
		{ lineNumber: 1, column: 15 },
		'Computing result',
		new Promise(() => { }),
		{ cancel() { } },
		0
	);
	await timeout(0);
}

function createEditor(
	context: ComponentFixtureContext,
	content: string,
	languageId: string,
	contributions: IEditorContributionDescription[] = [],
	options: ICodeEditorWidgetOptions = {},
	registerLanguageFeatures?: (languageFeaturesService: ILanguageFeaturesService) => void
) {
	const { container, disposableStore, theme } = context;
	container.style.width = '420px';
	container.style.height = '120px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
	registerLanguageFeatures?.(languageFeaturesService);
	const model = disposableStore.add(createTextModel(
		instantiationService,
		content,
		URI.parse(`inmemory://injected-text/${languageId}`),
		languageId
	));
	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			fontFamily: 'Consolas, "Courier New", monospace',
			fontSize: 14,
			glyphMargin: false,
			lineNumbers: 'off',
			minimap: { enabled: false },
			renderLineHighlight: 'none',
			scrollBeyondLastLine: false,
			scrollbar: { horizontal: 'hidden', vertical: 'hidden' },
			wordWrap: 'off',
			...options,
		},
		{ contributions }
	));
	editor.setModel(model);

	return { editor, instantiationService, languageFeaturesService };
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	ColorDecorators: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderColorDecorators,
	}),
	InlineProgress: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: renderInlineProgress,
	}),
});
