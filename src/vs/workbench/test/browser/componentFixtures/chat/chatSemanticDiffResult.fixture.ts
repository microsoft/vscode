/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { buildSemanticDiffReport, ISemanticDiffAnalysis, SemanticDiffValidationResult } from '../../../../../platform/agentHost/common/semanticDiff.js';
import { createSemanticDiffExample } from '../../../../../platform/agentHost/test/common/semanticDiffFixtures.js';
import { ChatSemanticDiffResultSubPart } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatSemanticDiffResultSubPart.js';
import { IChatSemanticDiffData, IChatToolInvocationSerialized } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';

function renderResult({ container, disposableStore, theme }: ComponentFixtureContext, result: SemanticDiffValidationResult, options: { narrow?: boolean; zoom?: boolean } = {}): void {
	container.style.width = options.narrow ? '320px' : '600px';
	container.style.padding = '12px';
	container.style.boxSizing = 'border-box';
	if (options.zoom) {
		container.style.setProperty('--vscode-chat-font-size-body-s', '26px');
	}
	const data: IChatSemanticDiffData = { kind: 'semanticDiff', state: 'complete', result };
	const invocation = upcastPartial<IChatToolInvocationSerialized>({
		kind: 'toolInvocationSerialized',
		toolCallId: 'fixture-classification',
		isComplete: true,
		toolSpecificData: data,
	});
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme, additionalServices: registerChatFixtureServices });
	const part = disposableStore.add(instantiationService.createInstance(ChatSemanticDiffResultSubPart, invocation, data, {}, false, undefined));
	container.appendChild(part.domNode);
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
					groupConfidence: 'low',
					typeConfidence: 'low',
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
	return buildSemanticDiffReport({ schemaVersion: report.schemaVersion, analysis: report.analysis });
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
			'Three intent cards lead with their titles and paragraph summaries, with no file lists or expandable controls. Each upper-right corner shows a neutral file count followed by green additions and red deletions, with no chevron or duplicate totals beneath the summary. Equal inner padding and subtle ordinal accents distinguish intents, not change types.',
		],
		render: context => renderResult(context, paragraphResult()),
	}),
	NarrowZoom: defineComponentFixture({
		expectedVisualDescriptions: [
			'At a 320 pixel width with doubled body text, card titles, summaries, and file and line counts wrap without horizontal page overflow.',
		],
		render: context => renderResult(context, paragraphResult(), { narrow: true, zoom: true }),
	}),
	Partial: defineComponentFixture({
		expectedVisualDescriptions: [
			'A visible Partial analysis notice includes overlapping axis counts, truncated-input evidence, and a stale-source warning. Not analyzed as text preserves the binary file.',
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
		render: context => renderResult(context, buildSemanticDiffReport({ schemaVersion: 2, analysis: createSemanticDiffExample().analysis })),
	}),
});
