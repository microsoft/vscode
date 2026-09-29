/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import * as commands from './commands';
import { ChatStatusWorkspaceIndexingStatus } from './workspaceIndexingStatus';

export function create(accessor: ServicesAccessor): IDisposable {
	const instantiationService = accessor.get(IInstantiationService);

	const disposableStore = new DisposableStore();
	disposableStore.add(instantiationService.createInstance(ChatStatusWorkspaceIndexingStatus));
	disposableStore.add(commands.register(accessor));

	return disposableStore;
}

