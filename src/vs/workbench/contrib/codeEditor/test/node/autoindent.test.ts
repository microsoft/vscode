/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { getReindentEditOperations } from 'vs/editor/contrib/indentation/common/indentation';
import { IRelaxedTextModelCreationOptions, createModelServices, instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILanguageConfiguration, LanguageConfigurationFileHandler } from 'vs/workbench/contrib/codeEditor/common/languageConfigurationExtensionPoint';
import { parse } from 'vs/base/common/json';

suite('Manual Auto Indentation Evaluation', () => {

	const languageId = 'ts-test';
	const options: IRelaxedTextModelCreationOptions = {};
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageConfigurationService: ILanguageConfigurationService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createModelServices(disposables);
		languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		const configPath = path.join('extensions', 'typescript-basics', 'language-configuration.json');
		const configString = fs.readFileSync(configPath).toString();
		const config = <ILanguageConfiguration>parse(configString, []);
		const configParsed = LanguageConfigurationFileHandler.extractValidConfig(languageId, config);
		disposables.add(languageConfigurationService.register(languageId, configParsed));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// Test which can be ran to find cases of incorrect indentation
	test('Find Cases of Incorrect Indentation', () => {

		const filePath = path.join('..', 'TypeScript', 'src', 'server', 'utilities.ts');
		const fileContents = fs.readFileSync(filePath).toString();

		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		model.applyEdits(editOperations);

		// save the files to disk
		const initialFile = path.join('..', 'autoindent', 'initial.ts');
		const finalFile = path.join('..', 'autoindent', 'final.ts');
		fs.writeFileSync(initialFile, fileContents);
		fs.writeFileSync(finalFile, model.getValue());
	});

	// Unit tests
	test('Issue #56275', () => {

		let fileContents = [
			'function foo() {',
			'	var bar = (/b*/);',
			'}',
		].join('\n');
		let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepEqual(editOperations.length, 0);

		fileContents = [
			'function foo() {',
			'	var bar = "/b*/)";',
			'}',
		].join('\n');
		model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepEqual(editOperations.length, 0);
	});

	test('Issue #141816', () => {

		const fileContents = [
			'const r = /{/;',
			'',
		].join('\n');
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepEqual(editOperations.length, 0);
	});

	test('Issue #114236', () => {

		let fileContents = [
			`/*-----`,
			` * line 1`,
			` *-----*/`,
			``,
			`x`
		].join('\n');
		let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepEqual(editOperations.length, 0);

		fileContents = [
			`/*-----`,
			` * line 1`,
			` * line 2`,
			` * x`
		].join('\n');
		model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
		editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		assert.deepEqual(editOperations.length, 0);
	});

});
