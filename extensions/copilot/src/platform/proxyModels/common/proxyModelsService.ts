/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { Event } from '../../../util/vs/base/common/event';
import { WireTypes } from '../../inlineEdits/common/dataTypes/inlineEditsModelsTypes';

export interface IProxyModelsService {
	readonly _serviceBrand: undefined;

	readonly onModelListUpdated: Event<void>;

	readonly models: WireTypes.ModelList.t | undefined;
	readonly nesModels: WireTypes.Model.t[] | undefined;
	readonly instantApplyModels: WireTypes.Model.t[] | undefined;
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

	get instantApplyModels(): WireTypes.Model.t[] | undefined {
		return undefined;
	}
}
