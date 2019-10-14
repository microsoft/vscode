/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'nsfw' {
	interface NsfwWatcher {
		start(): any;
		stop(): any;
	}

	interface NsfwWatchingPromise {
		then(): void;
	}

	interface NsfwStartWatchingPromise {
		then(fn: (watcher: NsfwWatcher) => void): NsfwWatchingPromise;
	}

	interface NsfwEvent {
		action: number;
		directory: string;
		file?: string;
		newFile?: string;
		newDirectory?: string;
		oldFile?: string;
	}

	interface NsfwFunction {
		(dir: string, eventHandler: (events: NsfwEvent[]) => void, options?: any): NsfwStartWatchingPromise;
		actions: {
			CREATED: number;
			DELETED: number;
			MODIFIED: number;
			RENAMED: number;
		}
	}

	var nsfw: NsfwFunction;
	export = nsfw;
}
