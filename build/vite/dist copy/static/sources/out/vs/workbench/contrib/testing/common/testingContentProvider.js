/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { ITestResultService } from './testResultService.js';
import { TEST_DATA_SCHEME, parseTestUri } from './testingUri.js';
/**
 * A content provider that returns various outputs for tests. This is used
 * in the inline peek view.
 */
let TestingContentProvider = class TestingContentProvider {
    static { this.ID = 'workbench.contrib.testing.contentProvider'; }
    constructor(textModelResolverService, languageService, modelService, resultService) {
        this.languageService = languageService;
        this.modelService = modelService;
        this.resultService = resultService;
        textModelResolverService.registerTextModelContentProvider(TEST_DATA_SCHEME, this);
    }
    /**
     * @inheritdoc
     */
    async provideTextContent(resource) {
        const existing = this.modelService.getModel(resource);
        if (existing && !existing.isDisposed()) {
            return existing;
        }
        const parsed = parseTestUri(resource);
        if (!parsed) {
            return null;
        }
        const result = this.resultService.getResult(parsed.resultId);
        if (!result) {
            return null;
        }
        if (parsed.type === 0 /* TestUriType.TaskOutput */) {
            const task = result.tasks[parsed.taskIndex];
            const model = this.modelService.createModel('', null, resource, false);
            const append = (text) => model.applyEdits([{
                    range: { startColumn: 1, endColumn: 1, startLineNumber: Infinity, endLineNumber: Infinity },
                    text,
                }]);
            const init = VSBuffer.concat(task.output.buffers, task.output.length).toString();
            append(removeAnsiEscapeCodes(init));
            let hadContent = init.length > 0;
            const dispose = new DisposableStore();
            dispose.add(task.output.onDidWriteData(d => {
                hadContent ||= d.byteLength > 0;
                append(removeAnsiEscapeCodes(d.toString()));
            }));
            task.output.endPromise.then(() => {
                if (dispose.isDisposed) {
                    return;
                }
                if (!hadContent) {
                    append(localize('runNoOutout', 'The test run did not record any output.'));
                    dispose.dispose();
                }
            });
            dispose.add(model.onWillDispose(() => dispose.dispose()));
            return model;
        }
        const test = result?.getStateById(parsed.testExtId);
        if (!test) {
            return null;
        }
        let text;
        let language = null;
        switch (parsed.type) {
            case 3 /* TestUriType.ResultActualOutput */: {
                const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
                if (message?.type === 0 /* TestMessageType.Error */) {
                    text = message.actual;
                }
                break;
            }
            case 1 /* TestUriType.TestOutput */: {
                text = '';
                const output = result.tasks[parsed.taskIndex].output;
                for (const message of test.tasks[parsed.taskIndex].messages) {
                    if (message.type === 1 /* TestMessageType.Output */) {
                        text += removeAnsiEscapeCodes(output.getRange(message.offset, message.length).toString());
                    }
                }
                break;
            }
            case 4 /* TestUriType.ResultExpectedOutput */: {
                const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
                if (message?.type === 0 /* TestMessageType.Error */) {
                    text = message.expected;
                }
                break;
            }
            case 2 /* TestUriType.ResultMessage */: {
                const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
                if (!message) {
                    break;
                }
                if (message.type === 1 /* TestMessageType.Output */) {
                    const content = result.tasks[parsed.taskIndex].output.getRange(message.offset, message.length);
                    text = removeAnsiEscapeCodes(content.toString());
                }
                else if (typeof message.message === 'string') {
                    text = removeAnsiEscapeCodes(message.message);
                }
                else {
                    text = message.message.value;
                    language = this.languageService.createById('markdown');
                }
            }
        }
        if (text === undefined) {
            return null;
        }
        return this.modelService.createModel(text, language, resource, false);
    }
};
TestingContentProvider = __decorate([
    __param(0, ITextModelService),
    __param(1, ILanguageService),
    __param(2, IModelService),
    __param(3, ITestResultService)
], TestingContentProvider);
export { TestingContentProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ0NvbnRlbnRQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RpbmdDb250ZW50UHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUUzRSxPQUFPLEVBQXNCLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFFdkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBNkIsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFNUQsT0FBTyxFQUFFLGdCQUFnQixFQUFlLFlBQVksRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTlFOzs7R0FHRztBQUNJLElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXNCO2FBQ1gsT0FBRSxHQUFHLDJDQUEyQyxBQUE5QyxDQUErQztJQUV4RSxZQUNvQix3QkFBMkMsRUFDM0IsZUFBaUMsRUFDcEMsWUFBMkIsRUFDdEIsYUFBaUM7UUFGbkMsb0JBQWUsR0FBZixlQUFlLENBQWtCO1FBQ3BDLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQ3RCLGtCQUFhLEdBQWIsYUFBYSxDQUFvQjtRQUV0RSx3QkFBd0IsQ0FBQyxnQ0FBZ0MsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJ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