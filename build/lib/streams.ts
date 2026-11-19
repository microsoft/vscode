/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Transform, type Stream } from 'stream';
import createThrough from 'through';
import mergeStream from 'merge-stream';
import type File from 'vinyl';

export type ThroughStream = createThrough.ThroughStream;

// The gulp callbacks use through's stream as their receiver, including during asynchronous flushes.
export const through: <T = File>(write?: (this: ThroughStream, item: T) => void, end?: (this: ThroughStream) => void) => ThroughStream = createThrough;

/** Some gulp sources are legacy streams and some consumers only listen for `end`. */
export function merge(...inputs: (Stream | Stream[])[]): Transform {
	const output = mergeStream(...inputs);
	if (output.isEmpty()) {
		output.end();
	}
	return output.resume();
}

export function mapStream<I, O>(map: (item: I, done: (err?: Error | null, result?: O) => void) => void): Transform {
	return new Transform({
		objectMode: true,
		transform(item: I, _encoding, done) {
			try {
				map(item, done);
			} catch (err) {
				done(err);
			}
		}
	});
}

export function mapStreamSync<I, O>(map: (item: I) => O): Transform {
	return mapStream<I, O>((item, done) => done(undefined, map(item)));
}
