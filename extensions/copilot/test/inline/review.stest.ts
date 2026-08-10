/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { FeedbackGenerator } from '../../src/extension/prompt/node/feedbackGenerator';
import { CHAT_MODEL } from '../../src/platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../src/platform/editing/common/textDocumentSnapshot';
import { ReviewComment } from '../../src/platform/review/common/reviewService';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource, Range } from '../../src/vscodeTypes';
import { ssuite, stest } from '../base/stest';
import { setupSimulationWorkspace, teardownSimulationWorkspace } from '../simulation/inlineChatSimulator';
import { forEachModel, fromFixture } from '../simulation/stestUtil';

const models = [CHAT_MODEL.GPT41];

ssuite({ title: '/review', location: 'inline' }, forEachModel(models, model => {

	stest({ description: 'Binary search with incorrect stop condition', language: 'javascript', model }, async (testingServiceCollection) => {
		const comments = await generateComments(testingServiceCollection, 'review/binary-search-1.js');
		const expectedLine = 4;
		const expectedContent = 'left <= right';
		const expectedMinRelevance = 10;
		const expectedKind = 'bug';
		assertComment(comments, expectedLine, expectedContent, expectedMinRelevance, expectedKind);
	});

	stest({ description: 'Binary search with correct stop condition', language: 'javascript', model }, async (testingServiceCollection) => {
		const comments = await generateComments(testingServiceCollection, 'review/binary-search-2.js');
		assertNoHighPriorityCommentOrBug(comments);
	});

	stest({ description: 'Bank account with missing lock acquisition', language: 'python', model }, async (testingServiceCollection) => {
		const comments = await generateComments(testingServiceCollection, 'review/bank-account-1.py');
		const expectedLines = [15, 16, 18, 19];
		const expectedContent = 'lock';
		const expectedMinRelevance = 5;
		const expectedKinds = ['bug', 'consistency'];
		assertComment(comments, expectedLines, expectedContent, expectedMinRelevance, expectedKinds);
	});

	stest({ description: 'Bank account with lock acquisition', language: 'python', model }, async (testingServiceCollection) => {
		const comments = await generateComments(testingServiceCollection, 'review/bank-account-2.py');
		const unexpected = comments.filter(c => ['bug', 'consistency'].includes(c.kind) && (typeof c.body === 'string' ? c.body : c.body.value).indexOf('lock') !== -1);
		assert.strictEqual(unexpected.length, 0);
	});

	stest({ description: 'InstantiationService this scoping bug', language: 'typescript', model }, async (testingServiceCollection) => {
		const comments = await generateComments(testingServiceCollection, 'review/nested-services-1.ts');
		const expectedLine = 9;
		const expectedContent = 'this._parent._children.delete';
		const expectedMinRelevance = 5;
		const expectedKind = 'bug';
		assertComment(comments, expectedLine, expectedContent, expectedMinRelevance, expectedKind);
	});

	stest({ description: 'InstantiationService this scoping fixed', language: 'typescript', model }, async (testingServiceCollection) => {
		const comments = await generateComments(testingServiceCollection, 'review/nested-services-2.ts');
		const unexpected = comments.filter(c => c.kind === 'bug' && c.range.start.line === 10);
		assert.strictEqual(unexpected.length, 0);
	});
}));

async function generateComments(testingServiceCollection: TestingServiceCollection, relativeFixturePath: string) {
	const workspace = setupSimulationWorkspace(testingServiceCollection, { files: [fromFixture(relativeFixturePath)] });
	const accessor = testingServiceCollection.createTestingAccessor();
	const instantiationService = accessor.get(IInstantiationService);

	const source = new CancellationTokenSource();
	try {
		const relativeDocumentPath = path.basename(relativeFixturePath);
		const document = TextDocumentSnapshot.create(workspace.getDocument(relativeDocumentPath).document);
		const feedbackGenerator = instantiationService.createInstance(FeedbackGenerator);
		const result = await feedbackGenerator.generateComments([
			{
				document,
				relativeDocumentPath,
				selection: new Range(0, 0, document.lineCount, 0),
			}
		], source.token);
		return result.type === 'success' ? result.comments : [];
	} finally {
		source.dispose();
		await teardownSimulationWorkspace(accessor, workspace);
	}
}

function assertComment(comments: ReviewComment[], expectedLines: number | number[], expectedContent: string, expectedMinRelevance: number, expectedKind: string | string[]) {
	const lines = Array.isArray(expectedLines) ? expectedLines : [expectedLines];
	const lineComment = comments?.find(d => lines.indexOf(d.range.start.line) !== -1);
	assert.ok(lineComment, `Expected comment for line(s) ${lines.join(', ')}.`);
	const message = typeof lineComment.body === 'string' ? lineComment.body : lineComment.body.value;
	assert.ok(message.includes(expectedContent), `Expected comment for line(s) ${lines.join(', ')} to contain "${expectedContent}"`);
	// assert.ok(typeof lineComment.relevance === 'number' && lineComment.relevance >= expectedMinRelevance, `Expected comment to have relevance >= ${expectedMinRelevance}, was: ${lineComment.relevance}`);
	const kinds = Array.isArray(expectedKind) ? expectedKind : [expectedKind];
	assert.ok(kinds.indexOf(lineComment.kind) !== -1, `Expected ${kinds.join(', ')} comment, was: ${lineComment.kind}`);
}

function assertNoHighPriorityCommentOrBug(comments: ReviewComment[]) {
	// const highPriority = comments.filter(d => d.relevance === 10);
	// assert.strictEqual(highPriority.length, 0, `Expected no high priority comment`);
	const bugs = comments.filter(d => d.kind === 'bug');
	assert.strictEqual(bugs.length, 0, `Expected no bug comment`);
}

export function logComments(comments: ReviewComment[]) {
	console.log(JSON.stringify(comments.map(c => ({
		line: c.range.start.line,
		content: typeof c.body === 'string' ? c.body : c.body.value,
		severity: c.severity,
		kind: c.kind
	})), null, 2));
}
