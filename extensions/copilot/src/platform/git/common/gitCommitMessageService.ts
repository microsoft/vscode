/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Repository } from '../vscode/git';

export const IGitCommitMessageService = createServiceIdentifier<IGitCommitMessageService>('IGitCommitMessageService');

export interface IGitCommitMessageService {
	readonly _serviceBrand: undefined;
	generateCommitMessage(repository: Repository, cancellationToken: CancellationToken | undefined): Promise<string | undefined>;
	getRepository(uri: Uri | undefined): Promise<Repository | null>;
}

/**
 * @remark For testing purposes only.
 */
export class NoopGitCommitMessageService implements IGitCommitMessageService {
	declare readonly _serviceBrand: undefined;

	generateCommitMessage(): Promise<string | undefined> {
		return Promise.resolve('Test commit message');
	}

	async getRepository(): Promise<Repository | null> {
		return null;
	}
}
