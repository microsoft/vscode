/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Readable } from 'stream';
import { setImmediate } from 'node:timers/promises';
import { $, ProcessOutput, ProcessPromise, within } from 'zx';
import { spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../../azure-pipelines/common/codesign.ts';

const outputSize = 256 * 1024;

async function earlyFailure() {
	const directory = process.argv[3];
	const failedIndex = Number(process.argv[4]);
	assert.ok(directory && (failedIndex === 1 || failedIndex === 2));
	const signingDirectory = join(directory, 'build', 'azure-pipelines', 'common');
	mkdirSync(signingDirectory, { recursive: true });
	writeFileSync(join(signingDirectory, 'sign.ts'), `
		const index = Number(process.argv[2]);
		process.stdin.resume();
		process.stdin.once('end', () => {
			process.stdout.write(String.fromCharCode(65 + index).repeat(${outputSize}) + '\\n');
			process.stderr.write(String.fromCharCode(97 + index).repeat(${outputSize}) + '\\n');
			process.exitCode = process.argv[4] === 'fail' ? 17 : 0;
		});
	`);

	await within(async () => {
		$.cwd = directory;
		const signers = Array.from({ length: failedIndex + 1 }, (_, index) =>
			spawnCodesignProcess(String(index), 'sign-windows', index === failedIndex ? 'fail' : 'pass', '*'));
		assert.ok(signers.every(signer => signer instanceof ProcessPromise));
		const first = streamProcessOutputAndCheckResult('signer 1', signers[0]);
		try {
			const failing = signers[failedIndex];
			assert.ok(failing.child);
			const closed = once(failing.child, 'close');
			failing.stdin.end();
			await closed;
			// Keep the first signer running across Node's unhandled-rejection check.
			await setImmediate();
			assert.deepStrictEqual([signers[0].stage, failing.stage], ['running', 'rejected']);

			signers[0].stdin.end();
			await first;
			for (let index = 1; index < signers.length; index++) {
				const signer = signers[index];
				if (index === failedIndex) {
					const isOriginalFailure = (error: Error) => error === signer.output && error instanceof ProcessOutput && error.exitCode === 17;
					await assert.rejects(streamProcessOutputAndCheckResult(`signer ${index + 1}`, signer), isOriginalFailure);
					await assert.rejects(signer, isOriginalFailure);
				} else {
					signer.stdin.end();
					await streamProcessOutputAndCheckResult(`signer ${index + 1}`, signer);
				}
			}
		} finally {
			for (const signer of signers) {
				signer.stdin.end();
			}
			await Promise.allSettled([first, ...signers]);
		}
	});
}

function waitForOutput(stream: Readable, size: number): Promise<void> {
	return new Promise(resolve => {
		let bytes = 0;
		const onData = (chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes >= size) {
				stream.off('data', onData);
				resolve();
			}
		};
		stream.on('data', onData);
	});
}

async function main() {
	const scenario = process.argv[2];
	if (scenario === 'early-failure') {
		await earlyFailure();
		return;
	}
	assert.ok(scenario === 'completed' || scenario === 'buffered' || scenario === 'live' || scenario === 'mixed' || scenario === 'failure' || scenario === 'live-failure');
	const fails = scenario === 'failure' || scenario === 'live-failure';
	const errorListeners = [process.stdout.listenerCount('error'), process.stderr.listenerCount('error')];
	const first = $({ quiet: true })`${process.execPath} -e ${`
		process.stdout.write('A'.repeat(${outputSize}) + '\\n');
		process.stderr.write('a'.repeat(${outputSize}) + '\\n');
	`}`;
	const prefixSize = scenario === 'live' || scenario === 'live-failure' ? 0 : scenario === 'mixed' ? outputSize / 2 : outputSize;
	const suffixSize = outputSize - prefixSize;
	const prefixEnding = JSON.stringify(suffixSize ? '' : '\n');
	const prefix = prefixSize ? `
		process.stdout.write('B'.repeat(${prefixSize}) + ${prefixEnding});
		process.stderr.write('b'.repeat(${prefixSize}) + ${prefixEnding});
	` : '';
	const suffix = suffixSize ? `
		process.stdout.write('B'.repeat(${suffixSize}) + '\\n');
		process.stderr.write('b'.repeat(${suffixSize}) + '\\n');
	` : '';
	const second = $({ quiet: true })`${process.execPath} -e ${`
		${prefix}
		${scenario === 'completed' ? '' : `
			process.stdin.resume();
			process.stdin.once('end', () => {
				${suffix}
				process.exitCode = ${fails ? 1 : 0};
			});
		`}
	`}`;

	if (scenario === 'completed') {
		await second;
	} else if (prefixSize) {
		const bufferedBytes = prefixSize + (suffixSize ? 0 : 1);
		await Promise.all([
			waitForOutput(second.stdout, bufferedBytes),
			waitForOutput(second.stderr, bufferedBytes),
		]);
	}

	await first;
	await streamProcessOutputAndCheckResult('first', first);
	assert.strictEqual(second.stage, scenario === 'completed' ? 'fulfilled' : 'running');
	const streaming = streamProcessOutputAndCheckResult('second', second);
	if (scenario !== 'completed') {
		second.stdin.end();
	}
	if (fails) {
		await assert.rejects(streaming, error => error === second.output);
	} else {
		await streaming;
	}
	assert.deepStrictEqual([process.stdout.listenerCount('error'), process.stderr.listenerCount('error')], errorListeners);
}

main().then(() => {
	process.exit(0);
}, error => {
	console.error(error);
	process.exit(1);
});
