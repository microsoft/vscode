/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPipelineArtifacts } from '../common/publish';
import { retry } from '../common/retry';

async function main() {
	const artifacts = [
		'unsigned_vscode_client_darwin_x64_archive',
		'unsigned_vscode_client_darwin_arm64_archive'
	];

	// Wait for artifacts for 30 minutes
	for (let index = 0; index < 60; index++) {
		try {
			console.log(`Waiting for artifacts (${artifacts.join(', ')}) to be uploaded (${index + 1}/60)...`);
			const allArtifacts = await retry(() => getPipelineArtifacts());
			console.log(`  * Total number of artifacts attached to the pipelines: ${allArtifacts.length}`);

			const foundArtifacts = allArtifacts.filter(a => artifacts.includes(a.name));
			console.log(`  * Found ${foundArtifacts.length} of ${artifacts.length} artifacts${foundArtifacts.length > 0 ? `: ${foundArtifacts.map(a => a.name).join(', ')}` : ''}`);

			if (foundArtifacts.length === artifacts.length) {
				console.log(`  * All artifacts (${artifacts.join(', ')}) were found`);
				return;
			}
		} catch (err) {
			console.error(`ERROR: Failed to get pipeline artifacts: ${err}`);
		}

		await new Promise(c => setTimeout(c, 30_000));
	}

	throw new Error(`ERROR: Artifacts (${artifacts.join(', ')}) were not uploaded within 30 minutes.`);
}

if (require.main === module) {
	main().then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
