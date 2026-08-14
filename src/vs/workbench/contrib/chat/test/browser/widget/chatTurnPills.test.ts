/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { BrowserViewEditorId } from '../../../../../../platform/browserView/common/browserView.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../../platform/opener/common/opener.js';
import { openChatTurnFile, previewKind } from '../../../browser/widget/chatTurnPills.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('ChatTurnPills', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens a markdown resource with its configured chat editor association', async () => {
		const resource = URI.file('/workspace/README.md');
		let opened: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined } | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: string | URI, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened = { resource: resource.toString(), options };
				return true;
			}
		};
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorAssociations]: {
				'*.md': 'vscode.markdown.editor',
			},
		});

		await openChatTurnFile({ uri: resource, kind: 'markdown', created: true }, openerService, configurationService);

		assert.deepStrictEqual(opened, {
			resource: resource.toString(),
			options: {
				fromUserGesture: true,
				editorOptions: {
					override: 'vscode.markdown.editor',
				},
			},
		});
	});

	test('classifies supported preview resources', () => {
		assert.deepStrictEqual([
			previewKind(URI.file('/workspace/README.md')),
			previewKind(URI.file('/workspace/index.html')),
			previewKind(URI.file('/workspace/index.HTM')),
			previewKind(URI.parse('vscode-remote://authority/workspace/index.html')),
			previewKind(URI.file('/workspace/index.ts')),
		], [
			'markdown',
			'html',
			'html',
			undefined,
			undefined,
		]);
	});

	test('opens an HTML resource in the Integrated Browser', async () => {
		const resource = URI.file('/workspace/index.html');
		let opened: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined } | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: string | URI, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened = { resource: resource.toString(), options };
				return true;
			}
		};

		await openChatTurnFile({ uri: resource, kind: 'html', created: true }, openerService, new TestConfigurationService());

		assert.deepStrictEqual(opened, {
			resource: resource.toString(),
			options: {
				fromUserGesture: true,
				editorOptions: {
					override: BrowserViewEditorId,
				},
			},
		});
	});
});
