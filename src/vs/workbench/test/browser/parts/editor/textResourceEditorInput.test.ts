/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { TextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { TextResourceEditorModel } from '../../../../common/editor/textResourceEditorModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService, TestServiceAccessor } from '../../workbenchTestServices.js';
import { snapshotToString } from '../../../../services/textfile/common/textfiles.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('TextResourceEditorInput', () => {

	const disposables = new DisposableStore();

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		disposables.clear();
	});

	test('basics', async () => {
		const resource = URI.from({ scheme: 'inmemory', authority: null!, path: 'thePath' });
		accessor.modelService.createModel('function test() {}', accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource);

		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, resource, 'The Name', 'The Description', undefined, undefined));

		const model = disposables.add(await input.resolve());

		assert.ok(model);
		assert.strictEqual(snapshotToString(((model as TextResourceEditorModel).createSnapshot()!)), 'function test() {}');
	});

	test('preferred language (via ctor)', async () => {
		const registration = accessor.languageService.registerLanguage({
			id: 'resource-input-test',
		});

		const resource = URI.from({ scheme: 'inmemory', authority: null!, path: 'thePath' });
		accessor.modelService.createModel('function test() {}', accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource);

		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, resource, 'The Name', 'The Description', 'resource-input-test', undefined));

		const model = disposables.add(await input.resolve());
		assert.ok(model);
		assert.strictEqual(model.textEditorModel?.getLanguageId(), 'resource-input-test');

		input.setLanguageId('text');
		assert.strictEqual(model.textEditorModel?.getLanguageId(), PLAINTEXT_LANGUAGE_ID);

		disposables.add(await input.resolve());
		assert.strictEqual(model.textEditorModel?.getLanguageId(), PLAINTEXT_LANGUAGE_ID);
		registration.dispose();
	});

	test('preferred language (via setPreferredLanguageId)', async () => {
		const registration = accessor.languageService.registerLanguage({
			id: 'resource-input-test',
		});

		const resource = URI.from({ scheme: 'inmemory', authority: null!, path: 'thePath' });
		accessor.modelService.createModel('function test() {}', accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource);

		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, resource, 'The Name', 'The Description', undefined, undefined));
		input.setPreferredLanguageId('resource-input-test');

		const model = disposables.add(await input.resolve());
		assert.ok(model);
		assert.strictEqual(model.textEditorModel?.getLanguageId(), 'resource-input-test');
		registration.dispose();
	});

	test('preferred contents (via ctor)', async () => {
		const resource = URI.from({ scheme: 'inmemory', authority: null!, path: 'thePath' });
		accessor.modelService.createModel('function test() {}', accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource);

		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, resource, 'The Name', 'The Description', undefined, 'My Resource Input Contents'));

		const model = disposables.add(await input.resolve());
		assert.ok(model);
		assert.strictEqual(model.textEditorModel?.getValue(), 'My Resource Input Contents');

		model.textEditorModel.setValue('Some other contents');
		assert.strictEqual(model.textEditorModel?.getValue(), 'Some other contents');

		disposables.add(await input.resolve());
		assert.strictEqual(model.textEditorModel?.getValue(), 'Some other contents'); // preferred contents only used once
	});

	test('preferred contents (via setPreferredContents)', async () => {
		const resource = URI.from({ scheme: 'inmemory', authority: null!, path: 'thePath' });
		accessor.modelService.createModel('function test() {}', accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource);

		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, resource, 'The Name', 'The Description', undefined, undefined));
		input.setPreferredContents('My Resource Input Contents');

		const model = disposables.add(await input.resolve());
		assert.ok(model);
		assert.strictEqual(model.textEditorModel?.getValue(), 'My Resource Input Contents');

		model.textEditorModel.setValue('Some other contents');
		assert.strictEqual(model.textEditorModel?.getValue(), 'Some other contents');

		disposables.add(await input.resolve());
		assert.strictEqual(model.textEditorModel?.getValue(), 'Some other contents'); // preferred contents only used once
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
