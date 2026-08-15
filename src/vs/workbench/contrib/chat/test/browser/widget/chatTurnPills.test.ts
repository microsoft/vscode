/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../../platform/opener/common/opener.js';
import { BrowserViewEditorId, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { openChatTurnFile, previewKind } from '../../../browser/widget/chatTurnPills.js';
import { ChatConfiguration } from '../../../common/constants.js';

/** A browser view service that can render the given resources, mimicking its trusted-root rule. */
function browserViewService(...renderable: URI[]): IBrowserViewWorkbenchService {
	return new class extends mock<IBrowserViewWorkbenchService>() {
		override canRenderFile(resource: URI): boolean {
			return renderable.some(candidate => isEqual(candidate, resource));
		}
	}();
}

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
		const renderable = URI.file('/workspace/index.html');
		const renderableUpperCase = URI.file('/workspace/index.HTM');
		const untrusted = URI.file('/outside/untrusted.html');
		const browserView = browserViewService(renderable, renderableUpperCase);

		assert.deepStrictEqual([
			previewKind(URI.file('/workspace/README.md'), browserView),
			previewKind(renderable, browserView),
			previewKind(renderableUpperCase, browserView),
			previewKind(untrusted, browserView),
			previewKind(URI.parse('vscode-remote://authority/workspace/index.html'), browserView),
			previewKind(URI.file('/workspace/index.ts'), browserView),
		], [
			'markdown',
			'html',
			'html',
			undefined,
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

	test('prefers a configured chat editor association over the Integrated Browser', async () => {
		const resource = URI.file('/workspace/index.html');
		let opened: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined } | undefined;
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: string | URI, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened = { resource: resource.toString(), options };
				return true;
			}
		};
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.EditorAssociations]: {
				'*.html': 'default',
			},
		});

		await openChatTurnFile({ uri: resource, kind: 'html', created: true }, openerService, configurationService);

		assert.deepStrictEqual(opened, {
			resource: resource.toString(),
			options: {
				fromUserGesture: true,
				editorOptions: {
					override: 'default',
				},
			},
		});
	});
});
