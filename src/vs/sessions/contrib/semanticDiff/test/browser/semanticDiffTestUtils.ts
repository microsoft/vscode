/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { buildSemanticDiffReport, ISemanticDiffHunk, ISemanticDiffSubmission, SemanticDiffChangeType } from '../../../../../platform/agentHost/common/semanticDiff.js';
import { resolveSemanticDiffFile } from '../../../../../platform/agentHost/common/semanticDiffProjection.js';
import { ISemanticDiffEditorRequest, ISemanticDiffEditorSource } from '../../../../../workbench/contrib/chat/common/semanticDiffEditor.js';

export function createSemanticDiffEditorData(types: readonly (SemanticDiffChangeType | null)[] = ['supporting', 'logic', 'test']): { request: ISemanticDiffEditorRequest; source: ISemanticDiffEditorSource } {
	const file = { id: 'file', path: 'src/billing/total.ts', oldPath: null, status: 'modified', contentKind: 'text' } as const;
	const originalLines = ['// Billing', 'const tax = 0;', '', 'const cap = 100;', '', 'const tested = false;', '', 'const unrelated = false;'];
	const modifiedLines = ['// Billing', 'const tax = 0.2;', '', 'const cap = 90;', '', 'const tested = true;', '', 'const unrelated = true;'];
	const hunks: ISemanticDiffHunk[] = [2, 4, 6, 8].map((line, index) => ({
		id: `hunk-${index}`, fileId: file.id,
		oldRange: { start: line, count: 1 }, newRange: { start: line, count: 1 }, additions: 1, deletions: 1,
		classification: {
			groupId: index === 3 ? 'other' : 'billing',
			changeType: index === 3 ? 'logic' : types[index % types.length],
			secondaryChangeTypes: index === 1 && types[index % types.length] === 'logic' ? ['supporting'] : [],
			summary: ['Adjust the tax rate.', 'Cap the billing total.', 'Add regression coverage.', 'Unrelated change.'][index],
			groupReason: 'Shares the billing intent.',
			typeReason: 'Classified by its primary purpose.',
			groupConfidence: 'high',
			typeConfidence: types[index % types.length] === null ? null : 'high',
			uncertainty: types[index % types.length] === null ? 'The primary purpose needs review.' : null,
		},
	}));
	const submission: ISemanticDiffSubmission = {
		schemaVersion: 1,
		analysis: {
			source: {
				repositoryLabel: 'Billing example', comparison: 'commitRange',
				baseRevision: '1111111111111111111111111111111111111111',
				targetRevision: '2222222222222222222222222222222222222222',
				diffFingerprint: null, capturedAt: '2026-09-14T10:00:00Z', inventoryComplete: true,
			},
			groups: [
				{ id: 'billing', title: 'Guard billing totals', description: 'Constrain billing totals and retain regression coverage.' },
				{ id: 'other', title: 'Unrelated work', description: 'Must not appear in the billing projection.' },
			],
			files: [file],
			hunks,
			limitations: [],
		},
	};
	const result = buildSemanticDiffReport(submission);
	if (!result.ok) {
		throw new Error(JSON.stringify(result.error));
	}

	const patch = [
		`diff --git a/${file.path} b/${file.path}`, 'index 1111111..2222222 100644', `--- a/${file.path}`, `+++ b/${file.path}`,
		...hunks.flatMap(hunk => [
			`@@ -${hunk.oldRange.start} +${hunk.newRange.start} @@`,
			`-${originalLines[hunk.oldRange.start - 1]}`, `+${modifiedLines[hunk.newRange.start - 1]}`,
		]), '',
	].join('\n');
	return {
		request: {
			sessionResource: URI.parse('agent-host-copilot:/semantic-diff-session'), responseId: 'response', toolCallId: 'call',
			groupId: 'billing', report: result.report, repositoryUri: 'file:///billing',
		},
		source: {
			repository: URI.file('/billing'),
			files: [resolveSemanticDiffFile(file, hunks, originalLines.join('\n') + '\n', modifiedLines.join('\n') + '\n', patch)],
		},
	};
}

export function createSemanticDiffContextData(lineSuffix = '', withReviewFocus = false): ReturnType<typeof createSemanticDiffEditorData> {
	const data = createSemanticDiffEditorData();
	const file = data.request.report.analysis.files[0];
	const template = data.request.report.analysis.hunks[1];
	const hunks: ISemanticDiffHunk[] = [
		{
			...template, id: 'context', oldRange: { start: 1, count: 5 }, newRange: { start: 1, count: 6 }, additions: 3, deletions: 2,
			...(withReviewFocus ? {
				reviewFocus: {
					oldRanges: [{ start: 4, count: 1 }],
					newRanges: [{ start: 5, count: 1 }],
					reason: 'The second replacement changes the guarded billing outcome.',
				},
			} : {}),
		},
		{
			...template, id: 'deletion', oldRange: { start: 9, count: 3 }, newRange: { start: 10, count: 2 }, additions: 0, deletions: 1,
			classification: { ...template.classification, changeType: 'test', secondaryChangeTypes: [], summary: 'Remove the obsolete check.' },
		},
	];
	const original = `head\nbefore-a${lineSuffix}\nmiddle\nbefore-b\ntail\ngap6\ngap7\ngap8\ngap9\ndelete\nlast\n`;
	const modified = `head\nafter-a${lineSuffix}\ninserted\nmiddle\nafter-b\ntail\ngap6\ngap7\ngap8\ngap9\nlast\n`;
	const patch = `diff --git a/${file.path} b/${file.path}\nindex 1111111..2222222 100644\n--- a/${file.path}\n+++ b/${file.path}\n@@ -1,5 +1,6 @@\n head\n-before-a${lineSuffix}\n+after-a${lineSuffix}\n+inserted\n middle\n-before-b\n+after-b\n tail\n@@ -9,3 +10,2 @@\n gap9\n-delete\n last\n`;
	const validated = buildSemanticDiffReport({
		schemaVersion: 1,
		analysis: { ...data.request.report.analysis, groups: [data.request.report.analysis.groups[0]], hunks },
	});
	if (!validated.ok) {
		throw new Error(validated.error.error.message);
	}
	return {
		request: { ...data.request, report: validated.report },
		source: { repository: data.source.repository, files: [resolveSemanticDiffFile(file, hunks, original, modified, patch)] },
	};
}

