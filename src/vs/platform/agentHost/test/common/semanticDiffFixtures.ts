/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISemanticDiffReport } from '../../common/semanticDiff.js';

/** The illustrative v1 billing example, with three intents, six files, eight hunks, and +17/-10. */
export function createSemanticDiffExample(): ISemanticDiffReport {
	return {
		schemaVersion: 1,
		kind: 'semanticDiffClassification',
		status: 'complete',
		sourceVerification: 'agent-reported',
		analysis: {
			source: {
				repositoryLabel: 'Example billing application',
				comparison: 'staged',
				baseRevision: '1111111111111111111111111111111111111111',
				targetRevision: null,
				diffFingerprint: null,
				capturedAt: '2026-09-14T10:00:00Z',
				inventoryComplete: true
			},
			groups: [
				{
					id: 'prevent-negative-totals',
					title: 'Prevent negative billing totals',
					description: 'Guard non-positive tax rates and cap discounts at 100%, with regression coverage and local cleanup in the affected calculation.'
				},
				{
					id: 'standardize-quantity',
					title: 'Standardize the internal quantity field',
					description: 'Rename the internal quantity field in the item adapter and its invoice consumer. This is independent of the billing guard.'
				},
				{
					id: 'upgrade-lodash',
					title: 'Upgrade lodash to 4.17.21',
					description: 'Select lodash 4.17.21 in the dependency manifest and update the generated lockfile to match.'
				}
			],
			files: [
				{ id: 'f-calc', path: 'src/billing/calculateTotal.js', oldPath: null, status: 'modified', contentKind: 'text' },
				{ id: 'f-discount', path: 'src/billing/discountEngine.js', oldPath: null, status: 'modified', contentKind: 'text' },
				{ id: 'f-calc-tests', path: 'src/billing/calculateTotal.test.js', oldPath: null, status: 'modified', contentKind: 'text' },
				{ id: 'f-invoice', path: 'src/billing/invoice.js', oldPath: null, status: 'modified', contentKind: 'text' },
				{ id: 'f-manifest', path: 'package.json', oldPath: null, status: 'modified', contentKind: 'text' },
				{ id: 'f-lock', path: 'package-lock.json', oldPath: null, status: 'modified', contentKind: 'text' }
			],
			hunks: [
				{
					id: 'f-calc:h1', fileId: 'f-calc',
					oldRange: { start: 1, count: 5 }, newRange: { start: 1, count: 5 }, additions: 3, deletions: 3,
					classification: {
						groupId: 'prevent-negative-totals', changeType: 'supporting',
						summary: 'Normalize spacing in the billing calculation loop.',
						groupReason: 'The formatting is confined to the calculation being guarded, rather than part of an independent cleanup task.',
						typeReason: 'Only token spacing changes; the loop expressions and control flow are unchanged.',
						groupConfidence: 'medium', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'cold', oldRanges: [{ start: 1, count: 3 }], newRanges: [{ start: 1, count: 3 }], reason: 'Formatting-only changes.' }]
				},
				{
					id: 'f-calc:h2', fileId: 'f-calc',
					oldRange: { start: 10, count: 3 }, newRange: { start: 10, count: 4 }, additions: 2, deletions: 1,
					classification: {
						groupId: 'prevent-negative-totals', changeType: 'logic',
						summary: 'Guard the tax-rate branch and reformat its condition.',
						groupReason: 'This is the tax-rate guard described by the billing fix and exercised by its regression tests.',
						typeReason: 'The new condition changes which rates are applied; a line wrap in the same hunk is supporting.',
						groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'hot', oldRanges: [{ start: 10, count: 1 }], newRanges: [{ start: 10, count: 2 }], reason: 'The condition changes billing behavior.' }]
				},
				{
					id: 'f-calc:h3', fileId: 'f-calc',
					oldRange: { start: 30, count: 3 }, newRange: { start: 31, count: 3 }, additions: 1, deletions: 1,
					classification: {
						groupId: 'standardize-quantity', changeType: 'supporting',
						summary: 'Rename the private item adapter field from qty to quantity.',
						groupReason: 'This edit matches the invoice consumer\'s internal field rename and is not required by the tax guard.',
						typeReason: 'The inspected internal producer and consumer change together without changing the value or an external contract.',
						groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'cold', oldRanges: [{ start: 30, count: 1 }], newRanges: [{ start: 31, count: 1 }], reason: 'Mechanical internal rename.' }]
				},
				{
					id: 'f-discount:h1', fileId: 'f-discount',
					oldRange: { start: 10, count: 3 }, newRange: { start: 10, count: 4 }, additions: 2, deletions: 1,
					classification: {
						groupId: 'prevent-negative-totals', changeType: 'logic',
						summary: 'Cap discount percentages at 100%.',
						groupReason: 'The cap addresses the other negative-total path covered by the same billing regression tests.',
						typeReason: 'Discount inputs above 100% now produce a different result.',
						groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'hot', oldRanges: [{ start: 10, count: 1 }], newRanges: [{ start: 10, count: 2 }], reason: 'The cap changes billing behavior.' }]
				},
				{
					id: 'f-calc-tests:h1', fileId: 'f-calc-tests',
					oldRange: { start: 40, count: 0 }, newRange: { start: 41, count: 5 }, additions: 5, deletions: 0,
					classification: {
						groupId: 'prevent-negative-totals', changeType: 'test',
						summary: 'Add regression assertions for tax rates and capped discounts.',
						groupReason: 'The assertions exercise the two changed billing behaviors, so they belong with those implementations.',
						typeReason: 'This hunk adds test assertions, not production behavior.',
						groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'hot', oldRanges: [], newRanges: [{ start: 41, count: 5 }], reason: 'Regression assertions distinguish the behavior.' }]
				},
				{
					id: 'f-invoice:h1', fileId: 'f-invoice',
					oldRange: { start: 8, count: 1 }, newRange: { start: 8, count: 1 }, additions: 1, deletions: 1,
					classification: {
						groupId: 'standardize-quantity', changeType: 'supporting',
						summary: 'Use quantity in the internal invoice calculation.',
						groupReason: 'This consumer follows the matching private item adapter rename.',
						typeReason: 'The arithmetic is unchanged and the inspected internal producer supplies the renamed field.',
						groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'cold', oldRanges: [{ start: 8, count: 1 }], newRanges: [{ start: 8, count: 1 }], reason: 'Mechanical internal rename.' }]
				},
				{
					id: 'f-manifest:h1', fileId: 'f-manifest',
					oldRange: { start: 12, count: 3 }, newRange: { start: 12, count: 3 }, additions: 1, deletions: 1,
					classification: {
						groupId: 'upgrade-lodash', changeType: 'logic',
						summary: 'Select lodash 4.17.21 as a runtime dependency.',
						groupReason: 'The manifest selects the version represented by the lockfile update.',
						typeReason: 'Changing the selected runtime dependency can change production behavior; this is not just formatting.',
						groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'hot', oldRanges: [{ start: 12, count: 1 }], newRanges: [{ start: 12, count: 1 }], reason: 'The selected runtime dependency changes.' }]
				},
				{
					id: 'f-lock:h1', fileId: 'f-lock',
					oldRange: { start: 20, count: 4 }, newRange: { start: 20, count: 4 }, additions: 2, deletions: 2,
					classification: {
						groupId: 'upgrade-lodash', changeType: 'supporting',
						summary: 'Update generated lockfile metadata for lodash.',
						groupReason: 'The resolved version matches the manifest\'s lodash upgrade.',
						typeReason: 'The changed fields are package-manager-generated resolution metadata for that dependency.',
						groupConfidence: 'high', typeConfidence: 'high', uncertainty: null
					},
					attentionBlocks: [{ attention: 'cold', oldRanges: [{ start: 20, count: 2 }], newRanges: [{ start: 20, count: 2 }], reason: 'Generated lockfile output.' }]
				}
			],
			limitations: []
		},
		summary: {
			groups: 3, files: 6, hunks: 8, uncertainHunks: 0, additions: 17, deletions: 10,
			byChangeType: { logic: 3, test: 1, supporting: 4 }
		}
	};
}
