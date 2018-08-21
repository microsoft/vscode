/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'yazl' {
	import * as stream from 'stream';

	class ZipFile {
		outputStream: stream.Stream;
		addBuffer(buffer: Buffer, path: string);
		addFile(localPath: string, path: string);
		end();
	}
}