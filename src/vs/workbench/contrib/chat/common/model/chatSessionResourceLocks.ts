/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export interface IChatResourceLease extends IDisposable {
	readonly whenReleased: Promise<void>;
}

export interface IChatResourceLockRunner {
	<T>(key: string, options: { mode: 'exclusive' | 'shared'; ifAvailable?: boolean }, task: (available: boolean) => Promise<T>): Promise<T>;
}

export const IChatSessionResourceLocks = createDecorator<IChatSessionResourceLocks>('chatSessionResourceLocks');

export interface IChatSessionResourceLocks {
	readonly _serviceBrand: undefined;
	readonly available: boolean;
	exclusive<T>(key: string, task: () => Promise<T>): Promise<T>;
	tryExclusive(key: string, task: () => Promise<void>): Promise<boolean>;
	shared(key: string): Promise<IChatResourceLease>;
}

export function chatResourceLockKey(kind: 'mutation' | 'blob', resource: URI): string {
	return `vscode-chat-storage:${kind}:${extUriBiasedIgnorePathCase.getComparisonKey(resource)}`;
}

/** The runner must coordinate across every context sharing the backing storage. */
export class ChatSessionResourceLocks implements IChatSessionResourceLocks {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly request: IChatResourceLockRunner, readonly available = true) { }

	exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
		return this.request(key, { mode: 'exclusive' }, async available => {
			if (!available) {
				throw new BugIndicatingError('Blocking chat storage lock was not granted');
			}
			return task();
		});
	}

	tryExclusive(key: string, task: () => Promise<void>): Promise<boolean> {
		return this.request(key, { mode: 'exclusive', ifAvailable: true }, async available => {
			if (!available) {
				return false;
			}
			await task();
			return true;
		});
	}

	async shared(key: string): Promise<IChatResourceLease> {
		const acquired = new DeferredPromise<IChatResourceLease>();
		const release = new DeferredPromise<void>();
		const released = new DeferredPromise<void>();
		const lifetime = toDisposable(() => release.complete());
		void this.request(key, { mode: 'shared' }, async available => {
			if (!available) {
				throw new BugIndicatingError('Shared chat storage lock was not granted');
			}
			acquired.complete(Object.assign(lifetime, { whenReleased: released.p }));
			await release.p;
		}).then(() => released.complete(), error => {
			lifetime.dispose();
			acquired.error(error);
			released.complete();
		});
		return acquired.p;
	}
}
