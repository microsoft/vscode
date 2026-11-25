/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'merge-stream' {
	import type { PassThrough, Stream } from 'stream';

	export default function mergeStream(...inputs: (Stream | Stream[])[]): PassThrough & { isEmpty(): boolean };
}
