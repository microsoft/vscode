/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { InlineDecoration, InlineModelDecorationsComputer, InjectedTextInlineDecorationsComputer } from '../../../common/viewModel/inlineDecorations.js';
import { createTextModel } from '../testTextModel.js';
import { IdentityCoordinatesConverter } from '../../../common/coordinatesConverter.js';
function createModelDecoration(id, range, options) {
    return {
        id,
        ownerId: 0,
        range,
        options
    };
}
suite('InlineModelDecorationsComputer', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('no decorations', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => []
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.deepStrictEqual(result, {
            decorations: [],
            inlineDecorations: [[]],
            hasVariableFonts: [false]
        });
        model.dispose();
    });
    test('inline class name decoration on a single line', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 1, 1, 6), {
                    description: 'test',
                    inlineClassName: 'test-class'
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.strictEqual(result.decorations.length, 1);
        assert.deepStrictEqual(result.inlineDecorations, [
            [new InlineDecoration(new Range(1, 1, 1, 6), 'test-class', 0 /* InlineDecorationType.Regular */)]
        ]);
        assert.deepStrictEqual(result.hasVariableFonts, [false]);
        model.dispose();
    });
    test('inlineClassName with affectsLetterSpacing', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 1, 1, 6), {
                    description: 'test',
                    inlineClassName: 'test-class',
                    inlineClassNameAffectsLetterSpacing: true
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.deepStrictEqual(result.inlineDecorations, [
            [new InlineDecoration(new Range(1, 1, 1, 6), 'test-class', 3 /* InlineDecorationType.RegularAffectingLetterSpacing */)]
        ]);
        model.dispose();
    });
    test('beforeContentClassName decoration', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 3, 1, 8), {
                    description: 'test',
                    beforeContentClassName: 'before-class'
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.deepStrictEqual(result.inlineDecorations, [
            [new InlineDecoration(new Range(1, 3, 1, 3), 'before-class', 1 /* InlineDecorationType.Before */)]
        ]);
        model.dispose();
    });
    test('afterContentClassName decoration', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 3, 1, 8), {
                    description: 'test',
                    afterContentClassName: 'after-class'
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.deepStrictEqual(result.inlineDecorations, [
            [new InlineDecoration(new Range(1, 8, 1, 8), 'after-class', 2 /* InlineDecorationType.After */)]
        ]);
        model.dispose();
    });
    test('all decoration types combined', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 2, 1, 6), {
                    description: 'test',
                    inlineClassName: 'inline-class',
                    beforeContentClassName: 'before-class',
                    afterContentClassName: 'after-class'
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.deepStrictEqual(result.inlineDecorations, [
            [
                new InlineDecoration(new Range(1, 2, 1, 6), 'inline-class', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 2, 1, 2), 'before-class', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(1, 6, 1, 6), 'after-class', 2 /* InlineDecorationType.After */),
            ]
        ]);
        model.dispose();
    });
    test('decoration spanning multiple lines', () => {
        const model = createTextModel('line one\nline two\nline three');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 3, 3, 5), {
                    description: 'test',
                    inlineClassName: 'multi-line'
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 3, 11), false, false);
        const expectedInlineDecoration = new InlineDecoration(new Range(1, 3, 3, 5), 'multi-line', 0 /* InlineDecorationType.Regular */);
        assert.deepStrictEqual(result.inlineDecorations, [
            [expectedInlineDecoration],
            [expectedInlineDecoration],
            [expectedInlineDecoration],
        ]);
        model.dispose();
    });
    test('decoration with affectsFont sets hasVariableFonts', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 1, 1, 6), {
                    description: 'test',
                    inlineClassName: 'font-class',
                    affectsFont: true
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.deepStrictEqual(result.hasVariableFonts, [true]);
        model.dispose();
    });
    test('multiple decorations on different lines', () => {
        const model = createTextModel('line one\nline two');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 1, 1, 5), {
                    description: 'test',
                    inlineClassName: 'class-a'
                }),
                createModelDecoration('dec2', new Range(2, 1, 2, 5), {
                    description: 'test',
                    inlineClassName: 'class-b'
                }),
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getDecorations(new Range(1, 1, 2, 9), false, false);
        assert.deepStrictEqual(result.inlineDecorations, [
            [new InlineDecoration(new Range(1, 1, 1, 5), 'class-a', 0 /* InlineDecorationType.Regular */)],
            [new InlineDecoration(new Range(2, 1, 2, 5), 'class-b', 0 /* InlineDecorationType.Regular */)],
        ]);
        model.dispose();
    });
    test('decoration cache is used for same decoration id', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const dec = createModelDecoration('dec1', new Range(1, 1, 1, 6), {
            description: 'test',
            inlineClassName: 'test-class'
        });
        const context = {
            getModelDecorations: () => [dec]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result1 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        const result2 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.strictEqual(result1.decorations[0], result2.decorations[0]);
        model.dispose();
    });
    test('reset clears decoration cache', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const dec = createModelDecoration('dec1', new Range(1, 1, 1, 6), {
            description: 'test',
            inlineClassName: 'test-class'
        });
        const context = {
            getModelDecorations: () => [dec]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result1 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        computer.reset();
        const result2 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
        assert.notStrictEqual(result1.decorations[0], result2.decorations[0]);
        model.dispose();
    });
    test('getInlineDecorations returns inline decorations for a model line', () => {
        const model = createTextModel('hello world');
        const coordinatesConverter = new IdentityCoordinatesConverter(model);
        const context = {
            getModelDecorations: () => [
                createModelDecoration('dec1', new Range(1, 1, 1, 6), {
                    description: 'test',
                    inlineClassName: 'test-class'
                })
            ]
        };
        const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
        const result = computer.getInlineDecorations(1);
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(1, 1, 1, 6), 'test-class', 0 /* InlineDecorationType.Regular */)]
        ]);
        model.dispose();
    });
});
suite('InjectedTextInlineDecorationsComputer', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('no injections returns empty', () => {
        const context = {
            getInjectionOptions: () => null,
            getInjectionOffsets: () => null,
            getBreakOffsets: () => [10],
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 1,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        assert.deepStrictEqual(result, []);
    });
    test('single injection with inlineClassName on a single output line', () => {
        const injectionOptions = [
            { content: 'injected', inlineClassName: 'injected-class' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [5],
            getBreakOffsets: () => [18], // 10 (original) + 8 (injected)
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 1,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(1, 6, 1, 14), 'injected-class', 0 /* InlineDecorationType.Regular */)]
        ]);
    });
    test('injection without inlineClassName produces no inline decorations', () => {
        const injectionOptions = [
            { content: 'injected' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [5],
            getBreakOffsets: () => [18],
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 1,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        assert.deepStrictEqual(result, [
            [] // empty - no inlineClassName
        ]);
    });
    test('injection with inlineClassNameAffectsLetterSpacing', () => {
        const injectionOptions = [
            { content: 'abc', inlineClassName: 'ls-class', inlineClassNameAffectsLetterSpacing: true }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [0],
            getBreakOffsets: () => [13], // 10 + 3
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 1,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(1, 1, 1, 4), 'ls-class', 3 /* InlineDecorationType.RegularAffectingLetterSpacing */)]
        ]);
    });
    test('multiple injections on a single output line', () => {
        const injectionOptions = [
            { content: 'AA', inlineClassName: 'class-a' },
            { content: 'BBB', inlineClassName: 'class-b' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [2, 5],
            getBreakOffsets: () => [15], // 10 + 2 + 3
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 1,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        assert.deepStrictEqual(result, [
            [
                new InlineDecoration(new Range(1, 3, 1, 5), 'class-a', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 8, 1, 11), 'class-b', 0 /* InlineDecorationType.Regular */),
            ]
        ]);
    });
    test('injection spanning across wrapped lines', () => {
        // Original text is 20 chars, injection of 10 chars at offset 8
        // Break offsets split at 15 and 30 (two wrapped lines)
        const injectionOptions = [
            { content: '1234567890', inlineClassName: 'injected' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [8],
            getBreakOffsets: () => [15, 30],
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 5,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        // Injected text starts at offset 8 in the input with injections
        // Line 0: [0, 15), injected text occupies [8, 18) -> clipped to [8, 15)
        // Line 1: [15, 30), injected text occupies [8, 18) -> clipped to [15, 18) -> relative: [0, 3)
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(5, 9, 5, 16), 'injected', 0 /* InlineDecorationType.Regular */)],
            [new InlineDecoration(new Range(6, 1, 6, 4), 'injected', 0 /* InlineDecorationType.Regular */)],
        ]);
    });
    test('injection with wrappedTextIndentLength on wrapped lines', () => {
        const injectionOptions = [
            { content: '12345678901234567890', inlineClassName: 'injected' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [0],
            getBreakOffsets: () => [15, 30],
            getWrappedTextIndentLength: () => 4,
            getBaseViewLineNumber: () => 1,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        // Line 0 (outputLineIndex 0): no offset, start=0, end=15 -> columns 1 to 16
        // Line 1 (outputLineIndex 1): wrappedTextIndentLength=4, start=4+0=4, end=4+5=9 -> columns 5 to 10
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(1, 1, 1, 16), 'injected', 0 /* InlineDecorationType.Regular */)],
            [new InlineDecoration(new Range(2, 5, 2, 10), 'injected', 0 /* InlineDecorationType.Regular */)],
        ]);
    });
    test('injection starting in later wrapped line', () => {
        // Injection at offset 20 which is past the first line break
        const injectionOptions = [
            { content: 'ab', inlineClassName: 'late-class' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [20],
            getBreakOffsets: () => [15, 32], // 30 + 2
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 1,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        // Line 0: [0, 15) -> injection at offset 20 is past this line -> empty
        // Line 1: [15, 32) -> injection at offset 20 -> start=20-15=5, end=22-15=7 -> columns 6 to 8
        assert.deepStrictEqual(result, [
            [],
            [new InlineDecoration(new Range(2, 6, 2, 8), 'late-class', 0 /* InlineDecorationType.Regular */)],
        ]);
    });
    test('base view line number offsets correctly', () => {
        const injectionOptions = [
            { content: 'test', inlineClassName: 'test-class' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [0],
            getBreakOffsets: () => [14],
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => 10,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(1);
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(10, 1, 10, 5), 'test-class', 0 /* InlineDecorationType.Regular */)]
        ]);
    });
    test('range uses view line number, not model line number', () => {
        // Model line 3 maps to view line 7 (e.g. due to previous lines wrapping).
        // The range in the resulting InlineDecoration must use the view line number (7),
        // not the model line number (3) that is passed to getInlineDecorations().
        const modelLineNumber = 3;
        const baseViewLineNumber = 7;
        const injectionOptions = [
            { content: 'ghost', inlineClassName: 'ghost-class' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [0],
            getBreakOffsets: () => [15], // 10 (original) + 5 (injected)
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => baseViewLineNumber,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(modelLineNumber);
        // The range must reference view line 7, not model line 3
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(7, 1, 7, 6), 'ghost-class', 0 /* InlineDecorationType.Regular */)]
        ]);
    });
    test('range uses view line number on wrapped lines, not model line number', () => {
        // Model line 2 wraps into view lines 5 and 6.
        // Both output lines must use view line numbers, not model line 2.
        const modelLineNumber = 2;
        const baseViewLineNumber = 5;
        const injectionOptions = [
            { content: '1234567890', inlineClassName: 'wrap-class' }
        ];
        const context = {
            getInjectionOptions: () => injectionOptions,
            getInjectionOffsets: () => [0],
            getBreakOffsets: () => [8, 20],
            getWrappedTextIndentLength: () => 0,
            getBaseViewLineNumber: () => baseViewLineNumber,
        };
        const computer = new InjectedTextInlineDecorationsComputer(context);
        const result = computer.getInlineDecorations(modelLineNumber);
        // First wrapped line uses view line 5, second uses view line 6
        assert.deepStrictEqual(result, [
            [new InlineDecoration(new Range(5, 1, 5, 9), 'wrap-class', 0 /* InlineDecorationType.Regular */)],
            [new InlineDecoration(new Range(6, 1, 6, 3), 'wrap-class', 0 /* InlineDecorationType.Regular */)],
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRGVjb3JhdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXRELE9BQU8sRUFBRSxnQkFBZ0IsRUFBd0IsOEJBQThCLEVBQTBDLHFDQUFxQyxFQUFpRCxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RRLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV2RixTQUFTLHFCQUFxQixDQUFDLEVBQVUsRUFBRSxLQUFZLEVBQUUsT0FBZ0M7SUFDeEYsT0FBTztRQUNOLEVBQUU7UUFDRixPQUFPLEVBQUUsQ0FBQztRQUNWLEtBQUs7UUFDTCxPQUFPO0tBQ1AsQ0FBQztBQUNILENBQUM7QUFFRCxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO0lBRTVDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUMzQixNQUFNLEtBQUssR0FBRyxlQUFlLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDN0MsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLDRCQUE0QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JFLE1BQU0sT0FBTyxHQUEyQztZQUN2RCxtQkFBbUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1NBQzdCLENBQUM7UUFDRixNQUFN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