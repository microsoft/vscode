/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { buildSemanticDiffReport } from '../../../../../platform/agentHost/common/semanticDiff.js';
import { ISemanticDiffSourceResolverService } from '../../../../contrib/chat/common/semanticDiffEditor.js';
import { createMultiDiffEditorFixtureServices } from '../editor/multiDiffEditorFixtureUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
// eslint-disable-next-line local/code-import-patterns
import { SemanticDiffEditorInput } from '../../../../../sessions/contrib/semanticDiff/browser/semanticDiffEditorInput.js';
// eslint-disable-next-line local/code-import-patterns
import { SemanticDiffEditorWidget } from '../../../../../sessions/contrib/semanticDiff/browser/semanticDiffEditorWidget.js';
// eslint-disable-next-line local/code-import-patterns
import { createSemanticDiffAttentionData, createSemanticDiffBoundaryData, createSemanticDiffContextData, createSemanticDiffEditorData, createSemanticDiffMixedImportData } from '../../../../../sessions/contrib/semanticDiff/test/browser/semanticDiffTestUtils.js';

async function renderSemanticDiff(context: ComponentFixtureContext, state: 'default' | 'all' | 'empty' | 'error' | 'loading' | 'partial' | 'counts' | 'context' | 'focus' | 'mixed' | 'attention' | 'wrapped' | 'insert' | 'delete', width = 900): Promise<void> {
	const { container, disposableStore, disposableStackStore, theme } = context;
	container.style.width = `${width}px`;
	container.style.height = '680px';
	const services = createMultiDiffEditorFixtureServices(disposableStore, theme, new TestDiffProviderFactoryService());
	services.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
		override getOpenAriaHint() { return null; }
	}());
	const types = state === 'counts' ? ['logic', 'logic', 'test'] as const : undefined;
	const { request, source } = state === 'context' || state === 'focus' || state === 'wrapped' ? createSemanticDiffContextData(state === 'wrapped' ? ' a long argument name'.repeat(6) : '', state === 'focus')
		: state === 'mixed' ? createSemanticDiffMixedImportData()
			: state === 'attention' ? createSemanticDiffAttentionData()
				: state === 'insert' || state === 'delete' ? createSemanticDiffBoundaryData(state) : createSemanticDiffEditorData(types);
	if (state === 'partial') {
		request.report.analysis.source.inventoryComplete = false;
		request.report.analysis.limitations.push({ code: 'incompleteInventory', message: 'Only the submitted billing hunks were classified.', fileId: null, hunkId: null });
		const result = buildSemanticDiffReport({ schemaVersion: 1, analysis: request.report.analysis });
		if (result.ok) {
			Object.assign(request.report, result.report);
		}
	}
	services.stub(ISemanticDiffSourceResolverService, {
		_serviceBrand: undefined,
		resolve: async () => {
			if (state === 'error') {
				throw new Error('The recorded comparison is unavailable. Current workspace contents were not substituted.');
			}
			return source;
		},
	});
	const input = disposableStackStore.add(new SemanticDiffEditorInput(request));
	if (state === 'all' || state === 'context' || state === 'wrapped') { input.showAll(); }
	if (state === 'empty') { input.setSelectedTypes([]); }
	const widget = disposableStackStore.add(services.createInstance(SemanticDiffEditorWidget, container, input));
	if (state === 'wrapped') {
		widget.diffWidget.setDiffWordWrap('on');
	}
	widget.layout(new Dimension(width, 680));
	if (state !== 'loading') {
		await input.resolveSource(services.get(ISemanticDiffSourceResolverService));
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/semanticDiff/' }, {
	Default: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Only primary type checkboxes with warm-shade type-colored hunk-count badges and white numerals appear above the file diff; there is no Show All action or metadata header. Only Logic is selected and the visible hunk has a stronger full-purple gutter marker. The real filename total.ts appears once, without a rename marker or file action buttons.'],
		render: context => renderSemanticDiff(context, 'default'),
	}),
	AllTypes: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Logic, Test and Supporting are selected with count 1 on warm-shade purple, teal and brown badges using white numerals. All three billing hunks have stronger full-color gutter markers under a single total.ts header, excluding the unrelated fourth change. Native added/deleted highlights and line totals retain their green/red colors.'],
		render: context => renderSemanticDiff(context, 'all'),
	}),
	Counts: defineComponentFixture({
		expectedVisualDescriptions: ['Logic has a warm-shade purple badge showing 2 with a white numeral, and Test has a warm-shade teal badge showing 1. Only the two Logic hunks and their stronger purple markers are visible; the unchecked Test filter still shows its count.'],
		render: context => renderSemanticDiff(context, 'counts'),
	}),
	ContextLines: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['Rounded-square type badges appear above inline changes without native plus/minus gutter signs. Removed and added lines have matching type markers in one far-left gutter, forming continuous bars across each replacement. Leading, trailing and internal unchanged context remain unmarked. The pure deletion is marked beside its original line number, not beside the surviving last line.'],
		render: context => renderSemanticDiff(context, 'context'),
	}),
	AttentionContrast: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['In regular themes, warm attention gives the first purple replacement marker a distinctly subdued shade while hot attention gives the second replacement marker full emphasis. This establishes a clear reading order within one Logic hunk without changing the native red and green diff highlights. In high contrast themes, warm is dashed and hot is solid.'],
		render: context => renderSemanticDiff(context, 'focus'),
	}),
	MixedImportAndLogic: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['One Logic hunk contains added imports followed by a comment and matcher. Imports and the comment use cold purple markers while the matcher uses a hot full-purple marker. The Logic filter selects the whole hunk. In high contrast themes, cold is dotted and hot is solid while both retain the Logic type color.'],
		render: context => renderSemanticDiff(context, 'mixed'),
	}),
	BlockAttention: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['One Logic filter with count 1 selects the entire hunk. The import and blank line have a cold quiet purple marker; resolving the target has a warm purple marker; the three-line guard has a hot full-purple marker. Unchanged lines have no markers. In high contrast themes the corresponding Logic markers are dotted, dashed, and solid.'],
		render: context => renderSemanticDiff(context, 'attention'),
	}),
	WrappedReplacement: defineComponentFixture({
		expectedVisualDescriptions: ['A single far-left purple type bar spans the wrapped removed and added lines in the first replacement without gaps or horizontal jumps. Unchanged lines between replacements remain unmarked.'],
		render: context => renderSemanticDiff(context, 'wrapped', 380),
	}),
	InsertedFunction: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The purple type marker aligns exactly with the native green inserted block, including its leading blank line. It stops at the closing brace, leaving the following blank line and existing function unmarked.'],
		render: context => renderSemanticDiff(context, 'insert'),
	}),
	DeletedFunction: defineComponentFixture({
		expectedVisualDescriptions: ['The purple type marker aligns exactly with the native deleted function block and does not extend onto the surviving blank line before the existing function.'],
		render: context => renderSemanticDiff(context, 'delete'),
	}),
	EmptyFilters: defineComponentFixture({
		expectedVisualDescriptions: ['All type filters are off, but badges still show group-wide counts. A clear No hunks match the selected types message appears, with no diff files or misleading No changes message.'],
		render: context => renderSemanticDiff(context, 'empty'),
	}),
	SourceUnavailable: defineComponentFixture({
		expectedVisualDescriptions: ['A source-unavailable explanation and enabled Retry Source action replace the diff contents. Source verification is not claimed.'],
		render: context => renderSemanticDiff(context, 'error'),
	}),
	Loading: defineComponentFixture({ render: context => renderSemanticDiff(context, 'loading') }),
	Partial: defineComponentFixture({ render: context => renderSemanticDiff(context, 'partial') }),
	Narrow: defineComponentFixture({
		expectedVisualDescriptions: ['At narrow width only the filter toolbar appears above the native inline diff and wraps when needed. Filename and counts stay inside the file header.'],
		render: context => renderSemanticDiff(context, 'all', 380),
	}),
});
