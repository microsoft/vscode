/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { persistTerminalOutput, shouldPersistTerminalOutput, TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES } from '../../node/shared/terminalOutputArtifacts.js';

suite('TerminalOutputArtifacts', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('persists complete output under session data and returns a bounded terminal result', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		let dataOwner: URI | undefined;
		const sessionDataService = new class extends mock<ISessionDataService>() {
			override getSessionDataDir(owner: URI): URI {
				dataOwner = owner;
				return URI.from({ scheme: Schemas.inMemory, path: '/agentSessionData/session-1' });
			}
		}();
		const output = `FULL-OUTPUT-START\n${'x'.repeat(TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES)}\nFULL-OUTPUT-END`;
		const owner = URI.parse('ahp-chat://codex/session-1/default');
		const retained = await persistTerminalOutput({
			owner,
			toolCallId: 'tool-call-1',
			output,
			exitCode: 0,
		}, sessionDataService, fileService);
		const content = await fileService.readFile(retained.artifact);
		assert.match(retained.artifact.path, /^\/agentSessionData\/session-1\/terminal-output\/[a-z0-9]+\.txt$/);
		assert.deepStrictEqual({
			shouldPersistBelow: shouldPersistTerminalOutput('x'.repeat(TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES)),
			shouldPersistAbove: shouldPersistTerminalOutput('x'.repeat(TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES + 1)),
			preview: retained.result.preview,
			truncated: retained.result.truncated,
			exitCode: retained.result.exitCode,
			content: content.value.toString(),
			dataOwner: dataOwner?.toString(),
		}, {
			shouldPersistBelow: false,
			shouldPersistAbove: true,
			preview: output.slice(0, 500),
			truncated: true,
			exitCode: 0,
			content: output,
			dataOwner: owner.toString(),
		});
	});
});
