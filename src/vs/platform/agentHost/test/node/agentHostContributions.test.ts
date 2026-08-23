/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostChangesetOperationService, IChangesetOperationContribution } from '../../common/agentHostChangesetOperationService.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { activateAgentHostContributions } from '../../node/agentHostContributions.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';

class FailingChangesetOperationService extends Disposable implements IAgentHostChangesetOperationService {
	declare readonly _serviceBrand: undefined;

	private _registrationCount = 0;
	disposedRegistrationCount = 0;

	registerContribution(contribution: IChangesetOperationContribution) {
		this._registrationCount++;
		if (this._registrationCount === 2) {
			contribution.dispose();
			throw new Error('Contribution registration failed');
		}
		return toDisposable(() => {
			this.disposedRegistrationCount++;
			contribution.dispose();
		});
	}

	updateOperations(): void { }
	getOperations() { return []; }
	async invokeChangesetOperation(): Promise<never> { throw new Error('Not implemented'); }
}

const nullGitStateService: IAgentHostGitStateService = {
	_serviceBrand: undefined,
	onDidRefreshSessionGitState: Event.None,
	onDidChangeSessionGitHubState: Event.None,
	async refreshSessionGitState() { },
	async resolveSessionBaseBranchName() { return undefined; },
	async setSessionGitHubState() { },
	async recordSessionMerge() { },
	async attachSessionGitHubPullRequest() { },
	async attachSessionGitHubReferences() { },
};

suite('AgentHostContributions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes earlier registrations when activation fails', () => {
		const changesetOperationService = disposables.add(new FailingChangesetOperationService());
		const services = new ServiceCollection(
			[IAgentHostStateManager, disposables.add(new AgentHostStateManager(new NullLogService()))],
			[IAgentHostChangesetOperationService, changesetOperationService],
			[IAgentHostGitStateService, nullGitStateService],
		);
		const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));

		assert.throws(
			() => instantiationService.invokeFunction(accessor => activateAgentHostContributions(accessor, instantiationService)),
			/Contribution registration failed/,
		);
		assert.strictEqual(changesetOperationService.disposedRegistrationCount, 1);
	});
});
