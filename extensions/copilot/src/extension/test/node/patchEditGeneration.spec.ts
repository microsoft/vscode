/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { promises as fs, readdirSync } from 'fs';
import { suite, test } from 'vitest';
import type { TextEdit, Uri } from 'vscode';
import { FetchStreamSource } from '../../../platform/chat/common/chatMLFetcher';
import { PromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import * as path from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { Lines } from '../../prompt/node/editGeneration';
import { applyEdits } from '../../prompt/node/intents';
import { processPatchResponse } from '../../prompts/node/codeMapper/codeMapper';
import { getPatchEditReplyProcessor } from '../../prompts/node/codeMapper/patchEditGeneration';
import { TestWorkspaceService } from '../../../platform/test/node/testWorkspaceService';

const fixturesRootFolder = path.join(__dirname, './fixtures/patch');

suite('PatchEditGeneration - sync', function () {
	const entries = readdirSync(fixturesRootFolder);
	for (const entry of entries) {
		const fixturesFolder = path.join(fixturesRootFolder, entry);
		createTestsFromFixtures(fixturesFolder, (data) => {
			const replyProcessor = getPatchEditReplyProcessor(new PromptPathRepresentationService(new TestWorkspaceService()));
			const res = replyProcessor.process(data.patch, data.original);
			const actual = applyEdits(data.original, res.edits);
			deepStrictEqual(Lines.fromString(actual), Lines.fromString(data.expected));
		});
	}
});

suite('PatchEditGeneration - async', function () {
	const entries = readdirSync(fixturesRootFolder);
	for (const entry of entries) {
		const fixturesFolder = path.join(fixturesRootFolder, entry);
		createTestsFromFixtures(fixturesFolder, async (data) => {
			const input = new FetchStreamSource();
			input.update(data.patch, { text: data.patch });

			let actual = data.original;
			const outputCollector = {
				textEdit(_target: Uri, edits: TextEdit | TextEdit[]) {
					actual = applyEdits(actual, Array.isArray(edits) ? edits : [edits]);
				},
				notebookEdit() {
					throw new Error('Unexpected notebook edit');
				}
			};
			const promise = processPatchResponse(URI.parse('test://foo/bar'), data.original, input.stream, outputCollector, CancellationToken.None);
			input.resolve();
			await promise;
			deepStrictEqual(Lines.fromString(actual), Lines.fromString(data.expected));
		});
	}
});

function createTestsFromFixtures(fixturesFolder: string, runTest: (data: { [key: string]: string }) => void) {
	const entries = readdirSync(fixturesFolder);
	const testsData = new Map<string, { [key: string]: Promise<string> }>();
	for (const entry of entries) {
		const match = entry.match(/^([^.]+)\.([^.]+)\.(txt|bin)$/);
		if (match) {
			const [, testName, inputName] = match;
			const content = fs.readFile(path.join(fixturesFolder, entry), 'utf8');
			let data = testsData.get(testName);
			if (!data) {
				data = {};
				testsData.set(testName, data);
			}
			data[inputName] = content;
		}
	}
	for (const testName of testsData.keys()) {
		test(testName, async () => {
			const dataWithPromises = testsData.get(testName);
			const data: { [key: string]: string } = {};
			for (const key in dataWithPromises) {
				data[key] = await dataWithPromises[key];
			}
			runTest(data);
		});
	}
}
