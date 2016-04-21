/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import modesUtil = require('vs/editor/test/common/modesUtil');
import Modes = require('vs/editor/common/modes');
import {htmlTokenTypes} from 'vs/languages/html/common/html';
import {MockModeService} from 'vs/editor/test/common/mocks/mockModeService';
import {NULL_THREAD_SERVICE} from 'vs/platform/test/common/nullThreadService';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModeService} from 'vs/editor/common/services/modeService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {MarkdownMode} from 'vs/languages/markdown/common/markdown';
import {MockTokenizingMode} from 'vs/editor/test/common/mocks/mockMode';

class MarkdownMockModeService extends MockModeService {
	isRegisteredMode(mimetypeOrModeId: string): boolean {
		if (mimetypeOrModeId === 'javascript') {
			return true;
		}
		if (mimetypeOrModeId === 'css') {
			return true;
		}
		throw new Error('Not implemented');
	}

	getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): Modes.IMode {
		if (commaSeparatedMimetypesOrCommaSeparatedIds === 'javascript') {
			return new MockTokenizingMode('js', 'mock-js');
		}
		if (commaSeparatedMimetypesOrCommaSeparatedIds === 'css') {
			return new MockTokenizingMode('css', 'mock-css');
		}
		throw new Error('Not implemented');
	}

	getModeIdForLanguageName(alias:string): string {
		if (alias === 'text/javascript') {
			return 'javascript';
		}
		if (alias === 'text/css') {
			return 'css';
		}
		console.log(alias);
		throw new Error('Not implemented');
	}
}

suite('Markdown - tokenization', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;

	(function() {
		let threadService = NULL_THREAD_SERVICE;
		let modeService = new MarkdownMockModeService();
		let services = new ServiceCollection();
		services.set(IThreadService, threadService);
		services.set(IModeService, modeService);
		let inst = new InstantiationService(services);
		threadService.setInstantiationService(inst);

		let mode = new MarkdownMode(
			{ id: 'markdown' },
			inst,
			threadService,
			modeService,
			null,
			null,
			null
		);

		tokenizationSupport = mode.tokenizationSupport;

	})();

	test('', () => {
		modesUtil.executeTests(tokenizationSupport, [
			// HTML and embedded content - bug 16912
			[{
			line: '<b>foo</b>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('b.md') },
				{ startIndex:3, type: '' },
				{ startIndex:6, type: htmlTokenTypes.getTag('b.md') },
				{ startIndex:10, type: 'emphasis.md' }
			]}],

			[{
			line: '</b>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('b.md') },
				{ startIndex:4, type: 'emphasis.md' }
			]}],

			[{
			line: '<script>alert("foo")</script>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('script.md') },
				{ startIndex:8, type: 'mock-js' },
				{ startIndex:20, type: htmlTokenTypes.getTag('script.md') },
				{ startIndex:29, type: 'emphasis.md' }
			]}],

			[{
			line: '<style>div { background: red }</style>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('style.md') },
				{ startIndex:7, type: 'mock-css' },
				{ startIndex:30, type: htmlTokenTypes.getTag('style.md') },
				{ startIndex:38, type: 'emphasis.md' }
			]}]
		]);
	});
});
