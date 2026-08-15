/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { generateUuid } from '../../../util/vs/base/common/uuid';

export const IInteractionService = createServiceIdentifier<IInteractionService>('IInteractionService');

export interface IInteractionService {
	readonly _serviceBrand: undefined;

	readonly interactionId: string;

	startInteraction(): void;
}

/**
 * Simple service that tracks an interaction with a chat service
 * This is used for grouping requests to a logical interaction with the UI
 * It is just used for telemetry collection so is not 100% accurate, especially in the case of parallel interactions
 */
export class InteractionService implements IInteractionService {
	_serviceBrand: undefined;
	private _interactionId: string = generateUuid();

	startInteraction(): void {
		this._interactionId = generateUuid();
	}

	public get interactionId(): string {
		return this._interactionId;
	}
}