export function createSemanticDiffMixedImportData(): ReturnType<typeof createSemanticDiffEditorData> {
	const data = createSemanticDiffEditorData();
	const file = data.request.report.analysis.files[0];
	const template = data.request.report.analysis.hunks[1];
	const hunk: ISemanticDiffHunk = {
		...template,
		id: 'mixed-import-logic',
		oldRange: { start: 1, count: 5 },
		newRange: { start: 1, count: 10 },
		additions: 5,
		deletions: 0,
		classification: {
			...template.classification,
			changeType: 'logic',
			secondaryChangeTypes: ['supporting'],
			summary: 'Detect linked-worktree metadata paths.',
			typeReason: 'The matcher changes routing behavior; imports, documentation, and spacing support it.',
		},
		changeTypeRanges: [
			{ changeType: 'logic', oldRanges: [], newRanges: [{ start: 6, count: 1 }] },
			{ changeType: 'supporting', oldRanges: [], newRanges: [{ start: 1, count: 2 }, { start: 5, count: 1 }, { start: 7, count: 1 }] },
		],
	};
	const original = `import { URI } from './uri.js';\n\nexport function findWindow() {\n\treturn undefined;\n}\n`;
	const modified = `import * as fs from 'fs';\nimport { resolve } from './path.js';\nimport { URI } from './uri.js';\n\n// Matches linked-worktree metadata paths.\nconst gitWorktreeFilePathRegex = /worktrees/;\n\nexport function findWindow() {\n\treturn undefined;\n}\n`;
	const patch = `diff --git a/${file.path} b/${file.path}\nindex 1111111..2222222 100644\n--- a/${file.path}\n+++ b/${file.path}\n@@ -1,5 +1,10 @@\n+import * as fs from 'fs';\n+import { resolve } from './path.js';\n import { URI } from './uri.js';\n \n+// Matches linked-worktree metadata paths.\n+const gitWorktreeFilePathRegex = /worktrees/;\n+\n export function findWindow() {\n \treturn undefined;\n }\n`;
	const validated = buildSemanticDiffReport({
		schemaVersion: 1,
		analysis: { ...data.request.report.analysis, groups: [data.request.report.analysis.groups[0]], hunks: [hunk] },
	});
	if (!validated.ok) {
		throw new Error(validated.error.error.message);
	}
	return {
		request: { ...data.request, report: validated.report },
		source: { repository: data.source.repository, files: [resolveSemanticDiffFile(file, [hunk], original, modified, patch)] },
	};
}

export function createSemanticDiffBoundaryData(direction: 'insert' | 'delete' = 'insert'): ReturnType<typeof createSemanticDiffEditorData> {
	const data = createSemanticDiffEditorData();
	const file = data.request.report.analysis.files[0];
	const inserting = direction === 'insert';
	const before = 'import { a } from "a";\n\nexport function existing() {\n\treturn undefined;\n}\n';
	const after = 'import { a } from "a";\n\nexport function added() {\n\treturn 1;\n}\n\nexport function existing() {\n\treturn undefined;\n}\n';
	const hunk: ISemanticDiffHunk = {
		...data.request.report.analysis.hunks[1],
		oldRange: { start: 1, count: inserting ? 5 : 9 }, newRange: { start: 1, count: inserting ? 9 : 5 },
		additions: inserting ? 4 : 0, deletions: inserting ? 0 : 4,
	};
	const sign = inserting ? '+' : '-';
	const patch = [
		`diff --git a/${file.path} b/${file.path}`, 'index 1111111..2222222 100644', `--- a/${file.path}`, `+++ b/${file.path}`,
		`@@ -1,${hunk.oldRange.count} +1,${hunk.newRange.count} @@`,
		' import { a } from "a";', ' ',
		`${sign}export function added() {`, `${sign}\treturn 1;`, `${sign}}`, sign,
		' export function existing() {', ' \treturn undefined;', ' }', '',
	].join('\n');
	const validated = buildSemanticDiffReport({
		schemaVersion: 1,
		analysis: { ...data.request.report.analysis, groups: [data.request.report.analysis.groups[0]], hunks: [hunk] },
	});
	if (!validated.ok) {
		throw new Error(validated.error.error.message);
	}
	return {
		request: { ...data.request, report: validated.report },
		source: { repository: data.source.repository, files: [resolveSemanticDiffFile(file, [hunk], inserting ? before : after, inserting ? after : before, patch)] },
	};
}
