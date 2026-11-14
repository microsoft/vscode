/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatHostPart } from '../../../../browser/parts/chat/chatHostPart.js';
import type { IAgentsChatPartService } from './agentsChatPart.js';

export const IAgentsChatPartFrame = createDecorator<IAgentsChatPartFrame>('agentsChatPartFrame');

/**
 * The chat part of an editor window, as a part of the workbench grid: created as a feature enables the chat part as the
 * window starts, before the grid is, so that the grid has a place for it. What it shows is created once a chat opens in it.
 */
export interface IAgentsChatPartFrame {
	readonly _serviceBrand: undefined;
	readonly part: ChatHostPart;
	/**
	 * What the chat part shows, `IAgentsChatPartService`, once it was created: what reads it without needing it, such as what
	 * the window's chat is, reads this instance, rather than creating it. Not the service: it reads as the service is still
	 * being created, which reading the service then would create again, as another instance.
	 */
	readonly content: IObservable<IAgentsChatPartService | undefined>;
	/** Whether {@link content} was created: what reads the chat part reads {@link content} only then. */
	readonly contentCreated: IObservable<boolean>;
	/** Called by `IAgentsChatPartService` as it is created, with itself. */
	didCreateContent(content: IAgentsChatPartService): void;
}

export class AgentsChatPartFrame extends Disposable implements IAgentsChatPartFrame {

	declare readonly _serviceBrand: undefined;

	readonly part: ChatHostPart;
	private readonly _content = observableValue<IAgentsChatPartService | undefined>(this, undefined);
	readonly content: IObservable<IAgentsChatPartService | undefined> = this._content;
	readonly contentCreated: IObservable<boolean> = derived(this, reader => !!this._content.read(reader));

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this.part = this._register(instantiationService.createInstance(ChatHostPart));
	}

	didCreateContent(content: IAgentsChatPartService): void {
		this._content.set(content, undefined);
	}
}
