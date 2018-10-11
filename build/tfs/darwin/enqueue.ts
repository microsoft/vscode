/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { execSync } from 'child_process';
import * as azure from 'azure-storage';


function queueSigningRequest(quality: string, commit: string): Promise<void> {
	const retryOperations = new azure.ExponentialRetryPolicyFilter();
	const queueSvc = azure
		.createQueueService(process.env['AZURE_STORAGE_ACCOUNT_2']!, process.env['AZURE_STORAGE_ACCESS_KEY_2']!)
		.withFilter(retryOperations);

	queueSvc.messageEncoder = new azure.QueueMessageEncoder.TextBase64QueueMessageEncoder();

	const message = `${quality}/${commit}`;

	return new Promise<void>((c, e) => queueSvc.createMessage('sign-darwin', message, err => err ? e(err) : c()));
}


async function main(quality: string): Promise<void> {
	const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

	console.log(`Queueing signing request for '${quality}/${commit}'...`);
	await queueSigningRequest(quality, commit);

	// console.log('Waiting on signed build...');
	// await waitForSignedBuild(quality, commit);

	// console.log('Found signed build!');
}

main(process.argv[2]).catch(err => {
	console.error(err);
	process.exit(1);
});