/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, join } from 'path';
import { Application, ApplicationOptions } from '../../automation';

let logsCounter = 1;
let crashCounter = 1;

export function parseVersion(version: string): { major: number; minor: number; patch: number } {
	const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version)!;
	return { major: parseInt(major), minor: parseInt(minor), patch: parseInt(patch) };
}

export function suiteLogsPath(options: ApplicationOptions, suiteName: string): string {
	return join(dirname(options.logsPath), `${logsCounter++}_suite_${suiteName.replace(/[^a-z0-9\-]/ig, '_')}`);
}

export function suiteCrashPath(options: ApplicationOptions, suiteName: string): string {
	return join(dirname(options.crashesPath), `${crashCounter++}_suite_${suiteName.replace(/[^a-z0-9\-]/ig, '_')}`);
}

export function getRandomUserDataDir(baseUserDataDir: string): string {

	// Pick a random user data dir suffix that is not
	// too long to not run into max path length issues
	// https://github.com/microsoft/vscode/issues/34988
	const userDataPathSuffix = [...Array(8)].map(() => Math.random().toString(36)[3]).join('');

	return baseUserDataDir.concat(`-${userDataPathSuffix}`);
}

export function createApp(options: ApplicationOptions, optionsTransform?: (opts: ApplicationOptions) => ApplicationOptions): Application {
	if (optionsTransform) {
		options = optionsTransform({ ...options });
	}

	const config = options.userDataDir
		? { ...options, userDataDir: getRandomUserDataDir(options.userDataDir) }
		: options;
	const app = new Application(config);
	return app;
}

export function timeout(i: number) {
	return new Promise<void>(resolve => {
		setTimeout(() => {
			resolve();
		}, i);
	});
}

export interface ITask<T> {
	(): T;
}

export async function retry<T>(task: ITask<Promise<T>>, delay: number, retries: number, onBeforeRetry?: () => Promise<unknown>): Promise<T> {
	let lastError: Error | undefined;

	for (let i = 0; i < retries; i++) {
		try {
			if (i > 0 && typeof onBeforeRetry === 'function') {
				try {
					await onBeforeRetry();
				} catch (error) {
					console.warn(`onBeforeRetry failed with: ${error}`);
				}
			}

			return await task();
		} catch (error) {
			lastError = error as Error;

			await timeout(delay);
		}
	}

	throw lastError;
}
