/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { DEFAULT_WORD_REGEXP } from 'vs/editor/common/core/wordHelper';
import * as languages from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { EditorSimpleWorker } from 'vs/editor/common/services/editorSimpleWorker';
import { EditorWorkerService } from 'vs/editor/browser/services/editorWorkerService';
import { IEditorWorkerHost } from 'vs/editor/common/services/editorWorkerHost';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { CompletionItem } from 'vs/editor/contrib/suggest/browser/suggest';
import { WordDistance } from 'vs/editor/contrib/suggest/browser/wordDistance';
import { createCodeEditorServices, instantiateTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { NullLogService } from 'vs/platform/log/common/log';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { ILanguageService } from 'vs/editor/common/languages/language';

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

			private _worker = new EditorSimpleWorker(new class extends mock<IEditorWorkerHost>() { }, null);

			constructor() {
				super(modelService, new class extends mock<ITextResourceConfigurationService>() { }, new NullLogService(), new TestLanguageConfigurationService(), new LanguageFeaturesService());
				this._worker.acceptNewModel({
					url: model.uri.toString(),
					lines: model.getLinesContent(),
					EOL: model.getEOL(),
					versionId: model.getVersionId()
				});
				model.onDidChangeContent(e => this._worker.acceptModelChanged(model.uri.toString(), e));
			}
			override computeWordRanges(resource: URI, range: IRange): Promise<{ [word: string]: IRange[] } | null> {
				return this._worker.computeWordRanges(resource.toString(), range, DEFAULT_WORD_REGEXP.source, DEFAULT_WORD_REGEXP.flags);
			}
		};

		distance = await WordDistance.create(service, editor);

		disposables.add(service);
	});

	teardown(function () {
		disposables.clear();
	});

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
