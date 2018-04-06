/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Repository } from './models/repository';
import { GitProcess } from 'dugite';

export async function fetch(repository: Repository, remoteName: string, branch: string) {
	const result = await GitProcess.exec(
		[
			'fetch',
			remoteName,
			branch
		],
		repository.path
	);

	if (result.exitCode !== 0) {
		throw (result.stderr);
	}
}

export async function checkout(repository: Repository, branch: string) {
	const result = await GitProcess.exec(
		[
			'checkout',
			branch
		],
		repository.path
	);

	if (result.exitCode !== 0) {
		throw (result.stderr);
	}
}
