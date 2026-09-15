/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createPullRequestDetailsResult, createPullRequestOperationMeta, createPullRequestValidationMeta, readPullRequestDetailsResult, readPullRequestOperationMeta, readPullRequestValidationMeta, type IPullRequestContext, type IPullRequestCreateOptions, type IPullRequestDetails } from '../../common/meta/agentPullRequestOperationMeta.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { InvokeChangesetOperationResult } from '../../common/state/protocol/channels-changeset/commands.js';

const createOptions: IPullRequestCreateOptions = {
	title: '  Submitted title  ',
	description: '\n## Description\n\nKeep whitespace, % and # fragments.\n',
	draft: false,
	agentMerge: false,
	autoMergeMethod: 'SQUASH',
};

const details: IPullRequestDetails = {
	title: 'Generated title',
	description: 'Description with "quotes", % and # fragments.',
	branchName: 'feature/test',
	baseBranchName: 'main',
	repository: 'microsoft/vscode',
	autoMergeAllowed: true,
	mergeMethods: ['MERGE', 'SQUASH', 'REBASE'],
	agentMergeAvailable: false,
};

function resultWithData(data: unknown): InvokeChangesetOperationResult {
	return { followUp: { content: { uri: `data:application/json,${encodeURIComponent(JSON.stringify(data))}`, contentType: 'application/json' } } };
}

function isInvalidParamsError(error: unknown): boolean {
	return error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams;
}

