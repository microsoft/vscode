/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { testViewModel } from './testViewModel.js';
import { InlineDecoration } from '../../../common/viewModel/inlineDecorations.js';
suite('ViewModelDecorations', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('getDecorationsViewportData', () => {
        const text = [
            'hello world, this is a buffer that will be wrapped'
        ];
        const opts = {
            wordWrap: 'wordWrapColumn',
            wordWrapColumn: 13
        };
        testViewModel(text, opts, (viewModel, model) => {
            assert.strictEqual(viewModel.getLineContent(1), 'hello world, ');
            assert.strictEqual(viewModel.getLineContent(2), 'this is a ');
            assert.strictEqual(viewModel.getLineContent(3), 'buffer that ');
            assert.strictEqual(viewModel.getLineContent(4), 'will be ');
            assert.strictEqual(viewModel.getLineContent(5), 'wrapped');
            model.changeDecorations((accessor) => {
                const createOpts = (id) => {
                    return {
                        description: 'test',
                        className: id,
                        inlineClassName: 'i-' + id,
                        beforeContentClassName: 'b-' + id,
                        afterContentClassName: 'a-' + id
                    };
                };
                // VIEWPORT will be (1,14) -> (1,36)
                // completely before viewport
                accessor.addDecoration(new Range(1, 2, 1, 3), createOpts('dec1'));
                // starts before viewport, ends at viewport start
                accessor.addDecoration(new Range(1, 2, 1, 14), createOpts('dec2'));
                // starts before viewport, ends inside viewport
                accessor.addDecoration(new Range(1, 2, 1, 15), createOpts('dec3'));
                // starts before viewport, ends at viewport end
                accessor.addDecoration(new Range(1, 2, 1, 36), createOpts('dec4'));
                // starts before viewport, ends after viewport
                accessor.addDecoration(new Range(1, 2, 1, 51), createOpts('dec5'));
                // starts at viewport start, ends at viewport start (will not be visible on view line 2)
                accessor.addDecoration(new Range(1, 14, 1, 14), createOpts('dec6'));
                // starts at viewport start, ends inside viewport
                accessor.addDecoration(new Range(1, 14, 1, 16), createOpts('dec7'));
                // starts at viewport start, ends at viewport end
                accessor.addDecoration(new Range(1, 14, 1, 36), createOpts('dec8'));
                // starts at viewport start, ends after viewport
                accessor.addDecoration(new Range(1, 14, 1, 51), createOpts('dec9'));
                // starts inside viewport, ends inside viewport
                accessor.addDecoration(new Range(1, 16, 1, 18), createOpts('dec10'));
                // starts inside viewport, ends at viewport end
                accessor.addDecoration(new Range(1, 16, 1, 36), createOpts('dec11'));
                // starts inside viewport, ends after viewport
                accessor.addDecoration(new Range(1, 16, 1, 51), createOpts('dec12'));
                // starts at viewport end, ends at viewport end
                accessor.addDecoration(new Range(1, 36, 1, 36), createOpts('dec13'));
                // starts at viewport end, ends after viewport
                accessor.addDecoration(new Range(1, 36, 1, 51), createOpts('dec14'));
                // starts after viewport, ends after viewport
                accessor.addDecoration(new Range(1, 40, 1, 51), createOpts('dec15'));
            });
            const actualDecorations = viewModel.getDecorationsInViewport(new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))).map((dec) => {
                return dec.options.className;
            }).filter(Boolean);
            assert.deepStrictEqual(actualDecorations, [
                'dec1',
                'dec2',
                'dec3',
                'dec4',
                'dec5',
                'dec6',
                'dec7',
                'dec8',
                'dec9',
                'dec10',
                'dec11',
                'dec12',
                'dec13',
                'dec14',
            ]);
            const inlineDecorations1 = viewModel.getViewportViewLineRenderingData(new Range(1, viewModel.getLineMinColumn(1), 2, viewModel.getLineMaxColumn(2)), 1).inlineDecorations;
            // view line 1: (1,1 -> 1,14)
            assert.deepStrictEqual(inlineDecorations1, [
                new InlineDecoration(new Range(1, 2, 1, 3), 'i-dec1', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec1', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(1, 3, 1, 3), 'a-dec1', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(1, 2, 1, 14), 'i-dec2', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec2', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(1, 14, 1, 14), 'a-dec2', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(1, 2, 2, 2), 'i-dec3', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec3', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec4', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 2, 1, 2), 'b-dec5', 1 /* InlineDecorationType.Before */),
            ]);
            const inlineDecorations2 = viewModel.getViewportViewLineRenderingData(new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)), 2).inlineDecorations;
            // view line 2: (1,14 -> 1,24)
            assert.deepStrictEqual(inlineDecorations2, [
                new InlineDecoration(new Range(1, 2, 2, 2), 'i-dec3', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 2, 2, 2), 'a-dec3', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 1, 2, 1), 'i-dec6', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec6', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(2, 1, 2, 1), 'a-dec6', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(2, 1, 2, 3), 'i-dec7', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec7', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(2, 3, 2, 3), 'a-dec7', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(2, 1, 3, 13), 'i-dec8', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec8', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(2, 1, 5, 8), 'i-dec9', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 1, 2, 1), 'b-dec9', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(2, 3, 2, 5), 'i-dec10', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec10', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(2, 5, 2, 5), 'a-dec10', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(2, 3, 3, 13), 'i-dec11', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec11', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(2, 3, 5, 8), 'i-dec12', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 3, 2, 3), 'b-dec12', 1 /* InlineDecorationType.Before */),
            ]);
            const inlineDecorations3 = viewModel.getViewportViewLineRenderingData(new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)), 3).inlineDecorations;
            // view line 3 (24 -> 36)
            assert.deepStrictEqual(inlineDecorations3, [
                new InlineDecoration(new Range(1, 2, 3, 13), 'i-dec4', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec4', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(1, 2, 5, 8), 'i-dec5', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 1, 3, 13), 'i-dec8', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec8', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(2, 1, 5, 8), 'i-dec9', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(2, 3, 3, 13), 'i-dec11', 0 /* InlineDecorationType.Regular */),
                new InlineDecoration(new Range(3, 13, 3, 13), 'a-dec11', 2 /* InlineDecorationType.After */),
                new InlineDecoration(new Range(2, 3, 5, 8), 'i-dec12', 0 /* InlineDecorationType.Regular */),
            ]);
        });
    });
    test('issue #17208: Problem scrolling in 1.8.0', () => {
        const text = [
            'hello world, this is a buffer that will be wrapped'
        ];
        const opts = {
            wordWrap: 'wordWrapColumn',
            wordWrapColumn: 13
        };
        testViewModel(text, opts, (viewModel, model) => {
            assert.strictEqual(viewModel.getLineContent(1), 'hello world, ');
            assert.strictEqual(viewModel.getLineContent(2), 'this is a ');
            assert.strictEqual(viewModel.getLineContent(3), 'buffer that ');
            assert.strictEqual(viewModel.getLineContent(4), 'will be ');
            assert.strictEqual(viewModel.getLineContent(5), 'wrapped');
            model.changeDecorations((accessor) => {
                accessor.addDecoration(new Range(1, 50, 1, 51), {
                    description: 'test',
                    beforeContentClassName: 'dec1'
                });
            });
            const decorations = viewModel.getDecorationsInViewport(new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3))).filter(x => Boolean(x.options.beforeContentClassName));
            assert.deepStrictEqual(decorations, []);
            const inlineDecorations1 = viewModel.getViewportViewLineRenderingData(new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)), 2).inlineDecorations;
            assert.deepStrictEqual(inlineDecorations1, []);
            const inlineDecorations2 = viewModel.getViewportViewLineRenderingData(new Range(2, viewModel.getLineMinColumn(2), 3, viewModel.getLineMaxColumn(3)), 3).inlineDecorations;
            assert.deepStrictEqual(inlineDecorations2, []);
        });
    });
    test('issue #37401: Allow both before and after decorations on empty line', () => {
        const text = [
            ''
        ];
        testViewModel(text, {}, (viewModel, model) => {
            model.changeDecorations((accessor) => {
                accessor.addDecoration(new Range(1, 1, 1, 1), {
                    description: 'test',
                    beforeContentClassName: 'before1',
                    afterContentClassName: 'after1'
                });
            });
            const inlineDecorations = viewModel.getViewportViewLineRenderingData(new Range(1, 1, 1, 1), 1).inlineDecorations;
            assert.deepStrictEqual(inlineDecorations, [
                new InlineDecoration(new Range(1, 1, 1, 1), 'before1', 1 /* InlineDecorationType.Before */),
                new InlineDecoration(new Range(1, 1, 1, 1), 'after1', 2 /* InlineDecorationType.After */)
            ]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld01vZGVsRGVjb3JhdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvdmlld01vZGVsL3ZpZXdNb2RlbERlY29yYXRpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbkQsT0FBTyxFQUFFLGdCQUFnQixFQUF3QixNQUFNLGdEQUFnRCxDQUFDO0FBRXhHLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7SUFFbEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1FBQ3ZDLE1BQU0sSUFBSSxHQUFHO1lBQ1osb0RBQW9EO1NBQ3BELENBQUM7UUFDRixNQUFNLElBQUksR0FBbUI7WUFDNUIsUUFBUSxFQUFFLGdCQUFnQjtZQUMxQixjQUFjLEVBQUUsRUFBRTtTQUNsQixDQUFDO1FBQ0YsYUFBYSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUM5RCxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxj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QUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsc0NBQThCO2dCQUNsRixJQUFJLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFFBQVEscUNBQTZCO2dCQUNuRixJQUFJLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsdUNBQStCO2dCQUNuRixJQUFJLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsc0NBQThCO2dCQUNsRixJQUFJLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFFBQVEsdUNBQStCO2dCQUNwRixJQUFJLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsc0NBQThCO2dCQUNsRixJQUFJLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsdUNBQStCO2dCQUNuRixJQUFJLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsc0NBQThCO2FBQ2xGLENBQUMsQ0FBQztZQUVILE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLGdDQUFnQyxDQUNwRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDN0UsQ0FBQyxDQUNELENBQUMsaUJBQWlCLENBQUM7WUFFcEIsOEJBQThCO1lBQzlCLE1BQU0sQ0FBQyxlQUFlLENBQUMsa0JBQWtCLEVBQUU7Z0JBQzFDLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSx1Q0FBK0I7Z0JBQ25GLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxxQ0FBNkI7Z0JBQ2pGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSx1Q0FBK0I7Z0JBQ3BGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSx1Q0FBK0I7Z0JBQ25GLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSx1Q0FBK0I7Z0JBQ25GLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxzQ0FBOEI7Z0JBQ2xGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxxQ0FBNkI7Z0JBQ2pGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSx1Q0FBK0I7Z0JBQ25GLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxzQ0FBOEI7Z0JBQ2xGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxxQ0FBNkI7Z0JBQ2pGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSx1Q0FBK0I7Z0JBQ3BGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxzQ0FBOEI7Z0JBQ2xGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSx1Q0FBK0I7Z0JBQ25GLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxzQ0FBOEI7Z0JBQ2xGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyx1Q0FBK0I7Z0JBQ3BGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyxzQ0FBOEI7Z0JBQ25GLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsU0FBUyxxQ0FBNkI7Z0JBQ2xGLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFB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