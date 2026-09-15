/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { buildSemanticDiffReport, ISemanticDiffAnalysis, SemanticDiffValidationResult, validateSemanticDiffReport } from '../../../../../platform/agentHost/common/semanticDiff.js';
import { createSemanticDiffExample } from '../../../../../platform/agentHost/test/common/semanticDiffFixtures.js';
import { ChatSemanticDiffResultSubPart } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatSemanticDiffResultSubPart.js';
import { IChatSemanticDiffData, IChatToolInvocationSerialized } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';

function renderResult({ container, disposableStore, theme, fileIconTheme }: ComponentFixtureContext, result: SemanticDiffValidationResult, options: { expanded?: 'files' | 'details'; narrow?: boolean; zoom?: boolean } = {}): void {
	container.style.width = options.narrow ? '320px' : '600px';
	container.style.padding = '12px';
	container.style.boxSizing = 'border-box';
	if (options.zoom) {
		container.style.setProperty('--vscode-chat-font-size-body-s', '26px');
	}
	const data: IChatSemanticDiffData = { kind: 'semanticDiff', result };
	const invocation = upcastPartial<IChatToolInvocationSerialized>({
		kind: 'toolInvocationSerialized',
		toolCallId: 'fixture-classification',
		isComplete: true,
		toolSpecificData: data,
	});
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme, fileIconTheme, additionalServices: registerChatFixtureServices });
	disposableStore.add(instantiationService.get(ILanguageService).registerLanguage({ id: 'javascript', extensions: ['.js'] }));
	disposableStore.add(instantiationService.get(ILanguageService).registerLanguage({ id: 'json', extensions: ['.json'] }));
	const part = disposableStore.add(instantiationService.createInstance(ChatSemanticDiffResultSubPart, invocation, data, {}, false, undefined));
	container.appendChild(part.domNode);
	if (options.expanded) {
		part.domNode.querySelector<HTMLElement>('.semantic-diff-group-toggle')?.click();
	}
	if (options.expanded === 'details') {
		part.domNode.querySelector<HTMLElement>('.semantic-diff-file-toggle')?.click();
		part.domNode.querySelector<HTMLElement>('.semantic-diff-rationale-toggle')?.click();
	}
}

function partialResult(): SemanticDiffValidationResult {
	const { analysis } = createSemanticDiffExample();
	return buildSemanticDiffReport({
		schemaVersion: 1,
		analysis: {
			...analysis,
			source: { ...analysis.source, inventoryComplete: false },
			files: [...analysis.files, { id: 'binary', path: 'assets/chart.png', oldPath: null, status: 'added', contentKind: 'binary' }],
			hunks: analysis.hunks.map((hunk, index) => index ? hunk : {
				...hunk,
				classification: {
					...hunk.classification,
					groupId: null, groupConfidence: null,
					changeType: null, typeConfidence: null,
					secondaryChangeTypes: [],
					uncertainty: 'The surrounding context was omitted.',
				},
			}),
			limitations: [
				{ code: 'incompleteInventory', message: 'The submitted inventory is incomplete.', fileId: null, hunkId: null },
				{ code: 'truncatedDiff', message: 'Only part of the diff was submitted.', fileId: null, hunkId: null },
				{ code: 'staleSource', message: 'The source changed after this analysis was captured.', fileId: null, hunkId: null },
				{ code: 'nonTextChange', message: 'Binary image changes cannot be classified as text hunks.', fileId: 'binary', hunkId: null },
			],
		} satisfies ISemanticDiffAnalysis,
	});
}

function paragraphResult(): SemanticDiffValidationResult {
	const report = createSemanticDiffExample();
	report.analysis.groups[0].description = 'Keep billing totals non-negative when tax rates are non-positive or a discount exceeds the order value. The tax-rate guard and the discount cap address the same invalid-total path, while regression coverage checks the boundary cases. These changes preserve normal billing calculations and make the exceptional inputs behave consistently.';
	report.analysis.groups[1].description = 'Use one internal name for item quantities as they move from the item adapter into invoice calculations. The rename updates both sides of that handoff so consumers continue to read the value the adapter provides. This is a naming cleanup independent of the billing guards, with no intended change to the quantity calculation.';
	report.analysis.groups[2].description = 'Make the application depend on lodash 4.17.21 and keep the resolved dependency graph aligned with that choice. The manifest selects the new version, while the generated lockfile records the corresponding resolution. Both edits belong to the same dependency upgrade rather than separate hand-authored and generated-code work.';
	return validateSemanticDiffReport(report);
}

function emptyResult(partial: boolean): SemanticDiffValidationResult {
	const { analysis } = createSemanticDiffExample();
	return buildSemanticDiffReport({
		schemaVersion: 1,
		analysis: {
			source: { ...analysis.source, inventoryComplete: !partial },
			groups: [], files: [], hunks: [],
			limitations: partial ? [{ code: 'incompleteInventory', message: 'No inventory was captured for this comparison.', fileId: null, hunkId: null }] : [],
		} satisfies ISemanticDiffAnalysis,
	});
}

export default defineThemedFixtureGroup({ path: 'chat/semanticDiff/' }, {
	Example: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'Three collapsed intent cards lead with their titles and paragraph summaries. Each upper-right control shows a neutral file count followed by green additions and red deletions, with no chevron or duplicate totals beneath the summary. Equal inner padding and subtle ordinal accents distinguish intents, not change types.',
		],
		render: context => renderResult(context, paragraphResult()),
	}),
	BillingDetails: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The first intent card reveals three file rows, including its regression test. The calculation file reveals two hunks and the first classification rationale. The other two cards remain collapsed.',
		],
		render: context => renderResult(context, paragraphResult(), { expanded: 'details' }),
	}),
	FileList: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The first card shows compact file rows with themed icons vertically centered beside filenames and directories, and right-aligned green/red counts. No file-row chevrons, statuses, hunk counts or type badges are visible. Other cards remain collapsed.',
		],
		render: context => renderResult(context, paragraphResult(), { expanded: 'files' }),
	}),
	NarrowZoom: defineComponentFixture({
		expectedVisualDescriptions: [
			'At a 320 pixel width with doubled body text, card titles and nested explanations wrap. Compact file labels ellipsize while the line counts remain visible, with no horizontal page overflow.',
		],
		render: context => renderResult(context, paragraphResult(), { expanded: 'details', narrow: true, zoom: true }),
	}),
	Partial: defineComponentFixture({
		expectedVisualDescriptions: [
			'A visible Partial analysis notice includes overlapping axis counts, truncated-input evidence, and a stale-source warning. Needs grouping and Not analyzed as text preserve missing classifications and the binary file.',
		],
		render: context => renderResult(context, partialResult()),
	}),
	Empty: defineComponentFixture({
		render: context => renderResult(context, emptyResult(false)),
	}),
	PartialEmpty: defineComponentFixture({
		render: context => renderResult(context, emptyResult(true)),
	}),
	Invalid: defineComponentFixture({
		expectedVisualDescriptions: ['An explicit unsupported-result error appears, without any intent cards.'],
		render: context => renderResult(context, validateSemanticDiffReport({ ...createSemanticDiffExample(), schemaVersion: 2 })),
	}),
});
