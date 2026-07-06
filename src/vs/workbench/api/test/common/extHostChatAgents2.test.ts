/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { IChatAgentRequest } from '../../../contrib/chat/common/participants/chatAgents.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ChatAgentResponseStream } from '../../common/extHostChatAgents2.js';
import { CommandsConverter } from '../../common/extHostCommands.js';
import { IChatAgentProgressShape, IChatProgressDto } from '../../common/extHost.protocol.js';
import { ChatResponseAnchorPart } from '../../common/extHostTypes.js';

suite('ExtHostChatAgents2', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports anchor before resolving it', async function () {
		const sessionDisposables = disposables.add(new DisposableStore());
		const events: string[] = [];
		const progressChunks: IChatProgressDto[] = [];
		let resolvedHandle: string | undefined;
		const proxy: IChatAgentProgressShape = {
			async $handleProgressChunk(_requestId, chunks) {
				events.push('progress');
				for (const chunk of chunks) {
					progressChunks.push(Array.isArray(chunk) ? chunk[0] : chunk);
				}
			},
			$handleAnchorResolve(_requestId, handle) {
				events.push('resolve');
				resolvedHandle = handle;
			}
		};
		const request: IChatAgentRequest = {
			sessionResource: URI.parse('chat-session:/test'),
			requestId: 'requestId',
			agentId: 'agentId',
			message: '',
			variables: { variables: [] },
			location: ChatAgentLocation.Chat
		};
		const stream = new ChatAgentResponseStream(
			{ ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] },
			request,
			proxy,
			undefined as unknown as CommandsConverter,
			sessionDisposables,
			new Map<string, Map<string, DeferredPromise<Record<string, unknown> | undefined>>>(),
			CancellationToken.None
		);
		const part = new ChatResponseAnchorPart(URI.file('/test/file.ts'), 'TestSymbol');
		part.resolve = () => Promise.resolve();

		stream.apiObject.push(part);

		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual(events, ['progress', 'resolve']);
		assert.strictEqual(progressChunks.length, 1);
		const progressChunk = progressChunks[0];
		assert.strictEqual(progressChunk.kind, 'inlineReference');
		assert.ok(progressChunk.resolveId);
		assert.strictEqual(resolvedHandle, progressChunk.resolveId);
	});
});
