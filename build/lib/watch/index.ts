/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as watcher from '@parcel/watcher';
import es from 'event-stream';
import fs from 'fs';
import filter from 'gulp-filter';
import path from 'path';
import { Stream } from 'stream';
import File from 'vinyl';

interface WatchOptions {
	cwd?: string;
	base?: string;
	dot?: boolean;
	readDelay?: number;
	read?: boolean;
}

type EventType = 'change' | 'add' | 'unlink';

function toEventType(type: watcher.EventType): EventType {
	switch (type) {
		case 'create': return 'add';
		case 'update': return 'change';
		case 'delete': return 'unlink';
	}
}

const subscriptionCache: Map<string, { stream: Stream; subscription: Promise<watcher.AsyncSubscription> }> = new Map();

function createWatcher(root: string): Stream {
	const result = es.through();

	const subscription = watcher.subscribe(root, (_err, events) => {
		for (const event of events) {
			const relativePath = path.relative(root, event.path);

			// Filter out .git and out directories early
			if (/^\.git/.test(relativePath) || /(^|[\\/])out($|[\\/])/.test(relativePath)) {
				continue;
			}

			const file = new File({
				path: event.path,
				base: root
			});
			(file as File & { event: EventType }).event = toEventType(event.type);
			result.emit('data', file);
		}
	}, {
		ignore: [
			'**/.git/**',
			'**/out/**'
		]
	});

	// Cleanup on process exit
	const cleanup = () => {
		subscription.then(sub => sub.unsubscribe()).catch(() => { });
	};
	process.once('SIGTERM', cleanup);
	process.once('exit', cleanup);

	return result;
}

export default function watch(pattern: string | string[] | filter.FileFunction, options?: WatchOptions): Stream {
	options = options || {};

	const cwd = path.normalize(options.cwd || process.cwd());
	let cached = subscriptionCache.get(cwd);

	if (!cached) {
		const stream = createWatcher(cwd);
		cached = { stream, subscription: Promise.resolve(null as unknown as watcher.AsyncSubscription) };
		subscriptionCache.set(cwd, cached);
	}

	const rebase = !options.base ? es.through() : es.mapSync((f: File) => {
		f.base = options!.base!;
		return f;
	});

	const readDelay = options.readDelay ?? 0;
	const shouldRead = options.read !== false;

	return cached.stream
		.pipe(filter(['**', '!.git{,/**}'], { dot: options.dot })) // ignore all things git
		.pipe(filter(pattern, { dot: options.dot }))
		.pipe(es.map(function (file: File & { event: EventType }, cb) {
			const processFile = () => {
				if (!shouldRead) {
					return cb(undefined, file);
				}

				fs.stat(file.path, (err, stat) => {
					if (err && err.code === 'ENOENT') { return cb(undefined, file); }
					if (err) { return cb(); }
					if (!stat.isFile()) { return cb(); }

					fs.readFile(file.path, (err, contents) => {
						if (err && err.code === 'ENOENT') { return cb(undefined, file); }
						if (err) { return cb(); }

						file.contents = contents;
						file.stat = stat;
						cb(undefined, file);
					});
				});
			};

			if (readDelay > 0) {
				setTimeout(processFile, readDelay);
			} else {
				processFile();
			}
		}))
		.pipe(rebase);
}
