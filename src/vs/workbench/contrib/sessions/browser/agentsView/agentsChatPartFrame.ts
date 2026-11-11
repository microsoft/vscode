/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatHostPart } from '../../../../browser/parts/chat/chatHostPart.js';

export const IAgentsChatPartFrame = createDecorator<IAgentsChatPartFrame>('agentsChatPartFrame');

/**
 * The chat part of an editor window with the Sessions view, as a part of the workbench grid: created as the window starts,
 * before the grid is, so that the grid has a place for it. What it shows is created once a chat opens in it.
 */
export interface IAgentsChatPartFrame {
	readonly _serviceBrand: undefined;
	readonly part: ChatHostPart;
}

export class AgentsChatPartFrame extends Disposable implements IAgentsChatPartFrame {

	declare readonly _serviceBrand: undefined;

	readonly part: ChatHostPart;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this.part = this._register(instantiationService.createInstance(ChatHostPart));
	}
}
