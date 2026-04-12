/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { DEFAULT_WORD_REGEXP } from '../../../../common/core/wordHelper.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { EditorWorker } from '../../../../common/services/editorWebWorker.js';
import { EditorWorkerService } from '../../../../browser/services/editorWorkerService.js';
import { CompletionItem } from '../../browser/suggest.js';
import { WordDistance } from '../../browser/wordDistance.js';
import { createCodeEditorServices, instantiateTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../test/common/testTextModel.js';
import { TestLanguageConfigurationService } from '../../../../test/common/modes/testLanguageConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('suggest, word distance', function () {
    let distance;
    const disposables = new DisposableStore();
    setup(async function () {
        const languageId = 'bracketMode';
        disposables.clear();
        const instantiationService = createCodeEditorServices(disposables);
        const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        const languageService = instantiationService.get(ILanguageService);
        disposables.add(languageService.registerLanguage({ id: languageId }));
        disposables.add(languageConfigurationService.register(languageId, {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ]
        }));
        const model = disposables.add(instantiateTextModel(instantiationService, 'function abc(aa, ab){\na\n}', languageId, undefined, URI.parse('test:///some.path')));
        const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
        editor.updateOptions({ suggest: { localityBonus: true } });
        editor.setPosition({ lineNumber: 2, column: 2 });
        const modelService = new class extends mock() {
            constructor() {
                super(...arguments);
                this.onModelRemoved = Event.None;
            }
            getModel(uri) {
                return uri.toString() === model.uri.toString() ? model : null;
            }
        };
        const service = new class extends EditorWorkerService {
            constructor() {
                super(modelService, new class extends mock() {
                }, new NullLogService(), new TestLanguageConfigurationService(), new LanguageFeaturesService(), null);
                this._worker = new EditorWorker();
                this._worker.$acceptNewModel({
                    url: model.uri.toString(),
                    lines: model.getLinesContent(),
                    EOL: model.getEOL(),
                    versionId: model.getVersionId()
                });
                model.onDidChangeContent(e => this._worker.$acceptModelChanged(model.uri.toString(), e));
            }
            computeWordRanges(resource, range) {
                return this._worker.$computeWordRanges(resource.toString(), range, DEFAULT_WORD_REGEXP.source, DEFAULT_WORD_REGEXP.flags);
            }
        };
        distance = await WordDistance.create(service, editor);
        disposables.add(service);
    });
    teardown(function () {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createSuggestItem(label, overwriteBefore, position) {
        const suggestion = {
            label,
            range: { startLineNumber: position.lineNumber, startColumn: position.column - overwriteBefore, endLineNumber: position.lineNumber, endColumn: position.column },
            insertText: label,
            kind: 0
        };
        const container = {
            suggestions: [suggestion]
        };
        const provider = {
            _debugDisplayName: 'test',
            provideCompletionItems() {
                return;
            }
        };
        return new CompletionItem(position, suggestion, container, provider);
    }
    test('Suggest locality bonus can boost current word #90515', function () {
        const pos = { lineNumber: 2, column: 2 };
        const d1 = distance.distance(pos, createSuggestItem('a', 1, pos).completion);
        const d2 = distance.distance(pos, createSuggestItem('aa', 1, pos).completion);
        const d3 = distance.distance(pos, createSuggestItem('ab', 1, pos).completion);
        assert.ok(d1 > d2);
        assert.ok(d2 === d3);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZERpc3RhbmNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zdWdnZXN0L3Rlc3QvYnJvd3Nlci93b3JkRGlzdGFuY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRy9ELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTVFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUcxRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDMUQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzdELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2pILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3JILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3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