/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RUNTIME_REPO } from './copilotSource.ts';
import { mintCloneTokenFromEnv } from './mintGithubAppToken.ts';
import { writeRuntimeSourceMarker, writeRuntimeToken } from '../../lib/copilotRuntimeSource.ts';

const COMMIT_SHA = /^[0-9a-f]{40}$/;

async function main(): Promise<void> {
	const ref = (process.env['COPILOT_RUNTIME_SOURCE_REF'] ?? '').trim();
	if (!COMMIT_SHA.test(ref)) {
		throw new Error('[copilot-runtime-source] COPILOT_RUNTIME_SOURCE_REF must be a full 40-character lowercase commit SHA.');
	}

	const token = await mintCloneTokenFromEnv(RUNTIME_REPO);
	if (!token) {
		throw new Error('[copilot-runtime-source] The GitHub App key did not produce a clone token.');
	}

	writeRuntimeSourceMarker(RUNTIME_REPO, ref);
	writeRuntimeToken(token);
	console.log(`##vso[build.addbuildtag]copilot-runtime=git.${ref}`);
	console.log(`[copilot-runtime-source] Prepared ${RUNTIME_REPO}@${ref}.`);
}

main().catch(error => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exit(1);
});
