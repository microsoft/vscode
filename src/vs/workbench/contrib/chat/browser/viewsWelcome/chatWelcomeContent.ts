/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import type { IChatWidget } from '../chat.js';

export interface IChatWelcomeContentContext {
	readonly widget: IChatWidget;
	/** Whether the Chat is visible and shows its empty state. */
	readonly visible: IObservable<boolean>;
}

/**
 * Content in the center of an empty Chat, below its welcome message.
 */
export interface IChatWelcomeContentContribution {
	/**
	 * Renders into a container of one Chat and keeps it up to date until the
	 * result is disposed. Leaves the container empty when there is nothing to show.
	 */
	render(container: HTMLElement, context: IChatWelcomeContentContext): IDisposable;
}

class ChatWelcomeContentRegistry {

	private readonly contributions = new Set<IChatWelcomeContentContribution>();
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	register(contribution: IChatWelcomeContentContribution): IDisposable {
		this.contributions.add(contribution);
		this._onDidChange.fire();
		return toDisposable(() => {
			if (this.contributions.delete(contribution)) {
				this._onDidChange.fire();
			}
		});
	}

	get(): readonly IChatWelcomeContentContribution[] {
		return [...this.contributions];
	}
}

export const chatWelcomeContentRegistry = new ChatWelcomeContentRegistry();
