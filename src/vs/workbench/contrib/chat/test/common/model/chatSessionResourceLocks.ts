/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatSessionResourceLocks, IChatResourceLockRunner } from '../../../common/model/chatSessionResourceLocks.js';
import { ChatSessionResources } from '../../../common/model/chatSessionResources.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';

export function createTestChatSessionResources(files: IFileService): ChatSessionResources {
	return new ChatSessionResources({
		beforeWrite: async () => { },
		onUnused: () => { },
		synchronization: () => [],
	}, files, new NullLogService(), createTestChatSessionResourceLocks());
}

/** A shared test runner; use the same instance for stores backed by the same test filesystem. */
export function createTestChatSessionResourceLocks(): ChatSessionResourceLocks {
	type State = { readers: number; writer: boolean; queue: { mode: 'shared' | 'exclusive'; enter: () => void }[] };
	const states = new Map<string, State>();
	const drain = (key: string, state: State) => {
		while (!state.writer && state.queue.length) {
			const next = state.queue[0];
			if (next.mode === 'exclusive' && state.readers) {
				return;
			}
			state.queue.shift();
			if (next.mode === 'exclusive') {
				state.writer = true;
			} else {
				state.readers++;
			}
			next.enter();
		}
		if (!state.writer && !state.readers && !state.queue.length) {
			states.delete(key);
		}
	};
	const request: IChatResourceLockRunner = (key, options, task) => {
		let state = states.get(key);
		if (!state) {
			state = { readers: 0, writer: false, queue: [] };
			states.set(key, state);
		}
		const current = state;
		if (options.ifAvailable && (current.writer || current.queue.length || options.mode === 'exclusive' && current.readers)) {
			return task(false);
		}
		return new Promise((resolve, reject) => {
			const release = () => {
				if (options.mode === 'exclusive') {
					current.writer = false;
				} else {
					current.readers--;
				}
				drain(key, current);
			};
			current.queue.push({
				mode: options.mode,
				enter: () => {
					void Promise.resolve().then(() => task(true)).then(result => {
						release();
						resolve(result);
					}, error => {
						release();
						reject(error);
					});
				},
			});
			drain(key, current);
		});
	};
	return new ChatSessionResourceLocks(request);
}
