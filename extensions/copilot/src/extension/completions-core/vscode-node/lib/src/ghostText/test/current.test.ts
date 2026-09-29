/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { generateUuid } from '../../../../../../../util/vs/base/common/uuid';
import { fakeAPIChoice } from '../../openai/fetch.fake';
import { APIChoice } from '../../openai/openai';
import { CurrentGhostText } from '../current';
import { ResultType } from '../resultType';

suite('CurrentGhostText', function () {
	let current: CurrentGhostText;

	setup(function () {
		current = new CurrentGhostText();
	});

	suite('getCompletionsForUserTyping', function () {
		test('returns undefined if there is no current completion', function () {
			const result = current.getCompletionsForUserTyping('func main() {\n', '');
			assert.strictEqual(result, undefined);
		});

		test('returns the current completion for an exact match', function () {
			const choice = fakeChoice();
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			const result = current.getCompletionsForUserTyping('func main() {\n', '');

			assert.deepStrictEqual(result, [choice]);
		});

		test('returns the current completion for a prefix match', function () {
			const choice = fakeChoice();
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			const result = current.getCompletionsForUserTyping('func main() {\nfmt.Print', '');

			assert.deepStrictEqual(result, [{ ...choice, completionText: 'ln("Hello, World!")' }]);
		});

		test('returns undefined when the prefix does not match', function () {
			const choice = fakeChoice();
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			const result = current.getCompletionsForUserTyping('func test() {\n', '}');

			assert.strictEqual(result, undefined);
		});

		test('returns undefined when the suffix does not match', function () {
			const choice = fakeChoice();
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			const result = current.getCompletionsForUserTyping('func main() {\n', '}');
			assert.strictEqual(result, undefined);
		});

		test('returns undefined when the completion does not match', function () {
			const choice = fakeChoice();
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			const result = current.getCompletionsForUserTyping('func main() {\nerr', '}');
			assert.strictEqual(result, undefined);
		});

		test('returns undefined when the completion is exhausted', function () {
			const choice = fakeChoice();
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			const result = current.getCompletionsForUserTyping('func main() {\nfmt.Println("Hello, World!")', '');
			assert.strictEqual(result, undefined);
		});

		test('does not change the current completion when TypingAsSuggested', function () {
			const choice = fakeChoice();
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			current.setGhostText(
				'func main() {\nfmt.',
				'',
				[fakeChoice('Println("Hello, World!")')],
				ResultType.TypingAsSuggested
			);
			const result = current.getCompletionsForUserTyping('func main() {\n', '');

			assert.deepStrictEqual(result![0].requestId, choice.requestId);
		});

		test('only returns cycling completions that match', function () {
			const choice = fakeChoice();
			const choice2 = fakeChoice('err := nil', 1);
			const choice3 = fakeChoice('fmt.Println("hi")', 2);
			current.setGhostText('func main() {\n', '', [choice, choice2, choice3], ResultType.Network);

			const result = current.getCompletionsForUserTyping('func main() {\nfmt', '');

			assert.deepStrictEqual(result, [
				{ ...choice, completionText: '.Println("Hello, World!")' },
				{ ...choice3, completionText: '.Println("hi")' },
			]);
		});
	});

	suite('hasAcceptedCurrentCompletion', function () {
		test('returns false if there is no current completion', function () {
			assert.ok(!current.hasAcceptedCurrentCompletion('func main() {\n', ''));
		});

		test('returns false for uncompleted completions', function () {
			current.setGhostText('func main() {\n', '', [fakeChoice()], ResultType.Network);

			assert.ok(!current.hasAcceptedCurrentCompletion('func main() {\n', ''));
			assert.ok(!current.hasAcceptedCurrentCompletion('func main() {\nfmt.Println', ''));
			assert.ok(!current.hasAcceptedCurrentCompletion('func main() {\nfmt.Println("hi")', ''));
		});

		test('returns true for completed completion', function () {
			current.setGhostText('func main() {\n', '', [fakeChoice()], ResultType.Network);

			assert.ok(current.hasAcceptedCurrentCompletion('func main() {\nfmt.Println("Hello, World!")', ''));
		});

		test('returns false for completed completion with content_filter finish reason', function () {
			const choice = fakeChoice();
			choice.finishReason = 'content_filter';
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			assert.ok(!current.hasAcceptedCurrentCompletion('func main() {\nfmt.Println("Hello, World!")', ''));
		});

		test('returns false for completed completion with snippy finish reason', function () {
			const choice = fakeChoice();
			choice.finishReason = 'snippy';
			current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

			assert.ok(!current.hasAcceptedCurrentCompletion('func main() {\nfmt.Println("Hello, World!")', ''));
		});
	});

	test('clientCompletionId returns the current completion id', function () {
		const choice = fakeChoice();
		current.setGhostText('func main() {\n', '', [choice], ResultType.Network);

		assert.strictEqual(current.clientCompletionId, choice.clientCompletionId);
	});
});

function fakeChoice(completionText = 'fmt.Println("Hello, World!")', choice = 0): APIChoice {
	return fakeAPIChoice(generateUuid(), choice, completionText);
}
