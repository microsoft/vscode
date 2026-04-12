/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { IndentationContextProcessor, ProcessedIndentRulesSupport } from '../../../../common/languages/supports/indentationLineProcessor.js';
import { Language, registerLanguage, registerLanguageConfiguration, registerTokenizationSupport } from './indentation.test.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { Range } from '../../../../common/core/range.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { LanguageService } from '../../../../common/services/languageService.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { ILanguageService } from '../../../../common/languages/language.js';
suite('Indentation Context Processor - TypeScript/JavaScript', () => {
    const languageId = Language.TypeScript;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('brackets inside of string', () => {
        const model = createTextModel([
            'const someVar = "{some text}"',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [[
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 16, standardTokenType: 2 /* StandardTokenType.String */ },
                    { startIndex: 28, standardTokenType: 2 /* StandardTokenType.String */ }
                ]];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
            const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
            const processedContext = indentationContextProcessor.getProcessedTokenContextAroundRange(new Range(1, 23, 1, 23));
            assert.strictEqual(processedContext.beforeRangeProcessedTokens.getLineContent(), 'const someVar = "some');
            assert.strictEqual(processedContext.afterRangeProcessedTokens.getLineContent(), ' text"');
            assert.strictEqual(processedContext.previousLineProcessedTokens.getLineContent(), '');
        });
    });
    test('brackets inside of comment', () => {
        const model = createTextModel([
            'const someVar2 = /*(a])*/',
            'const someVar = /* [()] some other t{e}xt() */ "some text"',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 17, standardTokenType: 1 /* StandardTokenType.Comment */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 16, standardTokenType: 1 /* StandardTokenType.Comment */ },
                    { startIndex: 46, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 47, standardTokenType: 2 /* StandardTokenType.String */ }
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
            const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
            const processedContext = indentationContextProcessor.getProcessedTokenContextAroundRange(new Range(2, 29, 2, 35));
            assert.strictEqual(processedContext.beforeRangeProcessedTokens.getLineContent(), 'const someVar = /*  some');
            assert.strictEqual(processedContext.afterRangeProcessedTokens.getLineContent(), ' text */ "some text"');
            assert.strictEqual(processedContext.previousLineProcessedTokens.getLineContent(), 'const someVar2 = /*a*/');
        });
    });
    test('brackets inside of regex', () => {
        const model = createTextModel([
            'const someRegex2 = /(()))]/;',
            'const someRegex = /()a{h}{s}[(a}87(9a9()))]/;',
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 19, standardTokenType: 3 /* StandardTokenType.RegEx */ },
                    { startIndex: 27, standardTokenType: 0 /* StandardTokenType.Other */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 18, standardTokenType: 3 /* StandardTokenType.RegEx */ },
                    { startIndex: 44, standardTokenType: 0 /* StandardTokenType.Other */ },
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
            const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
            const processedContext = indentationContextProcessor.getProcessedTokenContextAroundRange(new Range(1, 25, 2, 33));
            assert.strictEqual(processedContext.beforeRangeProcessedTokens.getLineContent(), 'const someRegex2 = /');
            assert.strictEqual(processedContext.afterRangeProcessedTokens.getLineContent(), '879a9/;');
            assert.strictEqual(processedContext.previousLineProcessedTokens.getLineContent(), '');
        });
    });
});
suite('Processed Indent Rules Support - TypeScript/JavaScript', () => {
    const languageId = Language.TypeScript;
    let disposables;
    let serviceCollection;
    setup(() => {
        disposables = new DisposableStore();
        const languageService = new LanguageService();
        const languageConfigurationService = new TestLanguageConfigurationService();
        disposables.add(languageService);
        disposables.add(languageConfigurationService);
        disposables.add(registerLanguage(languageService, languageId));
        disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
        serviceCollection = new ServiceCollection([ILanguageService, languageService], [ILanguageConfigurationService, languageConfigurationService]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should increase', () => {
        const model = createTextModel([
            'const someVar = {',
            'const someVar2 = "{"',
            'const someVar3 = /*{*/'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ }
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 17, standardTokenType: 2 /* StandardTokenType.String */ },
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 17, standardTokenType: 1 /* StandardTokenType.Comment */ },
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
            const indentationRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
            if (!indentationRulesSupport) {
                assert.fail('indentationRulesSupport should be defined');
            }
            const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentationRulesSupport, languageConfigurationService);
            assert.strictEqual(processedIndentRulesSupport.shouldIncrease(1), true);
            assert.strictEqual(processedIndentRulesSupport.shouldIncrease(2), false);
            assert.strictEqual(processedIndentRulesSupport.shouldIncrease(3), false);
        });
    });
    test('should decrease', () => {
        const model = createTextModel([
            '}',
            '"])some text}"',
            '])*/'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [{ startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ }],
                [{ startIndex: 0, standardTokenType: 2 /* StandardTokenType.String */ }],
                [{ startIndex: 0, standardTokenType: 1 /* StandardTokenType.Comment */ }]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
            const indentationRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
            if (!indentationRulesSupport) {
                assert.fail('indentationRulesSupport should be defined');
            }
            const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentationRulesSupport, languageConfigurationService);
            assert.strictEqual(processedIndentRulesSupport.shouldDecrease(1), true);
            assert.strictEqual(processedIndentRulesSupport.shouldDecrease(2), false);
            assert.strictEqual(processedIndentRulesSupport.shouldDecrease(3), false);
        });
    });
    test('should increase next line', () => {
        const model = createTextModel([
            'if()',
            'const someString = "if()"',
            'const someRegex = /if()/'
        ].join('\n'), languageId, {});
        disposables.add(model);
        withTestCodeEditor(model, { autoIndent: 'full', serviceCollection }, (editor, viewModel, instantiationService) => {
            const tokens = [
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ }
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 19, standardTokenType: 2 /* StandardTokenType.String */ }
                ],
                [
                    { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                    { startIndex: 18, standardTokenType: 3 /* StandardTokenType.RegEx */ }
                ]
            ];
            disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
            const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
            const indentationRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
            if (!indentationRulesSupport) {
                assert.fail('indentationRulesSupport should be defined');
            }
            const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentationRulesSupport, languageConfigurationService);
            assert.strictEqual(processedIndentRulesSupport.shouldIndentNextLine(1), true);
            assert.strictEqual(processedIndentRulesSupport.shouldIndentNextLine(2), false);
            assert.strictEqual(processedIndentRulesSupport.shouldIndentNextLine(3), false);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZW50YXRpb25MaW5lUHJvY2Vzc29yLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmRlbnRhdGlvbi90ZXN0L2Jyb3dzZXIvaW5kZW50YXRpb25MaW5lUHJvY2Vzc29yLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUM3SSxPQUFPLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLDZCQUE2QixFQUFFLDJCQUEyQixFQUF5QixNQUFNLHVCQUF1QixDQUFDO0FBQ3RKLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3JILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTVFLEtBQUssQ0FBQyx1REFBdUQsRUFBRSxHQUFHLEVBQUU7SUFFbkUsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQztJQUN2QyxJQUFJLFdBQTRCLENBQUM7SUFDakMsSUFBSSxpQkFBb0MsQ0FBQztJQUV6QyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUM5QyxNQUFNLDRCQUE0QixHQUFHLElBQUksZ0NBQWdDLEVBQUUsQ0FBQztRQUM1RSxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2pDLFdBQVcsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUM5QyxXQUFXLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQy9ELFdBQVcsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsNEJBQTRCLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUN6RixpQkFBaUIsR0FBRyxJQUFJLGlCQUFpQixDQUN4QyxDQUFDLGdCQUFnQixFQUFFLGVBQWUsQ0FBQyxFQUNuQyxDQUFDLDZCQUE2QixFQUFFLDRCQUE0QixDQUFDLENBQzdELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7UUFFdEMsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDO1lBQzdCLCtCQUErQjtTQUMvQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUIsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV2QixrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixFQUFFLEVBQUU7WUFDaEgsTUFBTSxNQUFNLEdBQThCLENBQUM7b0JBQzFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxpQkFBaUIsaUNBQXlCLEVBQUU7b0JBQzdELEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxpQkFBaUIsa0NBQTBCLEVBQUU7b0JBQy9ELEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxpQkFBaUIsa0NBQTBCLEVBQUU7aUJBQy9ELENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkYsTUFBTSw0QkFBNEIsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztZQUM3RixNQUFNLDJCQUEyQixHQUFHLElBQUksMkJBQTJCLENBQUMsS0FBSyxFQUFFLDRCQUE0QixDQUFDLENBQUM7WUFDekcsTUFBTSxnQkFBZ0IsR0FBRywyQkFBMkIsQ0FBQyxtQ0FBbUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2xILE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUMsY0FBYyxFQUFFLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztZQUMxRyxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDLGNBQWMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzFGLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsMkJBQTJCLENBQUMsY0FBYyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkYsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7UUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDO1lBQzdCLDJCQUEyQjtZQUMzQiw0REFBNEQ7U0FDNUQsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFdkIsa0JBQWtCLENBQUMsS0FBSyxFQUFFLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFO1lBQ2hILE1BQU0sTUFBTSxHQUE4QjtnQkFDekM7b0JBQ0MsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDN0QsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixtQ0FBMkIsRUFBRTtpQkFDaEU7Z0JBQ0Q7b0JBQ0MsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDN0QsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixtQ0FBMkIsRUFBRTtvQkFDaEUsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDOUQsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixrQ0FBMEIsRUFBRTtpQkFDL0Q7YUFBQyxDQUFDO1lBQ0osV0FBVyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUN2RixNQUFNLDRCQUE0QixHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1lBQzdGLE1BQU0sMkJBQTJCLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxLQUFLLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUN6RyxNQUFNLGdCQUFnQixHQUFHLDJCQUEyQixDQUFDLG1DQUFtQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLEVBQUUsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1lBQzdHLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMseUJBQXlCLENBQUMsY0FBYyxFQUFFLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztZQUN4RyxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLDJCQUEyQixDQUFDLGNBQWMsRUFBRSxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFDN0csQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7UUFFckMsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDO1lBQzdCLDhCQUE4QjtZQUM5QiwrQ0FBK0M7U0FDL0MsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFdkIsa0JBQWtCLENBQUMsS0FBSyxFQUFFLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFO1lBQ2hILE1BQU0sTUFBTSxHQUE4QjtnQkFDekM7b0JBQ0MsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDN0QsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDOUQsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtpQkFDOUQ7Z0JBQ0Q7b0JBQ0MsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDN0QsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDOUQsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtpQkFDOUQ7YUFDRCxDQUFDO1lBQ0YsV0FBVyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUN2RixNQUFNLDRCQUE0QixHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1lBQzdGLE1BQU0sMkJBQTJCLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxLQUFLLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUN6RyxNQUFNLGdCQUFnQixHQUFHLDJCQUEyQixDQUFDLG1DQUFtQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxjQUFjLEVBQUUsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1lBQ3pHLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMseUJBQXlCLENBQUMsY0FBYyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN2RixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxLQUFLLENBQUMsd0RBQXdELEVBQUUsR0FBRyxFQUFFO0lBRXBFLE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUM7SUFDdkMsSUFBSSxXQUE0QixDQUFDO0lBQ2pDLElBQUksaUJBQW9DLENBQUM7SUFFekMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3BDLE1BQU0sZUFBZSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDOUMsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLGdDQUFnQyxFQUFFLENBQUM7UUFDNUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNqQyxXQUFXLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDOUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUMvRCxXQUFXLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLDRCQUE0QixFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDekYsaUJBQWlCLEdBQUcsSUFBSSxpQkFBaUIsQ0FDeEMsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsRUFDbkMsQ0FBQyw2QkFBNkIsRUFBRSw0QkFBNEIsQ0FBQyxDQUM3RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO1FBRTVCLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQztZQUM3QixtQkFBbUI7WUFDbkIsc0JBQXNCO1lBQ3RCLHdCQUF3QjtTQUN4QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUIsV0FBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV2QixrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixFQUFFLEVBQUU7WUFDaEgsTUFBTSxNQUFNLEdBQThCO2dCQUN6QztvQkFDQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO2lCQUM3RDtnQkFDRDtvQkFDQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM3RCxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLGtDQUEwQixFQUFFO2lCQUMvRDtnQkFDRDtvQkFDQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLGlDQUF5QixFQUFFO29CQUM3RCxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFO2lCQUNoRTthQUNELENBQUM7WUFDRixXQUFXLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLE1BQU0sNEJBQTRCLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFDN0YsTUFBTSx1QkFBdUIsR0FBRyw0QkFBNEIsQ0FBQyx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQztZQUNySCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDOUIsTUFBTSxDQUFDLElBQUksQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1lBQzFELENBQUM7WUFDRCxNQUFNLDJCQUEyQixHQUFHLElBQUksMkJBQTJCLENBQUMsS0FBSyxFQUFFLHVCQUF1QixFQUFFLDRCQUE0QixDQUFDLENBQUM7WUFDbEksTUFBTSxDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDeEUsTUFBTSxDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDekUsTUFBTSxDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7UUFFNUIsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDO1lBQzdCLEdBQUc7WUFDSCxnQkFBZ0I7WUFDaEIsTUFBTTtTQUNOLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM5QixXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXZCLGtCQUFrQixDQUFDLEtBQUssRUFBRSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsb0JBQW9CLEVBQUUsRUFBRTtZQUNoSCxNQUFNLE1BQU0sR0FBOEI7Z0JBQ3pDLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRSxDQUFDO2dCQUMvRCxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxpQkFBaUIsa0NBQTBCLEVBQUUsQ0FBQztnQkFDaEUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLG1DQUEyQixFQUFFLENBQUM7YUFDakUsQ0FBQztZQUNGLFdBQVcsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkYsTUFBTSw0QkFBNEIsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztZQUM3RixNQUFNLHVCQUF1QixHQUFHLDRCQUE0QixDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDO1lBQ3JILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO2dCQUM5QixNQUFNLENBQUMsSUFBSSxDQUFDLDJDQUEyQyxDQUFDLENBQUM7WUFDMUQsQ0FBQztZQUNELE1BQU0sMkJBQTJCLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUNsSSxNQUFNLENBQUMsV0FBVyxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN4RSxNQUFNLENBQUMsV0FBVyxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN6RSxNQUFNLENBQUMsV0FBVyxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxRSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUV0QyxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUM7WUFDN0IsTUFBTTtZQUNOLDJCQUEyQjtZQUMzQiwwQkFBMEI7U0FDMUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFdkIsa0JBQWtCLENBQUMsS0FBSyxFQUFFLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFO1lBQ2hILE1BQU0sTUFBTSxHQUE4QjtnQkFDekM7b0JBQ0MsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtpQkFDN0Q7Z0JBQ0Q7b0JBQ0MsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDN0QsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixrQ0FBMEIsRUFBRTtpQkFDL0Q7Z0JBQ0Q7b0JBQ0MsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtvQkFDN0QsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLGlCQUFpQixpQ0FBeUIsRUFBRTtpQkFDOUQ7YUFDRCxDQUFDO1lBQ0YsV0FBVyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUN2RixNQUFNLDRCQUE0QixHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1lBQzdGLE1BQU0sdUJBQXVCLEdBQUcsNEJBQTRCLENBQUMsd0JBQXdCLENBQUMsVUFBVSxDQUFDLENBQUMsa0JBQWtCLENBQUM7WUFDckgsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQzlCLE1BQU0sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLENBQUMsQ0FBQztZQUMxRCxDQUFDO1lBQ0QsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLDJCQUEyQixDQUFDLEtBQUssRUFBRSx1QkFBdUIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1lBQ2xJLE1BQU0sQ0FBQyxXQUFXLENBQUMsMkJBQTJCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDOUUsTUFBTSxDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvRSxNQUFNLENBQUMsV0FBVyxDQUFDLDJCQUEyQixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2hGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9