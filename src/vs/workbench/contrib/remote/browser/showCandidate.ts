/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { CandidatePort } from 'vs/workbench/services/remote/common/tunnelModel';

export class ShowCandidateContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.showPortCandidate';

	constructor(
		@IRemoteExplorerService remoteExplorerService: IRemoteExplorerService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
	) {
		super();
		const showPortCandidate = environmentService.options?.tunnelProvider?.showPortCandidate;
		if (showPortCandidate) {
			this._register(remoteExplorerService.setCandidateFilter(async (candidates: CandidatePort[]): Promise<CandidatePort[]> => {
				const filters: boolean[] = await Promise.all(candidates.map(candidate => showPortCandidate(candidate.host, candidate.port, candidate.detail ?? '')));
				const filteredCandidates: CandidatePort[] = [];
				if (filters.length !== candidates.length) {
					return candidates;
				}
				for (let i = 0; i < candidates.length; i++) {
					if (filters[i]) {
						filteredCandidates.push(candidates[i]);
					}
				}
				return filteredCandidates;
			}));
		}
	}
}
