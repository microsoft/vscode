/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { buildSemanticDiffReport, ISemanticDiffAnalysis, SemanticDiffValidationResult, validateSemanticDiffReport } from '../../../../../platform/agentHost/common/semanticDiff.js';
import { createSemanticDiffExample } from '../../../../../platform/agentHost/test/common/semanticDiffFixtures.js';
import { ChatSemanticDiffResultSubPart } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatSemanticDiffResultSubPart.js';
import { IChatSemanticDiffData, IChatToolInvocationSerialized } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

function renderResult({ container, disposableStore }: ComponentFixtureContext, result: SemanticDiffValidationResult, options: { expanded?: boolean; narrow?: boolean; zoom?: boolean } = {}): void {
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
	const part = disposableStore.add(new ChatSemanticDiffResultSubPart(invocation, data, {}, false));
	container.appendChild(part.domNode);
	if (options.expanded) {
		part.domNode.querySelector<HTMLElement>('.semantic-diff-group-toggle')?.click();
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
			'Three collapsed intent cards lead with their titles, descriptions, file and hunk counts. Equal inner padding and subtle ordinal accents distinguish intents, not change types.',
		],
		render: context => renderResult(context, { ok: true, report: createSemanticDiffExample() }),
	}),
	BillingDetails: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The first intent card reveals three file rows, including its regression test. The calculation file reveals two hunks and the first classification rationale. The other two cards remain collapsed.',
		],
		render: context => renderResult(context, { ok: true, report: createSemanticDiffExample() }, { expanded: true }),
	}),
	NarrowZoom: defineComponentFixture({
		expectedVisualDescriptions: [
			'At a 320 pixel width with doubled body text, titles, full paths, counts, and nested explanations wrap without horizontal clipping or overlapping controls.',
		],
		render: context => renderResult(context, { ok: true, report: createSemanticDiffExample() }, { expanded: true, narrow: true, zoom: true }),
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
