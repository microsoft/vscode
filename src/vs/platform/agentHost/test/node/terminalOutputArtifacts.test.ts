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

	test('persists complete output under session data and returns a bounded content reference', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const sessionDataService = new class extends mock<ISessionDataService>() {
			override getSessionDataDir(): URI {
				return URI.from({ scheme: Schemas.inMemory, path: '/agentSessionData/session-1' });
			}
		}();
		const output = `FULL-OUTPUT-START\n${'x'.repeat(TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES)}\nFULL-OUTPUT-END`;
		const result = await persistTerminalOutput({
			session: URI.parse('codex:/session-1'),
			toolCallId: 'tool-call-1',
			output,
			exitCode: 0,
		}, sessionDataService, fileService);
		assert.ok(result.fullOutput);
		const content = await fileService.readFile(URI.parse(result.fullOutput.uri));
		assert.deepStrictEqual({
			shouldPersistBelow: shouldPersistTerminalOutput('x'.repeat(TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES)),
			shouldPersistAbove: shouldPersistTerminalOutput('x'.repeat(TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES + 1)),
			preview: result.preview,
			truncated: result.truncated,
			exitCode: result.exitCode,
			sizeHint: result.fullOutput.sizeHint,
			content: content.value.toString(),
		}, {
			shouldPersistBelow: false,
			shouldPersistAbove: true,
			preview: output.slice(0, 500),
			truncated: true,
			exitCode: 0,
			sizeHint: Buffer.byteLength(output),
			content: output,
		});
	});
});
