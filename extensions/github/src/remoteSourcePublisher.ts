/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { publishRepository } from './publish';
import { API as GitAPI, RemoteSourcePublisher, Repository } from './typings/git';

export class GithubRemoteSourcePublisher implements RemoteSourcePublisher {
	readonly name = 'GitHub';
	readonly icon = 'github';

	constructor(private gitAPI: GitAPI) { }

	publishRepository(repository: Repository): Promise<void> {
		return publishRepository(this.gitAPI, repository);
	}
}
