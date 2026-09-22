/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, type ProcessPromise } from 'zx';

const slowCodesignWarningDelay = 20 * 60 * 1000;

export function printBanner(title: string) {
	title = `${title} (${new Date().toISOString()})`;

	console.log('\n');
	console.log('#'.repeat(75));
	console.log(`# ${title.padEnd(71)} #`);
	console.log('#'.repeat(75));
	console.log('\n');
}

export async function streamProcessOutputAndCheckResult(name: string, promise: ProcessPromise): Promise<void> {
	// The reused stdout pipe can return a previous process's result.
	const [result] = await Promise.all([promise, promise.pipe(process.stdout)]);
	if (result.ok) {
		console.log(`\n${name} completed successfully. Duration: ${result.duration} ms`);
		return;
	}

	throw new Error(`${name} failed: ${result.stderr}`);
}

/** Observes process completion independently of when its buffered output is streamed. */
export function monitorCodesignProcess<T extends PromiseLike<unknown>>(name: string, promise: T, now: () => number = () => performance.now()): T {
	const started = now();
	const timer = setTimeout(() => {
		console.log(`##vso[task.logissue type=warning]${name} has been running for at least 20 minutes. Inspect the ESRP logs for upload, sign/wait, and download timings. Signing will continue.`);
	}, slowCodesignWarningDelay);
	timer.unref();

	const finish = (outcome: 'completed' | 'failed') => {
		clearTimeout(timer);
		console.log(`\n${name} process ${outcome}. Elapsed process time: ${Math.round(now() - started)} ms`);
	};

	void promise.then(() => finish('completed'), () => finish('failed'));
	return promise;
}

export function spawnCodesignProcess(esrpCliDLLPath: string, type: 'sign-windows' | 'sign-windows-appx' | 'sign-pgp' | 'sign-darwin' | 'notarize-darwin', folder: string, glob: string): ProcessPromise {
	return $`node build/azure-pipelines/common/sign.ts ${esrpCliDLLPath} ${type} ${folder} ${glob}`;
}