suite('Agent pull request operation metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const context: IPullRequestContext = {
		workingDirectory: 'file:///repo', repository: 'microsoft/vscode', branchName: 'feature/test', baseBranchName: 'main',
		headOwner: 'contributor', upstreamBranchName: 'fork/topic',
	};

	test('preserves prepared identity across preparation, validation, and creation', () => {
		assert.deepStrictEqual({
			prepared: readPullRequestDetailsResult(createPullRequestDetailsResult({ ...details, context })).context,
			validated: readPullRequestValidationMeta({ _meta: createPullRequestValidationMeta(context) }),
			submitted: readPullRequestOperationMeta({ _meta: createPullRequestOperationMeta({ ...createOptions, expectedContext: context }) })?.expectedContext,
		}, { prepared: context, validated: context, submitted: context });
	});

	for (const invalidContext of [null, {}, { ...context, repository: '' }, { ...context, branchName: 42 }, { ...context, headOwner: false }, { ...context, upstreamBranchName: '' }]) {
		test(`rejects malformed prepared identity: ${JSON.stringify(invalidContext)}`, () => {
			assert.throws(() => readPullRequestOperationMeta({ _meta: { 'vscode.pullRequest': { ...createOptions, expectedContext: invalidContext } } }), /Invalid pull request preparation context/);
			assert.throws(() => readPullRequestDetailsResult(resultWithData({ ...details, context: invalidContext })), /Invalid pull request preparation context/);
			assert.throws(() => readPullRequestValidationMeta({ _meta: { 'vscode.pullRequest': { validateOnly: true, expectedContext: invalidContext } } }), /Invalid pull request preparation context/);
		});
	}

	test('does not treat malformed validation requests as ordinary preparation', () => {
		assert.throws(() => readPullRequestValidationMeta({ _meta: { 'vscode.pullRequest': { validateOnly: false, expectedContext: context } } }), /Invalid pull request context validation request/);
		assert.deepStrictEqual([
			readPullRequestValidationMeta({}),
			readPullRequestValidationMeta({ _meta: { unrelated: true } }),
		], [undefined, undefined]);
	});

	test('round trips namespaced creation options without altering submitted text', () => {
		const meta = createPullRequestOperationMeta(createOptions);
		assert.deepStrictEqual({
			meta,
			options: readPullRequestOperationMeta({ _meta: meta }),
		}, {
			meta: { 'vscode.pullRequest': createOptions },
			options: createOptions,
		});
	});

	test('keeps absent creation options distinct from malformed options', () => {
		assert.deepStrictEqual([
			readPullRequestOperationMeta({}),
			readPullRequestOperationMeta({ _meta: {} }),
			readPullRequestOperationMeta({ _meta: { 'other.extension': {} } }),
		], [undefined, undefined, undefined]);
	});

	for (const [name, value] of [
		['undefined', undefined],
		['null', null],
		['array', []],
		['string', 'create'],
		['missing fields', { title: 'Title' }],
		['blank title', { ...createOptions, title: ' \n\t' }],
		['non-string title', { ...createOptions, title: 5 }],
		['non-string description', { ...createOptions, description: null }],
		['non-boolean draft', { ...createOptions, draft: 'false' }],
		['non-boolean Agent Merge', { ...createOptions, agentMerge: 1 }],
		['unrecognized merge method', { ...createOptions, autoMergeMethod: 'squash' }],
		['null merge method', { ...createOptions, autoMergeMethod: null }],
		['draft auto-merge', { ...createOptions, draft: true }],
		['conflicting automation', { ...createOptions, agentMerge: true }],
	] as const) {
		test(`rejects ${name} creation options`, () => {
			assert.throws(() => readPullRequestOperationMeta({ _meta: { 'vscode.pullRequest': value } }), isInvalidParamsError);
		});
	}

	test('allows a draft with Agent Merge and an empty description', () => {
		const options: IPullRequestCreateOptions = { title: 'Draft title', description: '', draft: true, agentMerge: true };
		assert.deepStrictEqual(readPullRequestOperationMeta({ _meta: createPullRequestOperationMeta(options) }), options);
	});

	test('round trips session-only Agent Merge options in preparation and submission', () => {
		const agentMergeOptions = { addressReviews: false, fixCI: true, resolveConflicts: false, mergePullRequest: 'ifUnchanged' as const };
		const options = { ...createOptions, agentMerge: true, autoMergeMethod: undefined, agentMergeOptions };
		const prepared = { ...details, agentMergeAvailable: true, agentMergeOptions };
		assert.deepStrictEqual({
			submitted: readPullRequestOperationMeta({ _meta: createPullRequestOperationMeta(options) }),
			prepared: readPullRequestDetailsResult(createPullRequestDetailsResult(prepared)),
		}, {
			submitted: { title: options.title, description: options.description, draft: false, agentMerge: true, agentMergeOptions },
			prepared,
		});
	});

	for (const [name, agentMergeOptions] of [
		['null', null],
		['missing fields', {}],
		['invalid repair flag', { addressReviews: false, fixCI: 'true', resolveConflicts: true, mergePullRequest: 'never' }],
		['invalid merge policy', { addressReviews: true, fixCI: true, resolveConflicts: true, mergePullRequest: true }],
	] as const) {
		test(`rejects ${name} Agent Merge configuration in both directions`, () => {
			assert.throws(() => readPullRequestOperationMeta({
				_meta: {
					'vscode.pullRequest': { title: 'Title', description: '', draft: false, agentMerge: true, agentMergeOptions },
				}
			}), /Invalid Agent Merge configuration/);
			assert.throws(() => readPullRequestDetailsResult(resultWithData({ ...details, agentMergeOptions })), /Invalid Agent Merge configuration/);
		});
	}

	test('rejects session configuration when Agent Merge is not selected', () => {
		assert.throws(() => readPullRequestOperationMeta({
			_meta: {
				'vscode.pullRequest': {
					...createOptions,
					agentMergeOptions: { addressReviews: true, fixCI: true, resolveConflicts: true, mergePullRequest: 'always' },
				}
			}
		}), /Enable Agent Merge/);
	});

	test('only forwards the supported session override fields', () => {
		const agentMergeOptions = { addressReviews: true, fixCI: false, resolveConflicts: true, mergePullRequest: 'never' };
		const options = readPullRequestOperationMeta({
			_meta: {
				'vscode.pullRequest': {
					title: 'Title', description: '', draft: false, agentMerge: true,
					agentMergeOptions: { ...agentMergeOptions, mergeMethod: 'merge', replyAttribution: false },
				}
			}
		});
		assert.deepStrictEqual(options?.agentMergeOptions, agentMergeOptions);
	});

	test('round trips preparation details using a JSON content reference, not a message', () => {
		const result = createPullRequestDetailsResult(details);
		assert.deepStrictEqual({
			result,
			details: readPullRequestDetailsResult(result),
		}, {
			result: resultWithData(details),
			details,
		});
	});

	test('preserves generation failures for manual editing', () => {
		const failed: IPullRequestDetails = { ...details, title: '', description: '', generationError: 'Model unavailable' };
		assert.deepStrictEqual(readPullRequestDetailsResult(createPullRequestDetailsResult(failed)), failed);
	});

	test('serializes an immutable snapshot of preparation details', () => {
		const mutable = { ...details, mergeMethods: [...details.mergeMethods] };
		const result = createPullRequestDetailsResult(mutable);
		mutable.title = 'Changed after preparation';
		mutable.mergeMethods.length = 0;
		assert.deepStrictEqual(readPullRequestDetailsResult(result), details);
	});

	for (const [name, result] of [
		['absent content', {}],
		['human-readable JSON', { message: JSON.stringify(details) }],
		['external follow-up', { ...resultWithData(details), followUp: { ...resultWithData(details).followUp!, external: true } }],
		['wrong content type', { followUp: { content: { uri: resultWithData(details).followUp!.content.uri, contentType: 'text/html' } } }],
		...[
			'https://example.com/details.json',
			'data:text/html,%7B%7D',
			'data:application/json;base64,e30=',
			'data:application/json,',
			'data:application/json,%zz',
			'data:application/json,%E0%A4',
			'data:application/json,not-json',
			`${resultWithData(details).followUp!.content.uri}#fragment`,
			`${resultWithData(details).followUp!.content.uri}?query`,
		].map(uri => [uri, { followUp: { content: { uri, contentType: 'application/json' } } }] as const),
	] satisfies ReadonlyArray<readonly [string, InvokeChangesetOperationResult]>) {
		test(`rejects invalid preparation content: ${name}`, () => {
			assert.throws(() => readPullRequestDetailsResult(result), /Invalid pull request preparation result/);
		});
	}

	for (const [name, data] of [
		['null', null],
		['array', []],
		['missing fields', {}],
		['non-string title', { ...details, title: 1 }],
		['non-string description', { ...details, description: null }],
		['blank branch', { ...details, branchName: '' }],
		['missing base branch', { ...details, baseBranchName: undefined }],
		['non-string repository', { ...details, repository: false }],
		['non-boolean auto-merge', { ...details, autoMergeAllowed: 'true' }],
		['non-boolean Agent Merge', { ...details, agentMergeAvailable: 1 }],
		['missing merge methods', { ...details, mergeMethods: undefined }],
		['non-array merge methods', { ...details, mergeMethods: 'MERGE' }],
		['unrecognized merge method', { ...details, mergeMethods: ['merge'] }],
		['non-string generation error', { ...details, generationError: {} }],
	] as const) {
		test(`rejects ${name} in preparation details`, () => {
			assert.throws(() => readPullRequestDetailsResult(resultWithData(data)), /Invalid pull request preparation result/);
		});
	}
});
