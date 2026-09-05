/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorExtensionsRegistry, IEditorContributionDescription } from '../../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { DocumentColorProvider, InlayHintsProvider } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ColorDetector } from '../../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import '../../../../../editor/contrib/colorPicker/browser/colorPickerContribution.js';
import '../../../../../editor/contrib/colorPicker/browser/colorPicker.css';
import { InlayHintsController } from '../../../../../editor/contrib/inlayHints/browser/inlayHintsController.js';
import '../../../../../editor/contrib/inlayHints/browser/inlayHintsContribution.js';
import { InlineProgressManager } from '../../../../../editor/contrib/inlineProgress/browser/inlineProgress.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, ServiceRegistration } from '../fixtureUtils.js';

const colorDetectorContribution = EditorExtensionsRegistry.getSomeEditorContributions([ColorDetector.ID])[0];
const inlayHintsContribution = EditorExtensionsRegistry.getSomeEditorContributions([InlayHintsController.ID])[0];

interface IFixtureInlayHintsCache {
	readonly _serviceBrand: undefined;
	get(): undefined;
	set(): void;
}

const IFixtureInlayHintsCache = createDecorator<IFixtureInlayHintsCache>('IInlayHintsCache');

async function renderColorDecorators(context: ComponentFixtureContext, selectFirstColor = false): Promise<void> {
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
	if (selectFirstColor) {
		editor.setSelection(new Range(1, 14, 1, editor.getModel()!.getLineMaxColumn(1)));
		editor.focus();
	}
}

async function renderInlineProgress(context: ComponentFixtureContext): Promise<void> {
	const { editor, instantiationService } = createEditor(context, 'const result = await work();', 'typescript');
	const progress = context.disposableStore.add(instantiationService.createInstance(InlineProgressManager, 'fixture', editor));
	progress.showWhile(
		{ lineNumber: 1, column: 15 },
		'Computing result',
		new Promise(() => { }),
		{ cancel() { } },
		0
	);
	await timeout(0);
}

async function renderInlayHints(context: ComponentFixtureContext): Promise<void> {
	const { editor } = createEditor(
		context,
		'const value = computeResult();',
		'typescript',
		[inlayHintsContribution],
		{ inlayHints: { enabled: 'on', fontSize: 12 } },
		languageFeaturesService => context.disposableStore.add(languageFeaturesService.inlayHintsProvider.register('*', new class implements InlayHintsProvider {
			provideInlayHints() {
				return {
					hints: [{
						label: ': number',
						position: { lineNumber: 1, column: 12 },
						paddingLeft: true,
						paddingRight: true,
					}],
					dispose() { }
				};
			}
		})),
		registration => registration.defineInstance(IFixtureInlayHintsCache, {
			_serviceBrand: undefined,
			get: () => undefined,
			set: () => { },
		})
	);
	editor.getContribution(InlayHintsController.ID);
	await timeout(50);
}

function createEditor(
	context: ComponentFixtureContext,
	content: string,
	languageId: string,
	contributions: IEditorContributionDescription[] = [],
	options: IEditorConstructionOptions = {},
	registerLanguageFeatures?: (languageFeaturesService: ILanguageFeaturesService) => void,
	registerServices?: (registration: ServiceRegistration) => void
) {
	const { container, disposableStore, theme } = context;
	container.style.width = '420px';
	container.style.height = '120px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registerServices,
	});
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
		expectedVisualDescriptions: ['Three CSS declarations appear on separate lines. Each hexadecimal color is preceded by a square swatch whose fill matches the value. Every swatch is the same size, has a visible contrasting border, and is vertically aligned with its line of text.'],
		render: renderColorDecorators,
	}),
	SelectedColorDecorator: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The first CSS color and the text after it are selected. The selection is continuous on both sides of the square red swatch and ends at the closing brace without detached or misplaced selection blocks.'],
		render: context => renderColorDecorators(context, true),
	}),
	InlineProgress: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A single TypeScript statement appears on one line. A small inline progress placeholder separates the equals sign from await without changing the line height or vertical alignment.'],
		render: renderInlineProgress,
	}),
	InlayHints: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A single TypeScript statement contains a muted : number inlay hint after value. Narrow, equal-width spaces separate the hint from the source text on both sides, and all content stays on one baseline.'],
		render: renderInlayHints,
	})
});
