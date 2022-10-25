/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FileAccess } from 'vs/base/common/network';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { GettingStartedDetailsRenderer } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer';
import { convertInternalMediaPathToFileURI } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService';
import { TestFileService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestExtensionService } from 'vs/workbench/test/common/workbenchTestServices';


suite('Getting Started Markdown Renderer', () => {
	test('renders theme picker markdown with images', async () => {
		const fileService = new TestFileService();
		const languageService = new LanguageService();
		const renderer = new GettingStartedDetailsRenderer(fileService, new TestNotificationService(), new TestExtensionService(), languageService);
		const mdPath = convertInternalMediaPathToFileURI('theme_picker').with({ query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker' }) });
		const mdBase = FileAccess.asFileUri('vs/workbench/contrib/welcomeGettingStarted/common/media/', require);
		const rendered = await renderer.renderMarkdown(mdPath, mdBase);
		const imageSrcs = [...rendered.matchAll(/img src="[^"]*"/g)].map(match => match[0]);
		for (const src of imageSrcs) {
			const targetSrcFormat = /^img src="https:\/\/file\+.vscode-resource.vscode-cdn.net\/.*\/vs\/workbench\/contrib\/welcomeGettingStarted\/common\/media\/.*.png"$/;
			assert(targetSrcFormat.test(src), `${src} didnt match regex`);
		}
		languageService.dispose();
	});
});
