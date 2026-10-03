/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';

export const IRemoteAgentHostAuthenticationService = createDecorator<IRemoteAgentHostAuthenticationService>('remoteAgentHostAuthenticationService');

export interface IRemoteAgentHostAuthenticationService {
	readonly _serviceBrand: undefined;
	/** Shares each connection's initial authentication readiness with its retained session lists. */
	acquire(address: string): IReference<ISettableObservable<boolean>>;
}

export class RemoteAgentHostAuthenticationService extends ReferenceCollection<ISettableObservable<boolean>> implements IRemoteAgentHostAuthenticationService {
	declare readonly _serviceBrand: undefined;

	protected override createReferencedObject(): ISettableObservable<boolean> {
		return observableValue(this, true);
	}

	protected override destroyReferencedObject(): void { }
}

registerSingleton(IRemoteAgentHostAuthenticationService, RemoteAgentHostAuthenticationService, InstantiationType.Delayed);
