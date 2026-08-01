/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../../platform/opener/common/opener.js';
import { createTurnChangesPreviewActions, openChatTurnFile } from '../../../browser/widget/chatTurnPills.js';
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

	suite('createTurnChangesPreviewActions (#328520)', () => {
		const openerService = new class extends mock<IOpenerService>() {
			override async open(): Promise<boolean> {
				return true;
			}
		};
		const configurationService = new TestConfigurationService();

		test('returns an icon-only Preview action for markdown files', () => {
			const modified = URI.file('/workspace/docs/AI_CUSTOMIZATIONS.md');
			const actions = createTurnChangesPreviewActions(modified, URI.file('/workspace/other.md'), openerService, configurationService);

			assert.strictEqual(actions.length, 1);
			assert.strictEqual(actions[0].id, 'chat.turnChanges.previewFile');
			assert.strictEqual(actions[0].label, 'Preview');
			assert.ok(actions[0].class?.includes('codicon-open-preview'), `expected open-preview icon class, got: ${actions[0].class}`);
		});

		test('returns no actions for non-previewable files', () => {
			const modified = URI.file('/workspace/src/service.ts');
			const actions = createTurnChangesPreviewActions(modified, modified, openerService, configurationService);
			assert.deepStrictEqual(actions, []);
		});

		test('run opens the markdown file via chat editor associations', async () => {
			const resource = URI.file('/workspace/README.md');
			let opened: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined } | undefined;
			const trackingOpener = new class extends mock<IOpenerService>() {
				override async open(resource: string | URI, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
					opened = { resource: resource.toString(), options };
					return true;
				}
			};
			const config = new TestConfigurationService({
				[ChatConfiguration.EditorAssociations]: {
					'*.md': 'vscode.markdown.editor',
				},
			});

			const actions = createTurnChangesPreviewActions(resource, resource, trackingOpener, config);
			await actions[0].run();

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
	});
});
