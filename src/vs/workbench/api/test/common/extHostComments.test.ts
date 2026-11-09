/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainContext, MainThreadCommentsShape } from '../../common/extHost.protocol.js';
import { ArgumentProcessor, ExtHostCommands } from '../../common/extHostCommands.js';
import { createExtHostComments } from '../../common/extHostComments.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { TestRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostComments', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('disposed comment controllers are removed from extension host bookkeeping', async () => {
		let controllerHandle = -1;
		let createdThreadCount = 0;
		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(MainContext.MainThreadComments, new class extends mock<MainThreadCommentsShape>() {
			override $registerCommentController(handle: number): void {
				controllerHandle = handle;
			}
			override $unregisterCommentController(): void { }
			override $createCommentThread(): undefined {
				createdThreadCount++;
				return undefined;
			}
			override $deleteCommentThread(): void { }
		});

		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(_processor: ArgumentProcessor): void { }
		};
		const extension = {
			...nullExtensionDescription,
			identifier: new ExtensionIdentifier('test.comments'),
			name: 'comments',
			displayName: 'Comments',
			extensionLocation: URI.file('/extension')
		};
		const extHostComments = createExtHostComments(rpcProtocol, commands, {} as ExtHostDocuments);
		const controller = extHostComments.createCommentController(extension, 'comments', 'Comments');

		controller.dispose();
		await extHostComments.$createCommentThreadTemplate(controllerHandle, URI.file('/file'), undefined);

		assert.strictEqual(createdThreadCount, 0);
	});
});
