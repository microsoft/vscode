/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Duplex, Readable, Transform, type Stream } from 'stream';
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

export function mapStream<I, O>(map: (item: I, done: (err?: Error | null, result?: O) => void) => void): Duplex {
	return Duplex.from(async function* (source: AsyncIterable<I>) {
		const results = Readable.from(source).map(item => new Promise<O | undefined>((resolve, reject) => {
			map(item, (err, result) => err ? reject(err) : resolve(result));
		}), { concurrency: 8 });
		for await (const result of results) {
			if (result !== undefined) {
				yield result;
			}
		}
	});
}

export function mapStreamSync<I, O>(map: (item: I) => O): Transform {
	return new Transform({
		objectMode: true,
		transform(item: I, _encoding, done) {
			try {
				done(undefined, map(item));
			} catch (err) {
				done(err);
			}
		}
	});
}
