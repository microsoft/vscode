/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AhpErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { TerminalClaimKind, TerminalLifecycleStatus, type TerminalState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, ToolCallCompletedState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { FileOperationResult, FileSystemProviderCapabilities, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { completedToolCallToSerialized, finalizeToolInvocation, toolCallStateToInvocation } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { createTerminalOutputTestFixture } from '../../common/widget/terminalFullOutputTestUtils.js';

suite('Terminal full output - adapter to resource', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('copilot:/full-output-session');
	const artifactB = URI.file('/shared/artifact-b.txt');
	const terminalResource = URI.parse('agenthost-terminal:/command-a');
	const fullText = `BEGIN\n${'x'.repeat(4096)}\nMIDDLE\n${'y'.repeat(4096)}\nEND`;

	for (const authority of ['local', 'remote-host']) {
		for (const restored of [false, true]) {
			test(`${authority} ${restored ? 'restored' : 'live'} output subscribes to the terminal URI, never prose artifact B`, async () => {
				const completed: ToolCallCompletedState = {
					status: ToolCallStatus.Completed,
					toolCallId: 'command-a',
					toolName: 'bash',
					displayName: 'Run command',
					invocationMessage: 'Running command',
					pastTenseMessage: 'Ran command',
					toolInput: 'build',
					confirmed: ToolCallConfirmationReason.NotNeeded,
					success: true,
					content: [
						{ type: ToolResultContentType.Text, text: `Saved to: ${artifactB.path}` },
						{
							type: ToolResultContentType.Terminal,
							resource: terminalResource.toString(),
							title: 'Bash',
							isPty: false,
							result: {
								exitCode: 0,
								preview: 'BEGIN\n',
								truncated: true,
							},
						},
					],
				};
				const live = toolCallStateToInvocation(completed, undefined, sessionResource, authority);
				finalizeToolInvocation(live, completed, sessionResource, authority);
				const serialized: IChatToolInvocationSerialized = JSON.parse(JSON.stringify(completedToolCallToSerialized(completed, undefined, sessionResource, authority)));
				const invocation = restored ? serialized : live;
				let unavailable = false;
				const fixture = createTerminalOutputTestFixture(store, sessionResource, invocation, authority, async () => {
					if (unavailable) {
						throw new ProtocolError(AhpErrorCodes.NotFound, 'Artifact no longer exists');
					}
					return {
						title: 'Bash',
						content: [{ type: 'unclassified', value: fullText }],
						lifecycle: { status: TerminalLifecycleStatus.Exited, exitCode: 0 },
						claim: { kind: TerminalClaimKind.Session, session: sessionResource.toString(), chat: sessionResource.toString(), toolCallId: 'command-a' },
						isPty: false,
					} satisfies TerminalState;
				});
				const data = invocation.toolSpecificData;
				assert.ok(data?.kind === 'terminal' && hasKey(data, { commandLine: true }));
				const beforeOpen = fixture.subscriptions.length;
				const text = VSBuffer.wrap(await fixture.provider.readFile(fixture.resource)).toString();
				unavailable = true;
				await assert.rejects(() => fixture.provider.readFile(fixture.resource), error => error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND);
				assert.deepStrictEqual({
					preview: data.terminalCommandOutput?.text,
					resourceName: fixture.resource.path.split('/').at(-1),
					beforeOpen,
					text,
					readonly: fixture.fileService.hasCapability(fixture.resource, FileSystemProviderCapabilities.Readonly),
					subscriptions: fixture.subscriptions.map(uri => uri.toString()),
				}, {
					preview: 'BEGIN\r\n',
					resourceName: fixture.resource.path.split('/').at(-1),
					beforeOpen: 0,
					text: fullText,
					readonly: true,
					subscriptions: [terminalResource.toString(), terminalResource.toString()],
				});
				assert.match(fixture.resource.path.split('/').at(-1) ?? '', /^terminal-output-command-a\.txt$/);
			});
		}
	}
});
