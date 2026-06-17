/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ChatAgentContent, ChatAgentExtendedProgress, ChatAgentVulnerability } from 'vscode';
import { IResponseDelta } from '../../openai/fetch';
import { PseudoStopStartConversationCallback } from '../pseudoStartStopConversationCallback';
import sinon = require('sinon');

suite('Post Report Conversation Callback', () => {
	const postReportFn = (deltas: IResponseDelta[]) => {
		return ['<processed>', ...deltas.map(d => d.text), '</processed>'];
	};
	const annotations = [{ id: 123, details: { type: 'type', description: 'description' } }, { id: 456, details: { type: 'type2', description: 'description2' } }];

	test('Simple post-report', async () => {
		const progress: ChatAgentExtendedProgress[] = [];
		const testObj = new PseudoStopStartConversationCallback(
			[{
				start: 'end',
				stop: 'start'
			}],
			{ report: p => progress.push(p) },
			postReportFn
		);

		testObj.apply('', { text: 'one' });
		testObj.apply('', { text: ' start ' });
		testObj.apply('', { text: 'two' });
		testObj.apply('', { text: ' end' });

		assert.strictEqual(await testObj.appliedText, 'one start two end');

		assert.deepStrictEqual(
			progress.map(p => (p as ChatAgentContent).content),
			['one', ' ', '<processed>', ' ', 'two', ' ', '</processed>']);
	});

	test('Partial stop word with extra text before', async () => {
		const progress: ChatAgentExtendedProgress[] = [];
		const testObj = new PseudoStopStartConversationCallback(
			[{
				start: 'end',
				stop: 'start'
			}],
			{ report: p => progress.push(p) },
			postReportFn
		);

		testObj.apply('', { text: 'one sta' });
		testObj.apply('', { text: 'rt' });
		testObj.apply('', { text: ' two end' });

		assert.deepStrictEqual(
			progress.map(p => (p as ChatAgentContent).content),
			['one ', '<processed>', ' two ', '</processed>']
		);
		assert.strictEqual(await testObj.appliedText, 'one start two end');
	});

	test('Partial stop word with extra text after', async () => {
		const progress: ChatAgentExtendedProgress[] = [];
		const testObj = new PseudoStopStartConversationCallback(
			[{
				start: 'end',
				stop: 'start'
			}],
			{ report: p => progress.push(p) },
			postReportFn
		);

		testObj.apply('', { text: 'one ', annotations });
		testObj.apply('', { text: 'sta' });
		testObj.apply('', { text: 'rt two' });
		testObj.apply('', { text: ' end' });

		assert.strictEqual(await testObj.appliedText, 'one start two end');
		assert.deepStrictEqual((progress[0] as ChatAgentContent).vulnerabilities, annotations.map(a => ({ title: a.details.type, description: a.details.description } satisfies ChatAgentVulnerability)));

		assert.deepStrictEqual(
			progress.map(p => (p as ChatAgentContent).content),
			['one ', '<processed>', ' two', ' ', '</processed>']);
	});

	test('no second stop word', async () => {
		const progress: ChatAgentExtendedProgress[] = [];
		const testObj = new PseudoStopStartConversationCallback(
			[{
				start: 'end',
				stop: 'start'
			}],
			{ report: p => progress.push(p) },
			postReportFn
		);

		testObj.apply('', { text: 'one' });
		testObj.apply('', { text: ' start ' });
		testObj.apply('', { text: 'two' });
		testObj.apply('', { text: ' ' });

		assert.strictEqual(await testObj.appliedText, 'one start two ');
		assert.deepStrictEqual(
			progress.map(p => (p as ChatAgentContent).content),
			['one', ' ']);
	});

	test('Text on same line as start', async () => {
		const progress: ChatAgentExtendedProgress[] = [];
		const testObj = new PseudoStopStartConversationCallback(
			[{
				start: 'end',
				stop: 'start'
			}],
			{ report: p => progress.push(p) },
			postReportFn
		);

		testObj.apply('', { text: 'this is test text\n\n' });
		testObj.apply('', { text: 'eeep start\n\n' });
		testObj.apply('', { text: 'test test test test 123456' });
		testObj.apply('', { text: 'end\n\nhello' });

		assert.strictEqual(await testObj.appliedText, 'this is test text\n\neeep start\n\ntest test test test 123456end\n\nhello');

		assert.deepStrictEqual((progress[0] as ChatAgentContent).content, 'this is test text\n\n');
		assert.deepStrictEqual((progress[1] as ChatAgentContent).content, 'eeep ');
		assert.deepStrictEqual((progress[2] as ChatAgentContent).content, '<processed>');
		assert.deepStrictEqual((progress[3] as ChatAgentContent).content, '\n\n');
		assert.deepStrictEqual((progress[4] as ChatAgentContent).content, 'test test test test 123456');
		assert.deepStrictEqual((progress[5] as ChatAgentContent).content, '</processed>');
		assert.deepStrictEqual((progress[6] as ChatAgentContent).content, '\n\nhello');
	});


	test('Start word without a stop word', () => {
		const progress: ChatAgentExtendedProgress[] = [];
		const testObj = new PseudoStopStartConversationCallback(
			[{
				start: '[RESPONSE END]',
				stop: '[RESPONSE START]'
			}],
			{ report: p => progress.push(p) },
			postReportFn
		);

		testObj.apply('', { text: `I'm sorry, but as an AI programming assistant, I'm here to provide assistance with software development topics, specifically related to Visual Studio Code. I'm not equipped to provide a definition of a computer. [RESPONSE END]` });

		assert.strictEqual((progress[0] as ChatAgentContent).content, `I'm sorry, but as an AI programming assistant, I'm here to provide assistance with software development topics, specifically related to Visual Studio Code. I'm not equipped to provide a definition of a computer. [RESPONSE END]`);
	});

	teardown(() => sinon.restore());
});
