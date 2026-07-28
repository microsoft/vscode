/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mobx from 'mobx';
import { InterceptedRequest } from '../../shared/sharedTypes';

export const REPO_ROOT: string = (globalThis as any).projectRoot;

export const monacoModule: {
	value: typeof import('monaco-editor');
} = {
	value: null! // @ulugbekna: this is initialized on workbench startup and must be non-null by the time it's used
};

export function genericEquals(one: any, other: any): boolean {
	if (one === other) {
		return true;
	}
	if (one === null || one === undefined || other === null || other === undefined) {
		return false;
	}
	if (typeof one !== typeof other) {
		return false;
	}
	if (typeof one !== 'object') {
		return false;
	}
	if ((Array.isArray(one)) !== (Array.isArray(other))) {
		return false;
	}

	let i: number;
	let key: string;

	if (Array.isArray(one)) {
		if (one.length !== other.length) {
			return false;
		}
		for (i = 0; i < one.length; i++) {
			if (!genericEquals(one[i], other[i])) {
				return false;
			}
		}
	} else {
		const oneKeys: string[] = [];

		for (key in one) {
			oneKeys.push(key);
		}
		oneKeys.sort();
		const otherKeys: string[] = [];
		for (key in other) {
			otherKeys.push(key);
		}
		otherKeys.sort();
		if (!genericEquals(oneKeys, otherKeys)) {
			return false;
		}
		for (i = 0; i < oneKeys.length; i++) {
			if (!genericEquals(one[oneKeys[i]], other[oneKeys[i]])) {
				return false;
			}
		}
	}
	return true;
}

let pendingRunInAction: (() => void)[] = [];

/**
 * Schedules a function to be run inside a MobX action.
 * This will batch multiple callers in a single runInAction MobX call.
 *
 * @param fn - The function to be scheduled.
 */
export function scheduleRunInAction(fn: () => void) {
	pendingRunInAction.push(fn);
	if (pendingRunInAction.length === 1) {
		process.nextTick(() => {
			const updates = pendingRunInAction;
			pendingRunInAction = [];
			runInAction(updates);
		});
	}
}

function runInAction(fns: (() => void)[]) {
	mobx.runInAction(() => {
		for (const fn of fns) {
			try {
				fn();
			} catch (err) {
				console.error(err);
			}
		}
	});
}

export class ObservablePromise<T> {

	public static resolve<T>(value: T): ObservablePromise<T> {
		return new ObservablePromise(Promise.resolve(value), value);
	}

	public readonly promise: Promise<T>;

	@mobx.observable.ref
	public error: unknown;

	@mobx.observable.ref
	public value: T;

	@mobx.observable.ref
	public resolved: boolean;

	constructor(promise: Promise<T>, defaultValue: T) {
		this.promise = promise;
		this.error = null;
		this.value = defaultValue;
		this.resolved = false;

		mobx.makeObservable(this);

		this.promise.then(
			(value: T) => {
				scheduleRunInAction(() => {
					this.value = value;
					this.resolved = true;
				});
			},
			(error: unknown) => {
				scheduleRunInAction(() => {
					console.error(error);
					this.error = error;
					this.resolved = true;
				});
			}
		);
	}
}

export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath);
		return true;
	} catch (_) {
		return false;
	}
}

export function isToolCall(request: InterceptedRequest) {
	return Boolean(request.response.copilotFunctionCalls?.length);
}
