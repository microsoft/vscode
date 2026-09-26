/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { SourceFile, collectChunks, rankCandidates, searchLimits } from './search';
import { scoreLocally } from './scorer';

async function* sampleFiles(): AsyncIterable<SourceFile<string>> {
	const folder = path.resolve(__dirname, '../fixtures/workspace');
	for (const name of (await fs.readdir(folder)).filter(name => name.endsWith('.ts')).sort()) {
		const file = path.join(folder, name);
		const stat = await fs.stat(file);
		yield { resource: name, size: stat.size, isFile: stat.isFile(), readText: () => fs.readFile(file, 'utf8') };
	}
}

async function main(): Promise<void> {
	const query = process.argv.slice(2).join(' ') || 'where do we retry requests';
	const signal = new AbortController().signal;
	const collected = await collectChunks(sampleFiles(), undefined, signal);
	const ranked = await rankCandidates(query, collected.chunks, scoreLocally, searchLimits.results, signal);
	console.log(JSON.stringify({
		mode: 'local-token-overlap-demo',
		modelCalled: false,
		query,
		chunks: collected.chunks.length,
		limitHit: collected.limitHit || ranked.limitHit,
		results: ranked.matches.map(({ candidate, score }) => ({
			file: candidate.resource,
			startLine: candidate.startLine + 1,
			endLine: candidate.endLine + 1,
			score,
		})),
	}, null, 2));
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
