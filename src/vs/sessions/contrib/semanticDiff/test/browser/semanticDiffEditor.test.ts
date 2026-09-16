/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, Dimension, getWindow } from '../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../base/common/async.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IModelDecoration } from '../../../../../editor/common/model.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { buildSemanticDiffReport } from '../../../../../platform/agentHost/common/semanticDiff.js';
import { resolveSemanticDiffFile } from '../../../../../platform/agentHost/common/semanticDiffProjection.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { INotebookDocumentService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { ISemanticDiffSourceResolverService } from '../../../../../workbench/contrib/chat/common/semanticDiffEditor.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SemanticDiffEditorInput } from '../../browser/semanticDiffEditorInput.js';
import { SemanticDiffEditorWidget } from '../../browser/semanticDiffEditorWidget.js';
import { createSemanticDiffAttentionData, createSemanticDiffBoundaryData, createSemanticDiffContextData, createSemanticDiffEditorData, createSemanticDiffMixedImportData } from './semanticDiffTestUtils.js';

suite('SemanticDiffEditorWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function annotationType(decoration: IModelDecoration): string | undefined {
		const hover = decoration.options.hoverMessage;
		return isMarkdownString(hover) ? hover.value.replaceAll('&nbsp;', ' ').split(':')[0] : undefined;
	}

	async function createWidget(data = createSemanticDiffEditorData()) {
		const services = workbenchInstantiationService(undefined, store);
		services.stub(IUserInteractionService, new MockUserInteractionService());
		services.stub(INotebookDocumentService, new class extends mock<INotebookDocumentService>() {
			override getNotebook() { return undefined; }
		}());
		services.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return { total: () => { }, worked: () => { }, done: () => { } }; }
		}());
		services.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
			override getOpenAriaHint() { return null; }
		}());
		const { request, source } = data;
		let sourceCalls = 0;
		services.stub(ISemanticDiffSourceResolverService, {
			_serviceBrand: undefined,
			resolve: async () => { sourceCalls++; return source; },
		});
		const input = store.add(new SemanticDiffEditorInput(request));
		const container = $('.semantic-diff-test-container');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(services.createInstance(SemanticDiffEditorWidget, container, input));
		widget.layout(new Dimension(900, 650));
		await widget.load();
		await timeout(10);
		return { widget, input, services, sourceCalls: () => sourceCalls };
	}

	test('renders only projected hunks and read-only native editors, with real file labels', async () => {
		const { widget, input } = await createWidget();
		const original = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri('file', 'original'))!.editor;
		const modified = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri('file', 'modified'))!.editor;
		assert.deepStrictEqual({
			originalReadonly: original.getOption(EditorOption.readOnly),
			modifiedReadonly: modified.getOption(EditorOption.readOnly),
			modified: modified.getValue(),
			labels: widget.domNode.querySelector('.monaco-icon-name-container')?.textContent,
			incorrectRename: widget.domNode.querySelector('.status.renamed') !== null,
			unrelatedSelected: input.projections.get()[0].hunks.some(hunk => hunk.classification.groupId === 'other'),
			fileActions: widget.domNode.querySelectorAll('.multiDiffEntry .actions .action-item').length,
		}, {
			originalReadonly: true, modifiedReadonly: true,
			modified: '// Billing\nconst tax = 0;\n\nconst cap = 90;\n\nconst tested = false;\n\nconst unrelated = false;\n',
			labels: 'total.ts', incorrectRename: false, unrelatedSelected: false, fileActions: 0,
		});
	});

	test('filter badges count primary-type hunks in the group and remain visible when unchecked', async () => {
		const data = createSemanticDiffEditorData(['logic', 'logic', 'test']);
		const { widget, input } = await createWidget(data);
		const badges = () => [...widget.domNode.querySelectorAll('.semantic-diff-toolbar .checkbox-action-item')].map(item => ({
			label: item.querySelector('.monaco-checkbox')?.getAttribute('aria-label'),
			count: item.querySelector('.monaco-count-badge')?.textContent,
		}));
		const initial = badges();
		input.setSelectedTypes([]);
		assert.deepStrictEqual({
			initial,
			unchecked: badges(),
			showAll: [...widget.domNode.querySelectorAll('.action-label')].some(element => element.textContent === 'Show All'),
			checks: [...widget.domNode.querySelectorAll('.monaco-checkbox')].map(element => element.getAttribute('aria-checked')),
		}, {
			initial: [{ label: 'Logic, 2 hunks', count: '2' }, { label: 'Test, 1 hunk', count: '1' }],
			unchecked: [{ label: 'Logic, 2 hunks', count: '2' }, { label: 'Test, 1 hunk', count: '1' }],
			showAll: false, checks: ['false', 'false'],
		});
	});

	test('clicking a type badge toggles its checkbox exactly once', async () => {
		const { widget, input } = await createWidget();
		const badge = widget.domNode.querySelector<HTMLElement>('.semantic-diff-type-test .monaco-count-badge')!;
		badge.click();
		assert.deepStrictEqual([...input.selectedTypes.get()], ['logic', 'test']);
		badge.click();
		assert.deepStrictEqual([...input.selectedTypes.get()], ['logic']);
	});

	test('type badges use warm palette backgrounds with the badge foreground without recoloring line totals', async () => {
		const palette = {
			logic: 'rgb(100, 50, 150)', test: 'rgb(0, 110, 120)', supporting: 'rgb(130, 90, 50)',
		};
		for (const types of [['supporting', 'logic', 'test'], ['test', 'supporting', 'logic']] as const) {
			const { widget, input } = await createWidget(createSemanticDiffEditorData(types));
			widget.domNode.style.setProperty('--vscode-spacing-size40', '4px');
			for (const [type, color] of Object.entries(palette)) {
				widget.domNode.style.setProperty(`--vscode-semanticDiff-${type}Foreground`, color);
			}
			widget.domNode.style.setProperty('--vscode-editor-background', 'rgb(0, 0, 0)');
			widget.domNode.style.setProperty('--vscode-badge-foreground', 'rgb(255, 255, 255)');
			widget.domNode.style.setProperty('--vscode-chat-linesAddedForeground', 'rgb(0, 128, 0)');
			widget.domNode.style.setProperty('--vscode-chat-linesRemovedForeground', 'rgb(192, 0, 0)');
			input.showAll();
			await widget.load();
			const targetWindow = getWindow(widget.domNode);
			assert.deepStrictEqual({
				types: types.map(type => {
					const badge = widget.domNode.querySelector(`.semantic-diff-type-${type} .monaco-count-badge`)!;
					const bar = widget.domNode.querySelector(`.semantic-diff-hunk-decoration.semantic-diff-type-${type}`)!;
					const badgeStyle = targetWindow.getComputedStyle(badge);
					return [badgeStyle.backgroundColor, badgeStyle.color, targetWindow.getComputedStyle(bar).getPropertyValue('--semantic-diff-type-color')];
				}),
				additions: targetWindow.getComputedStyle(widget.domNode.querySelector('.semantic-diff-lines-added')!).color,
				deletions: targetWindow.getComputedStyle(widget.domNode.querySelector('.semantic-diff-lines-removed')!).color,
			}, {
				types: types.map(type => [{
					logic: 'color(srgb 0.215686 0.107843 0.323529)',
					test: 'color(srgb 0 0.237255 0.258824)',
					supporting: 'color(srgb 0.280392 0.194118 0.107843)',
				}[type], 'rgb(255, 255, 255)', palette[type]]),
				additions: 'rgb(0, 128, 0)',
				deletions: 'rgb(192, 0, 0)',
			});
			widget.dispose();
		}
	});

	test('replacement markers form a continuous far-left bar with gaps only for unchanged context', async () => {
		const { widget, input } = await createWidget(createSemanticDiffContextData());
		widget.diffWidget.getActiveControl()!.getModifiedEditor().render(true);
		const markers = [...widget.domNode.querySelectorAll('.semantic-diff-hunk-decoration')]
			.map(element => element.getBoundingClientRect()).sort((a, b) => a.top - b.top);
		const changes = [...widget.domNode.querySelectorAll('.editor.modified .line-insert, .editor.modified .view-zones .line-delete')]
			.map(element => element.getBoundingClientRect()).sort((a, b) => a.top - b.top);
		const blocks: number[][] = [];
		for (const change of changes) {
			const previous = blocks.at(-1);
			if (previous && previous[1] === change.top) {
				previous[1] = change.bottom;
			} else {
				blocks.push([change.top, change.bottom]);
			}
		}
		const markerBlocks: number[][] = [];
		for (const marker of markers) {
			const previous = markerBlocks.at(-1);
			if (previous && previous[1] === marker.top) {
				previous[1] = marker.bottom;
			} else {
				markerBlocks.push([marker.top, marker.bottom]);
			}
		}
		assert.deepStrictEqual({
			count: markers.length,
			lefts: [...new Set(markers.map(marker => marker.left))],
			blocks: markerBlocks,
		}, { count: 4, lefts: [widget.domNode.getBoundingClientRect().left], blocks });
		input.setSelectedTypes([]);
		assert.strictEqual(widget.domNode.querySelectorAll('.semantic-diff-hunk-decoration').length, 0);
	});

	test('hot attention uses the full hunk color while warm attention is distinctly quieter', async () => {
		const { widget } = await createWidget(createSemanticDiffContextData('', true));
		widget.domNode.style.setProperty('--vscode-semanticDiff-logicForeground', 'rgb(120, 60, 180)');
		widget.domNode.style.setProperty('--vscode-editor-background', 'rgb(0, 0, 0)');
		widget.diffWidget.getActiveControl()!.getModifiedEditor().render(true);
		const targetWindow = getWindow(widget.domNode);
		const warm = [...widget.domNode.querySelectorAll<HTMLElement>('.semantic-diff-attention-warm')];
		const hot = [...widget.domNode.querySelectorAll<HTMLElement>('.semantic-diff-attention-hot')];
		assert.deepStrictEqual({
			warmCount: warm.length,
			hotCount: hot.length,
			warmColors: [...new Set(warm.map(element => targetWindow.getComputedStyle(element).borderLeftColor))],
			hotColors: [...new Set(hot.map(element => targetWindow.getComputedStyle(element).borderLeftColor))],
			accessible: widget.getAccessibleContent().includes('Hot attention: The second replacement changes the guarded billing outcome.'),
		}, {
			warmCount: 2,
			hotCount: 2,
			warmColors: ['color(srgb 0.258824 0.129412 0.388235)'],
			hotColors: ['rgb(120, 60, 180)'],
			accessible: true,
		});
	});

	test('mixed import and logic hunk keeps one Logic type with cold and hot attention', async () => {
		const { widget, input } = await createWidget(createSemanticDiffMixedImportData());
		widget.domNode.style.setProperty('--vscode-semanticDiff-logicForeground', 'rgb(120, 60, 180)');
		widget.domNode.style.setProperty('--vscode-semanticDiff-supportingForeground', 'rgb(130, 90, 50)');
		widget.domNode.style.setProperty('--vscode-editor-background', 'rgb(0, 0, 0)');
		widget.diffWidget.getActiveControl()!.getModifiedEditor().render(true);
		const targetWindow = getWindow(widget.domNode);
		const cold = [...widget.domNode.querySelectorAll<HTMLElement>('.semantic-diff-hunk-decoration.semantic-diff-attention-cold')];
		const hot = [...widget.domNode.querySelectorAll<HTMLElement>('.semantic-diff-hunk-decoration.semantic-diff-type-logic.semantic-diff-attention-hot')];
		const model = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri('file', 'modified'))!.editor.getModel()!;
		const annotations = model.getAllDecorations()
			.filter(decoration => decoration.options.description === 'semantic-diff-block-attention')
			.map(decoration => ({
				range: [decoration.range.startLineNumber, decoration.range.endLineNumber],
				type: annotationType(decoration),
			}));
		assert.deepStrictEqual({
			coldCount: cold.length,
			hotCount: hot.length,
			supportingColorCount: widget.domNode.querySelectorAll('.semantic-diff-hunk-decoration.semantic-diff-type-supporting').length,
			coldColors: [...new Set(cold.map(element => targetWindow.getComputedStyle(element).borderLeftColor))],
			hotColors: [...new Set(hot.map(element => targetWindow.getComputedStyle(element).borderLeftColor))],
			annotations,
			accessible: widget.getAccessibleContent().includes('Cold attention: Imports, documentation, and spacing accompany the matcher.'),
		}, {
			coldCount: 2,
			hotCount: 1,
			supportingColorCount: 0,
			coldColors: ['color(srgb 0.117647 0.0588235 0.176471)'],
			hotColors: ['rgb(120, 60, 180)'],
			annotations: [
				{ range: [1, 2], type: 'Logic' },
				{ range: [4, 5], type: 'Logic' },
				{ range: [6, 6], type: 'Logic' },
			],
			accessible: true,
		});
	});

	test('attention preserves the hunk type while controlling emphasis', async () => {
		const { widget, input } = await createWidget(createSemanticDiffAttentionData());
		widget.domNode.style.setProperty('--vscode-semanticDiff-logicForeground', 'rgb(120, 60, 180)');
		widget.domNode.style.setProperty('--vscode-semanticDiff-supportingForeground', 'rgb(130, 90, 50)');
		widget.domNode.style.setProperty('--vscode-editor-background', 'rgb(0, 0, 0)');
		widget.diffWidget.getActiveControl()!.getModifiedEditor().render(true);
		const targetWindow = getWindow(widget.domNode);
		const editor = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri('file', 'modified'))!.editor;
		const attention = ['hot', 'warm', 'cold'].map(level => {
			const markers = [...widget.domNode.querySelectorAll<HTMLElement>(`.semantic-diff-attention-${level}`)];
			return {
				level,
				count: markers.length,
				primary: markers.every(marker => marker.classList.contains('semantic-diff-type-logic')),
				colors: [...new Set(markers.map(marker => targetWindow.getComputedStyle(marker).borderLeftColor))],
			};
		});
		const annotations = editor.getModel()!.getAllDecorations()
			.filter(decoration => decoration.options.description === 'semantic-diff-block-attention')
			.map(decoration => ({
				range: [decoration.range.startLineNumber, decoration.range.endLineNumber],
				type: annotationType(decoration),
				text: isMarkdownString(decoration.options.hoverMessage) ? decoration.options.hoverMessage.value.replaceAll('&nbsp;', ' ') : '',
			}));
		assert.deepStrictEqual({
			attention,
			annotationRanges: annotations.map(item => item.range),
			annotationTypes: annotations.map(item => item.type),
			annotationAttention: ['Cold attention', 'Warm attention', 'Hot attention'].map(label => annotations.some(item => item.text.includes(label))),
			accessible: ['Cold attention: Import wiring', 'Warm attention: Resolve the input', 'Hot attention: The guard'].map(text => widget.getAccessibleContent().includes(text)),
			count: widget.domNode.querySelector('.semantic-diff-filter-count')?.textContent,
			types: input.availableTypes,
			lines: input.projections.get().map(file => [file.additions, file.deletions]),
		}, {
			attention: [
				{ level: 'hot', count: 1, primary: true, colors: ['rgb(120, 60, 180)'] },
				{ level: 'warm', count: 1, primary: true, colors: ['color(srgb 0.258824 0.129412 0.388235)'] },
				{ level: 'cold', count: 1, primary: true, colors: ['color(srgb 0.117647 0.0588235 0.176471)'] },
			],
			annotationRanges: [[1, 2], [4, 4], [5, 7]],
			annotationTypes: ['Logic', 'Logic', 'Logic'],
			annotationAttention: [true, true, true], accessible: [true, true, true],
			count: '1', types: ['logic'], lines: [[6, 0]],
		});
		input.toggleType('logic');
		assert.deepStrictEqual({ files: input.projections.get().length, markers: widget.domNode.querySelectorAll('.semantic-diff-hunk-decoration').length }, { files: 0, markers: 0 });
		input.toggleType('logic');
		assert.strictEqual(input.projections.get()[0].additions, 6);
	});

	for (const theme of ['hc-black', 'hc-light']) {
		test(`attention uses solid, dashed, and dotted hunk colors in ${theme}`, async () => {
			const { widget } = await createWidget(createSemanticDiffAttentionData());
			widget.domNode.parentElement!.classList.add(theme);
			widget.domNode.style.setProperty('--vscode-semanticDiff-logicForeground', 'rgb(120, 60, 180)');
			widget.domNode.style.setProperty('--vscode-semanticDiff-supportingForeground', 'rgb(130, 90, 50)');
			widget.diffWidget.getActiveControl()!.getModifiedEditor().render(true);
			const targetWindow = getWindow(widget.domNode);
			assert.deepStrictEqual(['hot', 'warm', 'cold'].map(level => {
				const marker = widget.domNode.querySelector<HTMLElement>(`.semantic-diff-attention-${level}`)!;
				const style = targetWindow.getComputedStyle(marker);
				return [style.borderLeftStyle, style.borderLeftColor];
			}), [['solid', 'rgb(120, 60, 180)'], ['dashed', 'rgb(120, 60, 180)'], ['dotted', 'rgb(120, 60, 180)']]);
		});
	}

	test('one attention block preserves the Logic hunk type across disjoint ranges', async () => {
		const data = createSemanticDiffMixedImportData();
		const file = data.request.report.analysis.files[0];
		const hunk = {
			...data.request.report.analysis.hunks[0],
			oldRange: { start: 3, count: 10 }, newRange: { start: 3, count: 10 },
			additions: 4, deletions: 4,
			attentionBlocks: [{
				attention: 'hot' as const,
				oldRanges: [{ start: 6, count: 3 }, { start: 11, count: 1 }],
				newRanges: [{ start: 6, count: 3 }, { start: 11, count: 1 }],
				reason: 'Review the imported helper and changed return together.',
			}],
		};
		const result = buildSemanticDiffReport({
			schemaVersion: 1,
			analysis: { ...data.request.report.analysis, hunks: [hunk] },
		});
		assert.ok(result.ok);
		const header = '// Header\n\n// Module\n\n// Imports\n';
		const original = `${header}import type {\n\tOldHelper,\n} from './old.js';\n\nexport function run() {\n\treturn false;\n}\n`;
		const modified = `${header}import {\n\tnewHelper,\n} from './new.js';\n\nexport function run() {\n\treturn true;\n}\n`;
		const patch = `diff --git a/${file.path} b/${file.path}\nindex 1111111..2222222 100644\n--- a/${file.path}\n+++ b/${file.path}\n@@ -3,10 +3,10 @@\n // Module\n \n // Imports\n-import type {\n-\tOldHelper,\n-} from './old.js';\n+import {\n+\tnewHelper,\n+} from './new.js';\n \n export function run() {\n-\treturn false;\n+\treturn true;\n }\n`;
		const { widget, input } = await createWidget({
			request: { ...data.request, report: result.report },
			source: { repository: data.source.repository, files: [resolveSemanticDiffFile(file, [hunk], original, modified, patch)] },
		});
		widget.diffWidget.getActiveControl()!.getModifiedEditor().render(true);
		assert.deepStrictEqual({
			annotations: (['original', 'modified'] as const).map(side => widget.diffWidget.tryGetCodeEditor(input.getProjectionUri(file.id, side))!.editor.getModel()!.getAllDecorations()
				.filter(decoration => decoration.options.description === 'semantic-diff-block-attention')
				.map(decoration => ({ range: [decoration.range.startLineNumber, decoration.range.endLineNumber], type: annotationType(decoration) }))),
			logicMarkers: widget.domNode.querySelectorAll('.semantic-diff-attention-hot.semantic-diff-type-logic').length,
			counts: input.projections.get().map(file => [file.hunks.length, file.additions, file.deletions]),
		}, {
			annotations: [
				[{ range: [6, 8], type: 'Logic' }, { range: [11, 11], type: 'Logic' }],
				[{ range: [6, 8], type: 'Logic' }, { range: [11, 11], type: 'Logic' }],
			],
			logicMarkers: 4, counts: [[1, 4, 4]],
		});
	});

	test('adjacent deleted blocks retain separate attention markers and original-side annotations', async () => {
		const { widget, input } = await createWidget(createSemanticDiffAttentionData('delete'));
		const editor = widget.diffWidget.getActiveControl()!;
		editor.getModifiedEditor().render(true);
		const originalModel = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri('file', 'original'))!.editor.getModel()!;
		const annotations = originalModel.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention');
		const bounds = ['cold', 'warm', 'hot'].map(level => {
			const marker = widget.domNode.querySelector<HTMLElement>(`.semantic-diff-attention-${level}`)!;
			return marker.getBoundingClientRect();
		});
		assert.deepStrictEqual({
			ranges: annotations.map(decoration => [decoration.range.startLineNumber, decoration.range.endLineNumber]),
			types: annotations.map(annotationType),
			markers: bounds.map(bound => bound.height > 0),
			separated: bounds[0].bottom < bounds[1].top,
			adjacent: bounds[1].bottom === bounds[2].top,
			heights: bounds.map(bound => Math.round(bound.height / bounds[1].height)),
			counts: input.projections.get().map(file => [file.additions, file.deletions]),
		}, { ranges: [[1, 2], [4, 4], [5, 7]], types: ['Logic', 'Logic', 'Logic'], markers: [true, true, true], separated: true, adjacent: true, heights: [2, 1, 3], counts: [[0, 6]] });
	});

	test('deleted block attention follows wrapped source lines without bleeding into the next block', async () => {
		const { widget } = await createWidget(createSemanticDiffAttentionData('delete', ' + \'long path segment\''.repeat(10)));
		widget.diffWidget.setDiffWordWrap('on');
		widget.layout(new Dimension(380, 650));
		await timeout(10);
		widget.diffWidget.getActiveControl()!.getModifiedEditor().render(true);
		const medium = widget.domNode.querySelector<HTMLElement>('.semantic-diff-attention-warm')!.getBoundingClientRect();
		const high = widget.domNode.querySelector<HTMLElement>('.semantic-diff-attention-hot')!.getBoundingClientRect();
		assert.deepStrictEqual({
			wrapped: medium.height > high.height,
			adjacent: medium.bottom === high.top,
			visible: high.height > 0,
		}, { wrapped: true, adjacent: true, visible: true });
	});

	test('hunk markers use projected ranges and primary types, and are replaced when filters change', async () => {
		const { widget, input } = await createWidget();
		const markers = () => {
			const model = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri('file', 'modified'))!.editor.getModel()!;
			return model.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention').map(decoration => ({
				range: [decoration.range.startLineNumber, decoration.range.endLineNumber],
				type: annotationType(decoration),
			}));
		};
		input.showAll();
		await widget.load();
		assert.deepStrictEqual(markers(), [
			{ range: [2, 2], type: 'Supporting' },
			{ range: [4, 4], type: 'Logic' },
			{ range: [6, 6], type: 'Test' },
		]);
		input.setSelectedTypes(['test']);
		await widget.load();
		assert.deepStrictEqual(markers(), [{ range: [6, 6], type: 'Test' }]);
		input.setSelectedTypes([]);
		input.setSelectedTypes(['logic']);
		await widget.load();
		assert.deepStrictEqual(markers(), [{ range: [4, 4], type: 'Logic' }]);
	});

	test('pure deletions mark the deleted lines rather than a surviving unchanged anchor', async () => {
		const data = createSemanticDiffEditorData();
		const file = data.request.report.analysis.files[0];
		const template = data.request.report.analysis.hunks[0];
		const hunks = [
			{ ...template, id: 'insert', oldRange: { start: 1, count: 0 }, newRange: { start: 2, count: 1 }, additions: 1, deletions: 0, classification: { ...template.classification, changeType: 'supporting' as const }, attentionBlocks: [{ attention: 'cold' as const, oldRanges: [], newRanges: [{ start: 2, count: 1 }], reason: 'Inserted support line.' }] },
			{ ...template, id: 'remove', oldRange: { start: 3, count: 1 }, newRange: { start: 3, count: 0 }, additions: 0, deletions: 1, classification: { ...template.classification, changeType: 'logic' as const }, attentionBlocks: [{ attention: 'hot' as const, oldRanges: [{ start: 3, count: 1 }], newRanges: [], reason: 'Removed behavior.' }] },
		];
		const validated = buildSemanticDiffReport({
			schemaVersion: 1,
			analysis: { ...data.request.report.analysis, groups: [data.request.report.analysis.groups[0]], hunks },
		});
		assert.ok(validated.ok);
		const patch = `diff --git a/${file.path} b/${file.path}\nindex 1111111..2222222 100644\n--- a/${file.path}\n+++ b/${file.path}\n@@ -1,0 +2 @@\n+inserted\n@@ -3 +3,0 @@\n-delete\n`;
		const { widget, input } = await createWidget({
			request: { ...data.request, report: validated.report },
			source: { repository: data.source.repository, files: [resolveSemanticDiffFile(file, hunks, 'first\nsecond\ndelete\nlast\n', 'first\ninserted\nsecond\nlast\n', patch)] },
		});
		const model = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri(file.id, 'modified'))!.editor.getModel()!;
		const decorations = model.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention');
		const original = widget.diffWidget.getActiveControl()!.getOriginalEditor().getModel()!;
		assert.deepStrictEqual({
			text: model.getValue(),
			modifiedMarkers: decorations.length,
			deletedMarkers: original.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention').map(decoration => ({ line: decoration.range.startLineNumber, type: annotationType(decoration) })),
		}, { text: 'first\nsecond\nlast\n', modifiedMarkers: 0, deletedMarkers: [{ line: 3, type: 'Logic' }] });
	});

	test('markers exclude leading, trailing and internal unchanged context and native signs are disabled', async () => {
		const { widget, input } = await createWidget(createSemanticDiffContextData());
		input.showAll();
		await widget.load();
		const diff = widget.diffWidget.getActiveControl()!;
		const original = diff.getOriginalEditor().getModel()!;
		const modified = diff.getModifiedEditor().getModel()!;
		const ranges = (model: typeof original) => model.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention')
			.map(decoration => [decoration.range.startLineNumber, decoration.range.endLineNumber]);
		assert.deepStrictEqual({
			original: ranges(original),
			modified: ranges(modified),
			nativeSigns: [...original.getAllDecorations(), ...modified.getAllDecorations()].filter(decoration => /(?:insert|delete)-sign/.test(decoration.options.linesDecorationsClassName ?? '')).length,
		}, { original: [[2, 2], [4, 4], [10, 10]], modified: [[2, 3], [5, 5]], nativeSigns: 0 });
		input.setSelectedTypes(['test']);
		await widget.load();
		const filtered = widget.diffWidget.getActiveControl()!;
		assert.deepStrictEqual({
			original: ranges(filtered.getOriginalEditor().getModel()!),
			modified: ranges(filtered.getModifiedEditor().getModel()!),
		}, { original: [[10, 10]], modified: [] });
	});

	for (const direction of ['insert', 'delete'] as const) {
		test(`${direction} markers follow native diff alignment around blank lines rather than Git boundaries`, async () => {
			const { widget, input } = await createWidget(createSemanticDiffBoundaryData(direction));
			const snapshots = [];
			for (let iteration = 0; iteration < 2; iteration++) {
				const diff = widget.diffWidget.getActiveControl()!;
				const ranges = (side: 'original' | 'modified') => {
					const editor = side === 'original' ? diff.getOriginalEditor() : diff.getModifiedEditor();
					return editor.getModel()!.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention')
						.map(decoration => [decoration.range.startLineNumber, decoration.range.endLineNumber]);
				};
				const native = diff.getDiffComputationResult()!.changes2.map(change => ({
					original: change.original.isEmpty ? [] : [[change.original.startLineNumber, change.original.endLineNumberExclusive - 1]],
					modified: change.modified.isEmpty ? [] : [[change.modified.startLineNumber, change.modified.endLineNumberExclusive - 1]],
				}));
				snapshots.push({ markers: { original: ranges('original'), modified: ranges('modified') }, native });
				input.setSelectedTypes([]);
				input.setSelectedTypes(['logic']);
				await widget.load();
			}
			const expected = direction === 'insert' ? { original: [], modified: [[2, 5]] } : { original: [[2, 5]], modified: [] };
			assert.deepStrictEqual(snapshots, [
				{ markers: expected, native: [expected] },
				{ markers: expected, native: [expected] },
			]);
		});

		test(`${direction} markers preserve split attention after native blank-line realignment`, async () => {
			const { widget } = await createWidget(createSemanticDiffBoundaryData(direction, true));
			const diff = widget.diffWidget.getActiveControl()!;
			const side = direction === 'insert' ? 'modified' : 'original';
			const editor = side === 'original' ? diff.getOriginalEditor() : diff.getModifiedEditor();
			const markers = editor.getModel()!.getAllDecorations()
				.filter(decoration => decoration.options.description === 'semantic-diff-block-attention')
				.map(decoration => ({
					range: [decoration.range.startLineNumber, decoration.range.endLineNumber],
					attention: isMarkdownString(decoration.options.hoverMessage) && decoration.options.hoverMessage.value.includes('separator') ? 'cold' : 'hot',
				}));
			assert.deepStrictEqual(markers, [
				{ range: [2, 2], attention: 'cold' },
				{ range: [3, 5], attention: 'hot' },
			]);
		});
	}

	test('the three hunk types have badges and matching markers', async () => {
		const { widget, input } = await createWidget(createSemanticDiffEditorData());
		input.showAll();
		await widget.load();
		const model = widget.diffWidget.tryGetCodeEditor(input.getProjectionUri('file', 'modified'))!.editor.getModel()!;
		assert.deepStrictEqual({
			badges: [...widget.domNode.querySelectorAll('.checkbox-action-item')].map(element => ({
				type: [...element.classList].find(name => name.startsWith('semantic-diff-type-')),
				count: element.querySelector('.monaco-count-badge')?.textContent,
			})),
			markers: model.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention').map(annotationType),
		}, {
			badges: [{ type: 'semantic-diff-type-logic', count: '1' }, { type: 'semantic-diff-type-test', count: '1' }, { type: 'semantic-diff-type-supporting', count: '1' }],
			markers: ['Supporting', 'Logic', 'Test'],
		});
	});

	test('a deleted file marks its removed content, not the empty modified model', async () => {
		const data = createSemanticDiffEditorData();
		const file = { ...data.request.report.analysis.files[0], status: 'deleted' as const };
		const hunk = {
			...data.request.report.analysis.hunks[0],
			oldRange: { start: 1, count: 1 }, newRange: { start: 0, count: 0 }, additions: 0, deletions: 1,
			attentionBlocks: [{ attention: 'cold' as const, oldRanges: [{ start: 1, count: 1 }], newRanges: [], reason: 'Removed supporting line.' }],
		};
		const validated = buildSemanticDiffReport({
			schemaVersion: 1,
			analysis: { ...data.request.report.analysis, groups: [data.request.report.analysis.groups[0]], files: [file], hunks: [hunk] },
		});
		assert.ok(validated.ok);
		const patch = `diff --git a/${file.path} b/${file.path}\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/${file.path}\n+++ /dev/null\n@@ -1 +0,0 @@\n-removed\n`;
		const { widget } = await createWidget({
			request: { ...data.request, report: validated.report },
			source: { repository: data.source.repository, files: [resolveSemanticDiffFile(file, [hunk], 'removed\n', undefined, patch)] },
		});
		const diff = widget.diffWidget.getActiveControl()!;
		diff.getModifiedEditor().render(true);
		const marker = widget.domNode.querySelector('.semantic-diff-hunk-decoration')!.getBoundingClientRect();
		const deleted = widget.domNode.querySelector('.editor.modified .view-zones .line-delete')!.getBoundingClientRect();
		assert.deepStrictEqual({
			original: diff.getOriginalEditor().getModel()!.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention').map(decoration => ({
				line: decoration.range.startLineNumber, type: annotationType(decoration),
			})),
			modified: diff.getModifiedEditor().getModel()!.getAllDecorations().filter(decoration => decoration.options.description === 'semantic-diff-block-attention').length,
			gutterBounds: [marker.top, marker.bottom],
		}, { original: [{ line: 1, type: 'Supporting' }], modified: 0, gutterBounds: [deleted.top, deleted.bottom] });
	});

	test('shows whitespace-only supporting hunks in the native diff', async () => {
		const data = createSemanticDiffEditorData();
		const file = data.request.report.analysis.files[0];
		const hunk = {
			...data.request.report.analysis.hunks[0],
			oldRange: { start: 1, count: 1 }, newRange: { start: 1, count: 1 },
			attentionBlocks: [{ attention: 'cold' as const, oldRanges: [{ start: 1, count: 1 }], newRanges: [{ start: 1, count: 1 }], reason: 'Whitespace-only change.' }],
		};
		const validated = buildSemanticDiffReport({
			schemaVersion: 1,
			analysis: { ...data.request.report.analysis, groups: [data.request.report.analysis.groups[0]], hunks: [hunk] },
		});
		assert.ok(validated.ok);
		const original = 'const total = 1;\n';
		const modified = '  const total = 1;  \n';
		const patch = `diff --git a/${file.path} b/${file.path}\nindex 1111111..2222222 100644\n--- a/${file.path}\n+++ b/${file.path}\n@@ -1 +1 @@\n-const total = 1;\n+  const total = 1;  \n`;
		const { widget } = await createWidget({
			request: { ...data.request, report: validated.report },
			source: { repository: data.source.repository, files: [resolveSemanticDiffFile(file, [hunk], original, modified, patch)] },
		});
		const diff = widget.diffWidget.getActiveControl()?.getDiffComputationResult();
		assert.ok(diff && diff.changes.length > 0, 'Formatting changes must remain visible when Supporting is selected');
	});

	test('always uses inline diffs across widths and filter changes', async () => {
		const { widget, input } = await createWidget();
		const modes: boolean[] = [];
		for (const width of [2400, 320, 2400]) {
			widget.layout(new Dimension(width, 650));
			input.showAll();
			await widget.load();
			const diff = widget.diffWidget.getActiveControl();
			assert.ok(diff);
			modes.push(diff.renderSideBySide);
			input.setSelectedTypes(['logic']);
			await widget.load();
			const filteredDiff = widget.diffWidget.getActiveControl();
			assert.ok(filteredDiff);
			modes.push(filteredDiff.renderSideBySide);
		}
		assert.deepStrictEqual(modes, [false, false, false, false, false, false]);
	});

	test('renders only the filter toolbar above a populated diff', async () => {
		const { widget } = await createWidget();
		assert.deepStrictEqual({
			children: [...widget.domNode.children].map(element => element.className),
			metadata: widget.domNode.querySelectorAll('.semantic-diff-header, .semantic-diff-title, .semantic-diff-description, .semantic-diff-comparison, .semantic-diff-projection-notice').length,
			visibleStatus: widget.domNode.querySelector<HTMLElement>('.semantic-diff-status')?.hidden === false,
			diffHasHeight: (widget.domNode.querySelector('.semantic-diff-content')?.getBoundingClientRect().height ?? 0) > 0,
			accessibleComparison: widget.getAccessibleContent().includes('Commit range'),
			accessibleProjection: widget.getAccessibleContent().includes('projection, not the target file'),
		}, {
			children: ['semantic-diff-toolbar', 'semantic-diff-body'],
			metadata: 0, visibleStatus: false, diffHasHeight: true, accessibleComparison: true, accessibleProjection: true,
		});
	});

	test('editor styling does not override the chat card text size', () => {
		const host = $('div');
		host.style.fontSize = '26px';
		host.style.setProperty('--vscode-fontSize-heading3', '13px');
		host.style.setProperty('--vscode-fontSize-body1', '13px');
		host.style.setProperty('--vscode-chat-font-size-body-s', '26px');
		const card = $('.chat-semantic-diff', undefined, $('span.semantic-diff-title'), $('p.semantic-diff-description'));
		const editor = $('.semantic-diff-editor', undefined, $('.semantic-diff-toolbar'));
		host.append(card, editor);
		document.body.append(host);
		store.add(toDisposable(() => host.remove()));
		const targetWindow = getWindow(host);
		assert.deepStrictEqual({
			cardTitle: targetWindow.getComputedStyle(card.children[0]).fontSize,
			cardDescription: targetWindow.getComputedStyle(card.children[1]).fontSize,
		}, { cardTitle: '26px', cardDescription: '26px' });
	});

	test('closing the editor while accessible content is open does not restore focus into disposed widgets', async () => {
		const { widget } = await createWidget();
		widget.domNode.querySelector<HTMLElement>('.monaco-checkbox')!.focus();
		const restoreFocus = widget.captureFocus();
		widget.dispose();
		assert.doesNotThrow(restoreFocus);
	});

	test('preserves filter focus, explicit empty state, source cache and model disposal', async () => {
		const { widget, input, services, sourceCalls } = await createWidget();
		const filter = widget.domNode.querySelector<HTMLElement>('.semantic-diff-toolbar .monaco-checkbox')!;
		filter.focus();
		const returnFocus = widget.captureFocus();
		for (let i = 0; i < 4; i++) {
			input.showAll();
			input.setSelectedTypes([]);
		}
		await timeout(10);
		const models = services.get(IModelService);
		const modelsWhileOpen = models.getModels().filter(model => model.uri.scheme === 'semantic-diff').length;
		returnFocus();
		const summary = {
			focusRetained: document.activeElement === filter,
			empty: widget.getAccessibleContent().includes('No hunks match the selected types'),
			emptyState: widget.domNode.querySelector('.semantic-diff-body > .semantic-diff-status')?.textContent,
			emptyStateVisible: widget.domNode.querySelector<HTMLElement>('.semantic-diff-status')?.hidden === false,
			baselineExplained: widget.getAccessibleContent().includes('not the target file'),
			sourceCalls: sourceCalls(), modelsWhileOpen,
		};
		widget.dispose();
		await timeout(10);
		assert.deepStrictEqual({ ...summary, modelsAfterClose: models.getModels().filter(model => model.uri.scheme === 'semantic-diff').length }, {
			focusRetained: true, empty: true, emptyState: 'No hunks match the selected types.', emptyStateVisible: true, baselineExplained: true, sourceCalls: 1, modelsWhileOpen: 2, modelsAfterClose: 0,
		});
	});

	test('accessible text contains canonical mapping, uncertainty metadata and complete projection content', async () => {
		const { widget, input } = await createWidget();
		input.showAll();
		const text = widget.getAccessibleContent();
		assert.deepStrictEqual({
			canonical: text.includes('Canonical original'), projection: text.includes('projected modified'),
			baseline: text.includes('Baseline content:'), content: text.includes('const cap = 90;'),
			hidden: text.includes('3 of 3 hunks'), otherHunk: text.includes('Hunk hunk-3'),
			classification: text.includes('Classification source: agent-reported'),
		}, { canonical: true, projection: true, baseline: true, content: true, hidden: true, otherHunk: false, classification: true });
	});

	test('keeps per-file collapse state when every hunk is hidden and shown again', async () => {
		const { widget, input } = await createWidget();
		widget.domNode.querySelector<HTMLElement>('[aria-expanded="true"]')!.click();
		input.setSelectedTypes([]);
		input.showAll();
		await widget.load();
		await timeout(10);
		assert.deepStrictEqual({
			collapsed: widget.domNode.querySelector('[aria-expanded="false"]') !== null,
			files: input.projections.get().length,
		}, { collapsed: true, files: 1 });
	});
});
