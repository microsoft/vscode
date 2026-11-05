/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { RepositoryPicker } from '../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { ISessionRepositoryPicker } from './sessionRepositoryPicker.js';

export class DefaultSessionRepositoryPicker implements ISessionRepositoryPicker {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async pickRepository(getRepositories: (query: string, token: CancellationToken) => Promise<readonly string[]>, token: CancellationToken): Promise<string | undefined> {
		const store = new DisposableStore();
		try {
			const picker = store.add(this.instantiationService.createInstance(RepositoryPicker));
			return (await picker.pickRepository(getRepositories, undefined, token))?.repository;
		} finally {
			store.dispose();
		}
	}
}

registerSingleton(ISessionRepositoryPicker, DefaultSessionRepositoryPicker, InstantiationType.Delayed);
