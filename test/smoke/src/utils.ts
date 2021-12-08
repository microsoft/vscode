/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import { Suite, Context } from 'mocha';
import { Application, ApplicationOptions } from '../../automation';

export function describeRepeat(n: number, description: string, callback: (this: Suite) => void): void {
	for (let i = 0; i < n; i++) {
		describe(`${description} (iteration ${i})`, callback);
	}
}

export function itRepeat(n: number, description: string, callback: (this: Context) => any): void {
	for (let i = 0; i < n; i++) {
		it(`${description} (iteration ${i})`, callback);
	}
}

export function installCommonTestHandlers(args: minimist.ParsedArgs, optionsTransform?: (opts: ApplicationOptions) => Promise<ApplicationOptions>) {
	installCommonBeforeHandlers(args, optionsTransform);
	installCommonAfterHandlers(args);
}

export function installCommonBeforeHandlers(args: minimist.ParsedArgs, optionsTransform?: (opts: ApplicationOptions) => Promise<ApplicationOptions>) {
	before(async function () {
		this.app = await startApp(args, this.defaultOptions, optionsTransform);
	});

	installCommonBeforeEachHandler();
}

export function installCommonBeforeEachHandler() {
	beforeEach(async function () {
		const testTitle = this.currentTest?.title;
		this.defaultOptions.logger.log('');
		this.defaultOptions.logger.log(`>>> Test start: ${testTitle} <<<`);
		this.defaultOptions.logger.log('');

		await this.app?.startTracing(testTitle);
	});
}

export async function startApp(args: minimist.ParsedArgs, options: ApplicationOptions, optionsTransform?: (opts: ApplicationOptions) => Promise<ApplicationOptions>): Promise<Application> {
	if (optionsTransform) {
		options = await optionsTransform({ ...options });
	}

	const app = new Application({
		...options,
		userDataDir: getRandomUserDataDir(options)
	});

	await app.start();

	return app;
}

export function getRandomUserDataDir(options: ApplicationOptions): string {

	// Pick a random user data dir suffix that is not
	// too long to not run into max path length issues
	// https://github.com/microsoft/vscode/issues/34988
	const userDataPathSuffix = [...Array(8)].map(() => Math.random().toString(36)[3]).join('');

	return options.userDataDir.concat(`-${userDataPathSuffix}`);
}

export function installCommonAfterHandlers(opts: minimist.ParsedArgs, appFn?: () => Application | undefined, joinFn?: () => Promise<unknown>) {
	after(async function () {
		const app: Application = appFn?.() ?? this.app;

		if (this.currentTest?.state === 'failed' && opts.screenshots) {
			const name = this.currentTest!.fullTitle().replace(/[^a-z0-9\-]/ig, '_');
			try {
				await app.captureScreenshot(name);
			} catch (error) {
				// ignore
			}
		}

		if (app) {
			await app.stop();
		}

		if (joinFn) {
			await joinFn();
		}
	});

	afterEach(async function () {
		await this.app?.stopTracing(this.currentTest?.title, this.currentTest?.state === 'failed');
	});
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

export async function retry<T>(task: ITask<Promise<T>>, delay: number, retries: number): Promise<T> {
	let lastError: Error | undefined;

	for (let i = 0; i < retries; i++) {
		try {
			return await task();
		} catch (error) {
			lastError = error;

			await timeout(delay);
		}
	}

	throw lastError;
}
