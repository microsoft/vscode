/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AskQuestionsTool, IAnswerResult, IQuestion, IQuestionAnswer } from '../../../../common/tools/builtinTools/askQuestionsTool.js';
import { IChatService } from '../../../../common/chatService/chatService.js';

class TestableAskQuestionsTool extends AskQuestionsTool {
	public testConvertCarouselAnswers(questions: IQuestion[], carouselAnswers: Record<string, unknown> | undefined): IAnswerResult {
		// Create an identity map where each header is also the internal ID
		// This simulates the simple case for testing the answer conversion logic
		const idToHeaderMap = new Map<string, string>();
		for (const q of questions) {
			idToHeaderMap.set(q.header, q.header);
		}
		return this.convertCarouselAnswers(questions, carouselAnswers, idToHeaderMap);
	}
}

suite('AskQuestionsTool - convertCarouselAnswers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let tool: TestableAskQuestionsTool;

	setup(() => {
		tool = store.add(new TestableAskQuestionsTool(
			null! as IChatService,
			NullTelemetryService,
			new NullLogService()
		));
	});

	teardown(() => {
		tool?.dispose();
	});

	test('marks all questions as skipped when answers are undefined', () => {
		const questions: IQuestion[] = [
			{ header: 'Q1', question: 'First question?' },
			{ header: 'Q2', question: 'Second question?' }
		];

		const result = tool.testConvertCarouselAnswers(questions, undefined);

		const expected: Record<string, IQuestionAnswer> = {
			Q1: { selected: [], freeText: null, skipped: true },
			Q2: { selected: [], freeText: null, skipped: true }
		};
		assert.deepStrictEqual(result.answers, expected);
	});

	test('handles string answers as option selection or free text', () => {
		const questions: IQuestion[] = [
			{ header: 'Color', question: 'Pick a color', options: [{ label: 'Red' }, { label: 'Blue' }] },
			{ header: 'Comment', question: 'Any comment?' }
		];

		const result = tool.testConvertCarouselAnswers(questions, { Color: 'Blue', Comment: 'Nice' });

		assert.deepStrictEqual(result.answers['Color'], { selected: ['Blue'], freeText: null, skipped: false });
		assert.deepStrictEqual(result.answers['Comment'], { selected: [], freeText: 'Nice', skipped: false });
	});

	test('handles array answers for multi-select', () => {
		const questions: IQuestion[] = [
			{ header: 'Features', question: 'Pick features', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }
		];

		const result = tool.testConvertCarouselAnswers(questions, { Features: ['A', 'B'] });

		assert.deepStrictEqual(result.answers['Features'], { selected: ['A', 'B'], freeText: null, skipped: false });
	});

	test('handles selectedValue object answers', () => {
		const questions: IQuestion[] = [
			{ header: 'Range', question: 'Use range?', options: [{ label: 'Yes' }, { label: 'No' }] },
			{ header: 'Feedback', question: 'Feedback?' }
		];

		const result = tool.testConvertCarouselAnswers(questions, {
			Range: { selectedValue: 'Yes' },
			Feedback: { selectedValue: 'Great!' }
		});

		assert.deepStrictEqual(result.answers['Range'], { selected: ['Yes'], freeText: null, skipped: false });
		assert.deepStrictEqual(result.answers['Feedback'], { selected: [], freeText: 'Great!', skipped: false });
	});

	test('handles selectedValues object answers', () => {
		const questions: IQuestion[] = [
			{ header: 'Options', question: 'Pick options', multiSelect: true, options: [{ label: 'X' }, { label: 'Y' }] }
		];

		const result = tool.testConvertCarouselAnswers(questions, { Options: { selectedValues: ['X'] } });

		assert.deepStrictEqual(result.answers['Options'], { selected: ['X'], freeText: null, skipped: false });
	});

	test('handles freeformValue with no selection', () => {
		const questions: IQuestion[] = [
			{ header: 'Choice', question: 'Pick or write', options: [{ label: 'A' }, { label: 'B' }], allowFreeformInput: true }
		];

		const result = tool.testConvertCarouselAnswers(questions, { Choice: { freeformValue: 'Custom' } });

		assert.deepStrictEqual(result.answers['Choice'], { selected: [], freeText: 'Custom', skipped: false });
	});

	test('marks unknown formats as skipped', () => {
		const questions: IQuestion[] = [
			{ header: 'Odd', question: 'Unknown' }
		];

		const result = tool.testConvertCarouselAnswers(questions, { Odd: 42 as unknown as object });

		assert.deepStrictEqual(result.answers['Odd'], { selected: [], freeText: null, skipped: true });
	});

	test('handles mixed answers and missing keys', () => {
		const questions: IQuestion[] = [
			{ header: 'Q1', question: 'String answer' },
			{ header: 'Q2', question: 'Object answer', options: [{ label: 'A' }] },
			{ header: 'Q3', question: 'Array answer', multiSelect: true },
			{ header: 'Q4', question: 'Missing answer' }
		];

		const result = tool.testConvertCarouselAnswers(questions, {
			Q1: 'text',
			Q2: { selectedValue: 'A' },
			Q3: ['x', 'y']
		});

		assert.strictEqual(result.answers['Q1'].freeText, 'text');
		assert.deepStrictEqual(result.answers['Q2'].selected, ['A']);
		assert.deepStrictEqual(result.answers['Q3'].selected, ['x', 'y']);
		assert.strictEqual(result.answers['Q4'].skipped, true);
	});

	test('is case-sensitive when matching options', () => {
		const questions: IQuestion[] = [
			{ header: 'Case', question: 'Pick', options: [{ label: 'Yes' }, { label: 'No' }] }
		];

		const result = tool.testConvertCarouselAnswers(questions, { Case: 'yes' });

		assert.deepStrictEqual(result.answers['Case'], { selected: [], freeText: 'yes', skipped: false });
	});
});
