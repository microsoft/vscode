/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IPosition } from '../../../../common/core/position.js';
import { IRange } from '../../../../common/core/range.js';
import { DEFAULT_WORD_REGEXP } from '../../../../common/core/wordHelper.js';
import * as languages from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { EditorWorker } from '../../../../common/services/editorWebWorker.js';
import { EditorWorkerService } from '../../../../browser/services/editorWorkerService.js';
import { IModelService } from '../../../../common/services/model.js';
import { ITextResourceConfigurationService } from '../../../../common/services/textResourceConfiguration.js';
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

	let distance: WordDistance;
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

		const modelService = new class extends mock<IModelService>() {
			override onModelRemoved = Event.None;
			override getModel(uri: URI) {
				return uri.toString() === model.uri.toString() ? model : null;
			}
		};

		const service = new class extends EditorWorkerService {

			private _worker = new EditorWorker();

			constructor() {
				super(null!, modelService, new class extends mock<ITextResourceConfigurationService>() { }, new NullLogService(), new TestLanguageConfigurationService(), new LanguageFeaturesService());
				this._worker.$acceptNewModel({
					url: model.uri.toString(),
					lines: model.getLinesContent(),
					EOL: model.getEOL(),
					versionId: model.getVersionId()
				});
				model.onDidChangeContent(e => this._worker.$acceptModelChanged(model.uri.toString(), e));
			}
			override computeWordRanges(resource: URI, range: IRange): Promise<{ [word: string]: IRange[] } | null> {
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

	function createSuggestItem(label: string, overwriteBefore: number, position: IPosition): CompletionItem {
		const suggestion: languages.CompletionItem = {
			label,
			range: { startLineNumber: position.lineNumber, startColumn: position.column - overwriteBefore, endLineNumber: position.lineNumber, endColumn: position.column },
			insertText: label,
			kind: 0
		};
		const container: languages.CompletionList = {
			suggestions: [suggestion]
		};
		const provider: languages.CompletionItemProvider = {
			_debugDisplayName: 'test',
			provideCompletionItems(): any {
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
