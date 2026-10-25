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
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../../common/editor.js';

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

	test('toUntyped preserves the virtual resource and its labels', () => {
		const resource = URI.parse('virtual://authority/example.md?version=2#heading');
		disposables.add(accessor.textModelResolverService.registerTextModelContentProvider(resource.scheme, { provideTextContent: async () => null }));
		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, resource, 'Generated document', 'Virtual content', undefined, undefined));

		assert.deepStrictEqual(input.toUntyped(), {
			resource,
			label: 'Generated document',
			description: 'Virtual content',
			options: { override: DEFAULT_EDITOR_ASSOCIATION.id }
		});
	});

	test('untyped virtual resource resolves to the existing readonly text model', async () => {
		accessor.filesConfigurationService.isReadonly = () => true;
		const resource = URI.parse('virtual://authority/example.md');
		const textModel = disposables.add(accessor.modelService.createModel('# Generated document', accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource));
		disposables.add(accessor.textModelResolverService.registerTextModelContentProvider(resource.scheme, { provideTextContent: async () => textModel }));
		const input = disposables.add(accessor.textEditorService.createTextEditor({ resource, label: 'Generated document', description: 'Virtual content' }));
		const model = disposables.add(await input.resolve());
		const untyped = input.toUntyped();
		assert.ok(untyped);
		const reopened = accessor.textEditorService.createTextEditor(untyped);
		const reopenedModel = await reopened.resolve();

		assert.deepStrictEqual({
			sameInput: reopened === input,
			sameModel: reopenedModel === model,
			readonly: reopened.isReadonly(),
			contents: textModel.getValue()
		}, {
			sameInput: true,
			sameModel: true,
			readonly: true,
			contents: '# Generated document'
		});
	});

	test('model-only resource does not advertise an untyped representation', async () => {
		const resource = URI.parse('inmemory://model-only/example');
		disposables.add(accessor.modelService.createModel('Transient content', accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource));
		const input = disposables.add(accessor.textEditorService.createTextEditor({ resource }));
		await input.resolve();
		const untyped = input.toUntyped();
		assert.strictEqual(untyped, undefined);
		input.dispose();
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		await assert.rejects(accessor.textModelResolverService.createModelReference(resource), /Unable to resolve/);
	});

	test('resource without a content provider does not advertise an untyped representation', () => {
		const resource = URI.parse('unregistered://authority/example');
		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, resource, undefined, undefined, undefined, undefined));
		assert.strictEqual(input.toUntyped(), undefined);
	});

	test('provider-backed resource can be recreated after the original input is disposed', async () => {
		const resource = URI.parse('virtual://authority/regenerated');
		let generations = 0;
		disposables.add(accessor.textModelResolverService.registerTextModelContentProvider(resource.scheme, {
			provideTextContent: async () => accessor.modelService.getModel(resource) ?? disposables.add(accessor.modelService.createModel(`Generation ${++generations}`, accessor.languageService.createById(PLAINTEXT_LANGUAGE_ID), resource))
		}));
		const input = disposables.add(accessor.textEditorService.createTextEditor({ resource }));
		await input.resolve();
		const untyped = input.toUntyped();
		assert.ok(untyped);
		input.dispose();
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		const reopened = disposables.add(accessor.textEditorService.createTextEditor(untyped));
		await reopened.resolve();
		assert.deepStrictEqual({ newInput: reopened !== input, generations, contents: accessor.modelService.getModel(resource)?.getValue() }, {
			newInput: true,
			generations: 2,
			contents: 'Generation 2'
		});
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
