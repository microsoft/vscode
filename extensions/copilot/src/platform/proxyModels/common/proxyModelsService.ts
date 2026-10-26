/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import type { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Event } from '../../../util/vs/base/common/event';
import { WireTypes } from '../../inlineEdits/common/dataTypes/inlineEditsModelsTypes';

export interface IProxyModelsService {
	readonly _serviceBrand: undefined;

	readonly onModelListUpdated: Event<void>;

	readonly models: WireTypes.ModelList.t | undefined;
	readonly nesModels: WireTypes.Model.t[] | undefined;
	readonly cursorJumpModels: WireTypes.Model.t[] | undefined;
	readonly instantApplyModels: WireTypes.Model.t[] | undefined;
	readonly modelsLoaded: boolean;

	/**
	 * Ensures the model list is loaded for the current authenticated user.
	 * Concurrent loads are shared and token changes are followed transparently.
	 * Rejects when authentication or model discovery fails.
	 */
	ensureModelsLoaded(cancellationToken: CancellationToken): Promise<void>;
}

export const IProxyModelsService = createServiceIdentifier<IProxyModelsService>('IProxyModelsService');

export class NullProxyModelsService implements IProxyModelsService {
	readonly _serviceBrand: undefined;

	readonly onModelListUpdated: Event<void> = Event.None;

	get models(): WireTypes.ModelList.t | undefined {
		return undefined;
	}

	get nesModels(): WireTypes.Model.t[] | undefined {
		return undefined;
	}

	get cursorJumpModels(): WireTypes.Model.t[] | undefined {
		return undefined;
	}

	get instantApplyModels(): WireTypes.Model.t[] | undefined {
		return undefined;
	}

	readonly modelsLoaded = true;

	async ensureModelsLoaded(_cancellationToken: CancellationToken): Promise<void> {
	}
}
