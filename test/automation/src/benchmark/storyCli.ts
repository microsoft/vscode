/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { dirname, isAbsolute } from 'path';
import { setProcessSignalHandlingEnabled } from '../code';
import {
	BenchmarkStoryResult,
	createInvalidResult,
	runBenchmarkStory,
	validateBenchmarkOutputPaths,
	validateBenchmarkStoryRequest
} from './benchmarkStory';

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
	setProcessSignalHandlingEnabled(false);
	const paths = parseArguments(args);
	const abortController = new AbortController();
	const interrupt = () => abortController.abort();
	process.once('SIGINT', interrupt);
	process.once('SIGTERM', interrupt);
	let requestValue: unknown;
	let result: BenchmarkStoryResult;
	try {
		requestValue = JSON.parse(await fs.readFile(paths.request, 'utf8'));
		const request = validateBenchmarkStoryRequest(requestValue);
		validateBenchmarkOutputPaths(request, paths.log, paths.result);
		const storyResult = await runBenchmarkStory(request, paths.log, { signal: abortController.signal });
		result = {
			...storyResult,
			artifacts: {
				...storyResult.artifacts,
				resultFile: paths.result
			}
		};
	} catch (error) {
		result = createInvalidResult(requestValue, error, {
			logFile: paths.log,
			resultFile: paths.result
		});
	} finally {
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', interrupt);
	}

	await writeJsonAtomically(paths.result, result);
	process.exitCode = result.status === 'success' ? 0 : 1;
}

function parseArguments(args: readonly string[]): { request: string; result: string; log: string } {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const option = args[index];
		const value = args[index + 1];
		if (!['--request', '--result', '--log'].includes(option) || !value) {
			throw new Error('Usage: node <vscode-story-cli> --request <absolute-request.json> --result <absolute-result.json> --log <absolute-log.txt>');
		}
		values.set(option, value);
	}
	const request = values.get('--request');
	const result = values.get('--result');
	const log = values.get('--log');
	if (!request || !result || !log || ![request, result, log].every(isAbsolute)) {
		throw new Error('--request, --result, and --log are required absolute paths.');
	}
	return { request, result, log };
}

async function writeJsonAtomically(path: string, value: BenchmarkStoryResult): Promise<void> {
	await fs.mkdir(dirname(path), { recursive: true });
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await fs.writeFile(temporaryPath, `${JSON.stringify(value)}\n`, 'utf8');
	await fs.rename(temporaryPath, path);
}

if (require.main === module) {
	void main();
}
