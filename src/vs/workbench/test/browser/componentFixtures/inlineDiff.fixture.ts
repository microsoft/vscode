/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Range } from '../../../../editor/common/core/range.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { StringText } from '../../../../editor/common/core/text/abstractText.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { IOriginalEditorInlineDiffViewState, OriginalEditorInlineDiffView } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/originalEditorInlineDiffView.js';
import { InlineCompletionEditorType } from '../../../../editor/contrib/inlineCompletions/browser/model/provideInlineCompletions.js';

import '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/view.css';
import '../../../../base/browser/ui/codicons/codiconStyles.js';

const ORIGINAL_CODE = `function calculateTotal(items: Item[]): number {
	let total = 0;
	for (const item of items) {
		total += item.price * item.quantity;
	}
	return total;
}
`;

const MODIFIED_CODE_WORD_REPLACE = `function computeTotal(items: Item[]): number {
	let total = 0;
	for (const item of items) {
		total += item.price * item.quantity;
	}
	return total;
}
`;

const ORIGINAL_CODE_MULTI = `class Logger {
	log(message: string) {
		console.log(message);
	}
	warn(message: string) {
		console.warn(message);
	}
}
`;

const MODIFIED_CODE_MULTI = `class Logger {
	log(level: string, message: string) {
		console.log(\`[\${level}] \${message}\`);
	}
	warn(message: string) {
		console.warn(message);
	}
}
`;

interface InlineDiffFixtureOptions extends ComponentFixtureContext {
	originalCode: string;
	modifiedCode: string;
	diff: DetailedLineRangeMapping[];
	mode: IOriginalEditorInlineDiffViewState['mode'];
	width?: string;
	height?: string;
}

function renderInlineDiff(options: InlineDiffFixtureOptions): void {
	const { container, disposableStore, theme } = options;
	container.style.width = options.width ?? '550px';
	container.style.height = options.height ?? '200px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const originalModel = disposableStore.add(createTextModel(
		instantiationService,
		options.originalCode,
		URI.parse('inmemory://inline-diff-original.ts'),
		'typescript'
	));

	const modifiedModel = disposableStore.add(createTextModel(
		instantiationService,
		options.modifiedCode,
		URI.parse('inmemory://inline-diff-modified.ts'),
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

	editor.setModel(originalModel);
	editor.focus();

	const modifiedText = new StringText(options.modifiedCode);

	const state: IOriginalEditorInlineDiffViewState = {
		diff: options.diff,
		modifiedText,
		mode: options.mode,
		editorType: InlineCompletionEditorType.TextEditor,
		modifiedCodeEditor: editor,
	};

	disposableStore.add(new OriginalEditorInlineDiffView(
		editor,
		constObservable(state),
		modifiedModel,
	));
}

export default defineThemedFixtureGroup({
	WordReplacement: defineComponentFixture({
		render: (context) => renderInlineDiff({
			...context,
			originalCode: ORIGINAL_CODE,
			modifiedCode: MODIFIED_CODE_WORD_REPLACE,
			mode: 'insertionInline',
			diff: [
				new DetailedLineRangeMapping(
					LineRange.ofLength(1, 1),
					LineRange.ofLength(1, 1),
					[new RangeMapping(
						new Range(1, 10, 1, 24),
						new Range(1, 10, 1, 22),
					)]
				),
			],
		}),
	}),
	MultiLineChange: defineComponentFixture({
		render: (context) => renderInlineDiff({
			...context,
			originalCode: ORIGINAL_CODE_MULTI,
			modifiedCode: MODIFIED_CODE_MULTI,
			mode: 'lineReplacement',
			height: '220px',
			diff: [
				new DetailedLineRangeMapping(
					LineRange.ofLength(2, 2),
					LineRange.ofLength(2, 2),
					[
						new RangeMapping(
							new Range(2, 6, 2, 21),
							new Range(2, 6, 2, 29),
						),
						new RangeMapping(
							new Range(3, 15, 3, 22),
							new Range(3, 15, 3, 38),
						),
					]
				),
			],
		}),
	}),
});
