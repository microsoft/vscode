/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Writable } from 'stream';
import { finished } from 'node:stream/promises';
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
	promise.quiet();
	const [completion, ...streams] = await Promise.allSettled([
		promise,
		streamProcessOutput(promise, 'stdout', process.stdout),
		streamProcessOutput(promise, 'stderr', process.stderr),
	]);
	for (const stream of streams) {
		if (stream.status === 'rejected') {
			throw stream.reason;
		}
	}
	if (completion.status === 'rejected') {
		throw completion.reason;
	}
	const result = completion.value;
	if (result.ok) {
		console.log(`\n${name} completed successfully. Duration: ${result.duration} ms`);
		return;
	}

	throw new Error(`${name} failed: ${result.stderr}`);
}

async function streamProcessOutput(promise: ProcessPromise, source: 'stdout' | 'stderr', destination: Writable): Promise<void> {
	let hasOutput = false;
	const output = new Writable({
		write(chunk: Buffer, _encoding, callback) {
			hasOutput ||= chunk.length > 0;
			destination.write(chunk, callback);
		},
		final(callback) {
			// A running zx process only replays buffered output on its next data event.
			// If no more data arrived, replay that channel after the process settles.
			const replay = () => {
				const buffered = !hasOutput ? promise.output?.[source] : undefined;
				if (buffered) {
					destination.write(buffered, callback);
				} else {
					callback();
				}
			};
			void promise.then(replay, replay);
		}
	});
	const onError = (error: Error) => output.destroy(error);
	destination.on('error', onError);
	try {
		promise.pipe[source](output);
		await finished(output, { cleanup: true });
	} finally {
		destination.off('error', onError);
		promise.unpipe(output);
		output.destroy();
	}
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
	const promise = $({ quiet: true })`node build/azure-pipelines/common/sign.ts ${esrpCliDLLPath} ${type} ${folder} ${glob}`;
	// Parallel callers stream in order; observe early failures without replacing the original rejection.
	void promise.catch(() => { });
	return promise;
}
