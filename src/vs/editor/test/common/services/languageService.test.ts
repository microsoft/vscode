/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILanguageExtensionPoint, ILanguageService } from '../../../common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../common/languages/modesRegistry.js';
import { IModelService } from '../../../common/services/model.js';
import { LanguageService } from '../../../common/services/languageService.js';
import { createModelServices } from '../testTextModel.js';

class TestLanguageService extends LanguageService {
	setLanguages(languages: ILanguageExtensionPoint[]): void {
		this._registry.setDynamicLanguages(languages);
	}
}

function getListenerCount(languageService: LanguageService): number {
	// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
	return languageService['_onDidChange']['_size'];
}

suite('LanguageService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let languageServiceInstanceCount: number;

	setup(() => {
		languageServiceInstanceCount = LanguageService.instanceCount;
	});

	teardown(() => {
		assert.strictEqual(LanguageService.instanceCount, languageServiceInstanceCount);
	});

	test('LanguageSelection does not leak a disposable', () => {
		const languageService = new LanguageService();
		const languageSelection1 = languageService.createById(PLAINTEXT_LANGUAGE_ID);
		assert.strictEqual(languageSelection1.languageId, PLAINTEXT_LANGUAGE_ID);
		const languageSelection2 = languageService.createById(PLAINTEXT_LANGUAGE_ID);
		const listener = languageSelection2.onDidChange(() => { });
		assert.strictEqual(languageSelection2.languageId, PLAINTEXT_LANGUAGE_ID);
		listener.dispose();
		languageService.dispose();
	});

	test('live text models share a registry listener and release it when disposed', () => {
		const modelDisposables = disposables.add(new DisposableStore());
		const services = createModelServices(modelDisposables);
		const languageService = services.get(ILanguageService);
		assert.ok(languageService instanceof LanguageService);
		const modelService = services.get(IModelService);
		const counts: number[] = [getListenerCount(languageService)];

		for (let cycle = 0; cycle < 2; cycle++) {
			const models = Array.from({ length: 60 }, (_, index) => {
				const resource = URI.parse(`test:language-selection-${cycle}-${index}`);
				const selection = index % 3 === 0 ? languageService.createById(PLAINTEXT_LANGUAGE_ID)
					: index % 3 === 1 ? languageService.createByMimeType('text/plain')
						: languageService.createByFilepathOrFirstLine(resource);
				return modelDisposables.add(modelService.createModel('text', selection, resource));
			});
			counts.push(getListenerCount(languageService));
			for (const model of models.slice(0, 30)) {
				model.dispose();
			}
			counts.push(getListenerCount(languageService));
			for (const model of models.slice(30)) {
				model.dispose();
			}
			counts.push(getListenerCount(languageService));
		}

		assert.deepStrictEqual({ counts, remainingModels: modelService.getModels().length }, {
			counts: [0, 1, 1, 0, 1, 1, 0],
			remainingModels: 0
		});
	});

	const language = {
		id: 'testLanguageSelection',
		extensions: ['.testLanguageSelection'],
		mimetypes: ['text/testLanguageSelection'],
		firstLine: '^#!testLanguageSelection'
	};

	for (const { name, create } of [
		{ name: 'ID', create: (service: LanguageService) => service.createById(language.id) },
		{ name: 'MIME type', create: (service: LanguageService) => service.createByMimeType(language.mimetypes[0]) },
		{ name: 'file path', create: (service: LanguageService) => service.createByFilepathOrFirstLine(URI.parse('test:file.testLanguageSelection')) },
		{ name: 'first line', create: (service: LanguageService) => service.createByFilepathOrFirstLine(URI.parse('test:file'), '#!testLanguageSelection') },
	]) {
		test(`${name} selections update after an initial read and after resubscribing`, () => {
			const languageService = disposables.add(new TestLanguageService());
			const selection = create(languageService);
			const subscribe = selection.onDidChange;
			const initial = selection.languageId;
			const counts = [getListenerCount(languageService)];
			const events: string[] = [];
			const listener = disposables.add(new MutableDisposable());
			listener.value = subscribe(value => events.push(value));
			counts.push(getListenerCount(languageService));

			languageService.setLanguages([language]);
			languageService.setLanguages([language, { id: 'unrelatedLanguageSelection' }]);
			const registered = selection.languageId;
			listener.clear();
			languageService.setLanguages([]);
			const unobserved = selection.languageId;
			counts.push(getListenerCount(languageService));

			listener.value = subscribe(value => events.push(value));
			languageService.setLanguages([language]);
			languageService.setLanguages([]);
			listener.clear();
			counts.push(getListenerCount(languageService));

			assert.deepStrictEqual({ initial, registered, unobserved, events, counts }, {
				initial: PLAINTEXT_LANGUAGE_ID,
				registered: language.id,
				unobserved: PLAINTEXT_LANGUAGE_ID,
				events: [language.id, language.id, PLAINTEXT_LANGUAGE_ID],
				counts: [0, 1, 0, 0]
			});
		});
	}

	test('language notifications tolerate removing and adding observed selections', () => {
		const languageService = disposables.add(new TestLanguageService());
		const first = languageService.createById(language.id);
		const second = languageService.createById(language.id);
		const listener = disposables.add(new MutableDisposable());
		const events: string[] = [];
		const firstListener = disposables.add(first.onDidChange(value => {
			events.push(`first:${value}`);
			listener.clear();
			listener.value = second.onDidChange(value => events.push(`second:${value}`));
		}));
		listener.value = second.onDidChange(value => events.push(`second:${value}`));

		languageService.setLanguages([language]);
		firstListener.dispose();
		languageService.setLanguages([]);
		listener.clear();

		assert.deepStrictEqual({ events, listeners: getListenerCount(languageService) }, {
			events: [`first:${language.id}`, `second:${PLAINTEXT_LANGUAGE_ID}`],
			listeners: 0
		});
	});

});
