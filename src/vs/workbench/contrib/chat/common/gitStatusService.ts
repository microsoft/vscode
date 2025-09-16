/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISCMService } from '../../scm/common/scm.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export const IGitStatus = createDecorator<IGitStatus>('gitStatus');

export interface IGitStatus {
	readonly _serviceBrand: undefined;
	/**
	 * Best-effort current branch name. Undefined when:
	 *  - No repositories
	 *  - Multiple repositories (ambiguous)
	 *  - Provider has no history (branch concept unavailable)
	 */
	getCurrentBranch(): string | undefined;
}

class GitStatusService extends Disposable implements IGitStatus {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ISCMService private readonly scmService: ISCMService,
	) {
		super();
	}

	getCurrentBranch(): string | undefined {
		const repos: any[] = Array.from(this.scmService.repositories);
		if (repos.length !== 1) {
			return undefined; // Avoid ambiguity with multiple repos
		}
		const repo = repos[0];
		const historyProvider = repo.provider.historyProvider.get?.();
		const ref = historyProvider?.historyItemRef.get?.();
		return ref?.name;
	}
}

registerSingleton(IGitStatus, GitStatusService, InstantiationType.Delayed);
