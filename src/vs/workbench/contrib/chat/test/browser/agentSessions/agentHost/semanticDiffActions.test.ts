/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { fromAgentHostUri, isAgentHostContentRefUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { ISemanticDiffAnalysis } from '../../../../../../../platform/agentHost/common/semanticDiff.js';
import { parseSemanticDiffContentUri } from '../../../../../../../platform/agentHost/common/semanticDiffContent.js';
import { createSemanticDiffExample } from '../../../../../../../platform/agentHost/test/common/semanticDiffFixtures.js';
import { createSemanticDiffGroupEditorInput } from '../../../../browser/agentSessions/agentHost/semanticDiffActions.js';
import { ISemanticDiffCardActionContext } from '../../../../common/semanticDiffCard.js';

suite('Semantic diff group changes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('agent-host-copilot:/session');
	const backendSession = URI.parse('copilot:/session');

	function context(analysis: ISemanticDiffAnalysis, groupId: string): ISemanticDiffCardActionContext {
		const report = createSemanticDiffExample();
		report.analysis = analysis;
		return { sessionResource, responseId: 'response', toolCallId: 'tool', groupId, report };
	}

	function describe(resource: URI | undefined) {
		if (!resource) {
			return undefined;
		}
		const request = parseSemanticDiffContentUri(fromAgentHostUri(resource));
		return {
			contentRef: isAgentHostContentRefUri(resource),
			displayPath: resource.path,
			session: request?.sessionUri,
			comparison: request && [request.comparison, request.baseRevision, request.targetRevision],
			side: request?.side,
			path: request?.path,
			hunks: request?.hunks.length,
		};
	}

	test('opens each file of the group with only its hunks, computed from the walkthrough comparison', () => {
		const { analysis } = createSemanticDiffExample();
		analysis.files.push({ id: 'added', path: 'src/new.ts', oldPath: null, status: 'added', contentKind: 'text' });
		analysis.hunks.push({ ...analysis.hunks[0], id: 'added-hunk', fileId: 'added', oldRange: { start: 0, count: 0 }, newRange: { start: 1, count: 3 }, additions: 3, deletions: 0 });
		const group = analysis.groups[0];
		const { comparison, baseRevision, targetRevision } = analysis.source;
		const input = createSemanticDiffGroupEditorInput(context(analysis, group.id), backendSession, 'remote-host');
		const files = analysis.files.filter(file => analysis.hunks.some(hunk => hunk.fileId === file.id && hunk.classification.groupId === group.id));
		assert.deepStrictEqual({
			label: input?.label,
			source: input?.multiDiffSource?.toString(true),
			resources: input?.resources?.map(resource => ({ original: describe(resource.original.resource), modified: describe(resource.modified.resource) })),
		}, {
			label: group.title,
			source: `multi-diff-editor:/semantic-diff/tool/${group.id}?${sessionResource.toString()}`,
			resources: files.map(file => {
				const hunks = analysis.hunks.filter(hunk => hunk.fileId === file.id && hunk.classification.groupId === group.id).length;
				const side = (name: 'original' | 'modified') => ({ contentRef: true, displayPath: `/${file.path}`, session: backendSession.toString(), comparison: [comparison, baseRevision, targetRevision], side: name, path: file.path, hunks });
				return { original: file.status === 'added' ? undefined : side('original'), modified: file.status === 'deleted' ? undefined : side('modified') };
			}),
		});
	});

	test('cannot open an unknown group', () => {
		const { analysis } = createSemanticDiffExample();
		assert.strictEqual(createSemanticDiffGroupEditorInput(context(analysis, 'missing'), backendSession, 'remote-host'), undefined);
	});
});
