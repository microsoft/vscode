/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as arrays from 'vs/base/common/arrays';
import * as arraysFind from 'vs/base/common/arraysFind';
import * as fs from 'fs';
import * as path from 'path';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { getReindentEditOperations } from 'vs/editor/contrib/indentation/common/indentation';
import { createModelServices, instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { LanguageConfigurationFileHandler } from 'vs/workbench/contrib/codeEditor/common/languageConfigurationExtensionPoint';
import { FileAccess } from 'vs/base/common/network';

suite('Manual Auto Indentation Evaluation', () => {
	const languageId = 'ts-test';
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageConfigurationService: ILanguageConfigurationService;
	let input: string;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createModelServices(disposables);
		languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		const fsPath = FileAccess.asFileUri('extensions/typescript-basics/language-configuration.json').fsPath;
		input = fs.readFileSync(fsPath).toString();
		const config = LanguageConfigurationFileHandler.extractValidConfig(languageId, JSON.parse(input));
		disposables.add(languageConfigurationService.register(languageId, config));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Test', () => {
		console.log('input : ', input);
	});

	test.skip('TypeScript', () => {
		// TODO: use fs to read a test file
		const fileContents = "class X {\nconstructor() {\nconsole.log('Hello, world!');\n}\n}";
		const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, {/*tabsize*/ }));
		const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
		model.applyEdits(editOperations);

		console.log(
			editOperations
		);
	});

	// unit tests...

});
