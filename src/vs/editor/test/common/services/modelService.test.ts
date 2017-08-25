/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import URI from 'vs/base/common/uri';
import * as platform from 'vs/base/common/platform';
import { DefaultEndOfLine } from 'vs/editor/common/editorCommon';

suite('ModelService', () => {
	let modelService: ModelServiceImpl;

	setup(() => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'eol': '\n' });
		configService.setUserConfiguration('files', { 'eol': '\r\n' }, URI.file(platform.isWindows ? 'c:\\myroot' : '/myroot'));

		modelService = new ModelServiceImpl(null, configService);
	});

	teardown(() => {
		modelService.dispose();
	});

	test('EOL setting respected depending on root', () => {
		const model1 = modelService.createModel('farboo', null, null);
		const model2 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\myroot\\myfile.txt' : '/myroot/myfile.txt'));
		const model3 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\other\\myfile.txt' : '/other/myfile.txt'));

		assert.equal(model1.getOptions().defaultEOL, DefaultEndOfLine.LF);
		assert.equal(model2.getOptions().defaultEOL, DefaultEndOfLine.CRLF);
		assert.equal(model3.getOptions().defaultEOL, DefaultEndOfLine.LF);
	});
});