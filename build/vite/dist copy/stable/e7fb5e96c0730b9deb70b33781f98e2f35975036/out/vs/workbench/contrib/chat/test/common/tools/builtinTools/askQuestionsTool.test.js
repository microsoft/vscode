/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AskQuestionsTool } from '../../../../common/tools/builtinTools/askQuestionsTool.js';
class TestableAskQuestionsTool extends AskQuestionsTool {
    testConvertCarouselAnswers(questions, carouselAnswers) {
        // Create an identity map where each header is also the internal ID
        // This simulates the simple case for testing the answer conversion logic
        const idToHeaderMap = new Map();
        for (const q of questions) {
            idToHeaderMap.set(q.header, q.header);
        }
        return this.convertCarouselAnswers(questions, carouselAnswers, idToHeaderMap);
    }
}
suite('AskQuestionsTool - convertCarouselAnswers', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let tool;
    setup(() => {
        tool = store.add(new TestableAskQuestionsTool(null, NullTelemetryService, new NullLogService(), new TestConfigurationService()));
    });
    teardown(() => {
        tool?.dispose();
    });
    test('marks all questions as skipped when answers are undefined', () => {
        const questions = [
            { header: 'Q1', question: 'First question?' },
            { header: 'Q2', question: 'Second question?' }
        ];
        const result = tool.testConvertCarouselAnswers(questions, undefined);
        const expected = {
            Q1: { selected: [], freeText: null, skipped: true },
            Q2: { selected: [], freeText: null, skipped: true }
        };
        assert.deepStrictEqual(result.answers, expected);
    });
    test('handles string answers as option selection or free text', () => {
        const questions = [
            { header: 'Color', question: 'Pick a color', options: [{ label: 'Red' }, { label: 'Blue' }] },
            { header: 'Comment', question: 'Any comment?' }
        ];
        const result = tool.testConvertCarouselAnswers(questions, { Color: 'Blue', Comment: 'Nice' });
        assert.deepStrictEqual(result.answers['Color'], { selected: ['Blue'], freeText: null, skipped: false });
        assert.deepStrictEqual(result.answers['Comment'], { selected: [], freeText: 'Nice', skipped: false });
    });
    test('handles array answers for multi-select', () => {
        const questions = [
            { header: 'Features', question: 'Pick features', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }
        ];
        const result = tool.testConvertCarouselAnswers(questions, { Features: { selectedValues: ['A', 'B'] } });
        assert.deepStrictEqual(result.answers['Features'], { selected: ['A', 'B'], freeText: null, skipped: false });
    });
    test('handles selectedValue object answers', () => {
        const questions = [
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
        const questions = [
            { header: 'Options', question: 'Pick options', multiSelect: true, options: [{ label: 'X' }, { label: 'Y' }] }
        ];
        const result = tool.testConvertCarouselAnswers(questions, { Options: { selectedValues: ['X'] } });
        assert.deepStrictEqual(result.answers['Options'], { selected: ['X'], freeText: null, skipped: false });
    });
    test('handles freeformValue with no selection', () => {
        const questions = [
            { header: 'Choice', question: 'Pick or write', options: [{ label: 'A' }, { label: 'B' }], allowFreeformInput: true }
        ];
        const result = tool.testConvertCarouselAnswers(questions, { Choice: { freeformValue: 'Custom' } });
        assert.deepStrictEqual(result.answers['Choice'], { selected: [], freeText: 'Custom', skipped: false });
    });
    test('marks unknown formats as skipped', () => {
        const questions = [
            { header: 'Odd', question: 'Unknown' }
        ];
        const result = tool.testConvertCarouselAnswers(questions, { Odd: 42 });
        assert.deepStrictEqual(result.answers['Odd'], { selected: [], freeText: null, skipped: true });
    });
    test('handles mixed answers and missing keys', () => {
        const questions = [
            { header: 'Q1', question: 'String answer' },
            { header: 'Q2', question: 'Object answer', options: [{ label: 'A' }] },
            { header: 'Q3', question: 'Array answer', multiSelect: true },
            { header: 'Q4', question: 'Missing answer' }
        ];
        const result = tool.testConvertCarouselAnswers(questions, {
            Q1: 'text',
            Q2: { selectedValue: 'A' },
            Q3: { selectedValues: ['x', 'y'] }
        });
        assert.strictEqual(result.answers['Q1'].freeText, 'text');
        assert.deepStrictEqual(result.answers['Q2'].selected, ['A']);
        assert.deepStrictEqual(result.answers['Q3'].selected, ['x', 'y']);
        assert.strictEqual(result.answers['Q4'].skipped, true);
    });
    test('is case-sensitive when matching options', () => {
        const questions = [
            { header: 'Case', question: 'Pick', options: [{ label: 'Yes' }, { label: 'No' }] }
        ];
        const result = tool.testConvertCarouselAnswers(questions, { Case: 'yes' });
        assert.deepStrictEqual(result.answers['Case'], { selected: [], freeText: 'yes', skipped: false });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNrUXVlc3Rpb25zVG9vbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvYXNrUXVlc3Rpb25zVG9vbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDeEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scUZBQXFGLENBQUM7QUFFL0gsT0FBTyxFQUFFLGdCQUFnQixFQUE2QyxNQUFNLDJEQUEyRCxDQUFDO0FBRXhJLE1BQU0sd0JBQXlCLFNBQVEsZ0JBQWdCO0lBQy9DLDBCQUEwQixDQUFDLFNBQXNCLEVBQUUsZUFBaUQ7UUFDMUcsbUVBQW1FO1FBQ25FLHlFQUF5RTtRQUN6RSxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUNoRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQzNCLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLFNBQVMsRUFBRSxlQUFlLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDL0UsQ0FBQztDQUNEO0FBRUQsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtJQUN2RCxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxD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