/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { Readable } from 'stream';
import { $ } from 'zx';
import { streamProcessOutputAndCheckResult } from '../../azure-pipelines/common/codesign.ts';

const outputSize = 256 * 1024;

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
