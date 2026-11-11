/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { ContextSizeConfigKey, createContextSizeConfigSchemaPropertyFromLimits } from '../../common/agentModelConfiguration.js';
import { describeModelRouterModel, describeModelRouterSituation, modelRouterWorkspaceSituation, summarizeModelRouterAttachments } from '../../common/modelRouterSituation.js';
import { MessageAttachmentKind, withSessionGitHubState, withSessionGitState, type MessageAttachment } from '../../common/state/sessionState.js';

suite('modelRouterSituation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('counts attachments by kind and adds up selected lines, without their content', () => {
		const selection = (startLine: number, endLine: number) => ({ range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 4 } } });
		const attachments: MessageAttachment[] = [
			{ type: MessageAttachmentKind.Resource, label: 'cart.js', uri: 'file:///repo/src/cart.js', displayKind: 'document' },
			{ type: MessageAttachmentKind.Resource, label: 'checkout.js', uri: 'file:///repo/src/checkout.js' },
			{ type: MessageAttachmentKind.Resource, label: 'cart.js:10-49', uri: 'file:///repo/src/cart.js', selection: selection(10, 49) },
			{ type: MessageAttachmentKind.Resource, label: 'pay.js:1-2', uri: 'file:///repo/src/pay.js', displayKind: 'selection', selection: selection(1, 2) },
			{ type: MessageAttachmentKind.EmbeddedResource, label: 'screenshot.png', data: 'AAAA', contentType: 'image/png' },
			{ type: MessageAttachmentKind.Resource, label: 'src', uri: 'file:///repo/src', displayKind: 'directory' },
			{ type: MessageAttachmentKind.Annotations, label: 'Review comments', resource: 'annotations:/1' },
			{ type: MessageAttachmentKind.Simple, label: 'Something else', modelRepresentation: 'secret text' },
		];
		assert.deepStrictEqual({ summary: summarizeModelRouterAttachments(attachments), none: summarizeModelRouterAttachments(undefined) }, {
			summary: [
				{ kind: 'document', count: 2 },
				{ kind: 'selection', count: 2, lines: 42 },
				{ kind: 'image', count: 1 },
				{ kind: 'directory', count: 1 },
				{ kind: 'review comments', count: 1 },
				{ kind: 'attachment', count: 1 },
			],
			none: [],
		});
	});

	test('reads the workspace, repository, uncommitted files and pull request from a session\'s state', () => {
		const folder = 'file:///Users/dev/shop-checkout';
		const meta = withSessionGitHubState(withSessionGitState(undefined, { branchName: 'feature', uncommittedChanges: 3 }), folder, { owner: 'contoso', repo: 'shop', pullRequestState: 'open' });
		assert.deepStrictEqual({
			full: modelRouterWorkspaceSituation({ _meta: meta, workingDirectories: [folder] }),
			// A clean tree and a folder that is no repository leave those facts out.
			folderOnly: modelRouterWorkspaceSituation({ _meta: withSessionGitState(undefined, { uncommittedChanges: 0 }), workingDirectories: [folder] }),
			noSession: modelRouterWorkspaceSituation(undefined),
		}, {
			full: { workspace: 'shop-checkout', repository: 'contoso/shop', uncommittedFiles: 3, pullRequest: 'open' },
			folderOnly: { workspace: 'shop-checkout' },
			noSession: {},
		});
	});

	test('describes a turn in a few lines, and says nothing when nothing is known', () => {
		assert.deepStrictEqual({
			full: describeModelRouterSituation({
				attachments: [{ kind: 'document', count: 2 }, { kind: 'selection', count: 1, lines: 40 }, { kind: 'image', count: 1 }],
				mode: 'plan',
				agent: 'Reviewer',
				workspace: 'shop-checkout',
				repository: 'contoso/shop',
				uncommittedFiles: 1,
				pullRequest: 'merged',
			}),
			autopilot: describeModelRouterSituation({ mode: 'autopilot', repository: 'contoso/shop' }),
			empty: describeModelRouterSituation({}),
			none: describeModelRouterSituation(undefined),
		}, {
			full: [
				'Attached: 2 documents, 1 selection (40 lines), 1 image',
				'Plan mode: the agent plans first and carries the plan out when the user is ready',
				'Custom agent chosen by the user: Reviewer',
				'Workspace: shop-checkout (contoso/shop); 1 file with uncommitted changes; the branch has a merged pull request',
			],
			autopilot: ['Autopilot mode: the agent works on its own until the task is done', 'Workspace: contoso/shop'],
			empty: [],
			none: [],
		});
	});

	test('says what a model costs and how much it can read', () => {
		const model = (extra: Partial<IAgentModelInfo>): IAgentModelInfo => ({ provider: 'copilotcli', id: 'm', name: 'M', supportsVision: true, ...extra });
		const windows = (...limits: [number, number]) => ({ type: 'object' as const, properties: { [ContextSizeConfigKey]: createContextSizeConfigSchemaPropertyFromLimits(...limits)! } });
		assert.deepStrictEqual([
			describeModelRouterModel(model({ _meta: { priceCategory: 'very_high' }, configSchema: windows(200_000, 1_000_000) })),
			describeModelRouterModel(model({ _meta: { priceCategory: 'low' } })),
			describeModelRouterModel(model({ configSchema: windows(128_000, 272_000) })),
			describeModelRouterModel(model({})),
		], [
			'very high cost, context window 200K or 1M',
			'low cost',
			'context window 128K or 272K',
			undefined,
		]);
	});
});
