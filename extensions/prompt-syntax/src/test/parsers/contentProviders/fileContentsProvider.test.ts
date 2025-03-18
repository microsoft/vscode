/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workspace, Uri } from 'vscode';

import { wait } from '../../../utils/wait';
import { assertDefined } from '../../../utils/asserts';
import { Line } from '../../../codecs/linesCodec/tokens';
import { VSCodeFileSystem } from '../../../utils/vscodeFilesystem';
import { VSBuffer, type ReadableStream } from '../../../utils/vscode';
import { LinesDecoder } from '../../../codecs/linesCodec/linesDecoder';
import { FileContentsProvider } from '../../../parsers/contentProviders/fileContentsProvider';

suite('FileContentsProvider', function () {
	test('provides contents of a file', async () => {
		const filesystem = new VSCodeFileSystem();

		const { workspaceFolders } = workspace;
		assertDefined(
			workspaceFolders,
			'No workspace folders found.',
		);

		const firstFolder = workspaceFolders[0];
		assertDefined(
			firstFolder,
			'Workspace must have at least 1 folder.',
		);

		const fileName = `file-contents-provider-unit-test.prompt.md`;
		const fileUri = Uri.joinPath(firstFolder.uri, fileName);

		try {
			if (await filesystem.stat(fileUri)) {
				await filesystem.delete(fileUri);
			}
		} catch (error) {
			// ignore the error - most likely, the file does not exist
		}

		await filesystem.writeFile(fileUri, VSBuffer.fromString('Hello, world!').buffer);

		const contentsProvider = new FileContentsProvider(fileUri, filesystem);

		let streamOrError: ReadableStream<VSBuffer> | Error | undefined;
		contentsProvider.onContentChanged((event) => {
			streamOrError = event;
		});
		contentsProvider.start();

		await wait(25);

		assertDefined(
			streamOrError,
			'The `streamOrError` must be defined.',
		);

		assert(
			!(streamOrError instanceof Error),
			`Provider must produce a byte stream, got '${streamOrError}'.`,
		);

		const decoder = new LinesDecoder(streamOrError);
		const receivedLines = await decoder.consumeAll();
		assert.strictEqual(
			receivedLines.length,
			1,
			'Must read the correct number of lines from the provider.',
		);

		const expectedLine = new Line(1, 'Hello, world!');
		const receivedLine = receivedLines[0];
		assert(
			receivedLine.equals(expectedLine),
			`Expected to receive '${expectedLine}', got '${receivedLine}'.`,
		);
	});
});
