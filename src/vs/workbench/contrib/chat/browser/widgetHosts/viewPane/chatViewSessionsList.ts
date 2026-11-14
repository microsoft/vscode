/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IListStyles } from '../../../../../../base/browser/ui/list/listWidget.js';
import { IStyleOverride } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { AgentSessionRefreshReason, IAgentSession } from '../../agentSessions/agentSessionsModel.js';

/** The sessions list that the Chat view shows in its sessions section: its own, or one that a provider gives it. */
export interface IChatViewSessionsListControl extends IDisposable {
	setVisible(visible: boolean): void;
	layout(height: number, width: number): void;
	focus(): void;
	scrollToTop(): void;
	refresh(reason?: AgentSessionRefreshReason): void;
	/** Updates what it lists, such as as the Chat view's orientation changes its grouping; resolves to whether it did. */
	update(): Promise<boolean>;
	reveal(sessionResource: URI): boolean;
	clearFocus(): void;
	hasFocusOrSelection(): boolean;
	/** The sessions of the Chat view's own list that have focus, which actions of that list act on. */
	getFocus(): IAgentSession[];
}

/** A composer of new chats that the Chat view shows in place of its chat while it shows a new chat. */
export interface IChatViewSessionsComposer extends IDisposable {
	/** The height of its content, which the Chat view gives it at its bottom, below the sessions while they are stacked. */
	readonly height: IObservable<number>;
	layout(width: number, height: number): void;
	focus(): void;
}

/** A sessions list of the Chat view, with how the Chat view shows it. */
export interface IChatViewSessionsList {
	readonly control: IChatViewSessionsListControl;
	/** Whether it shows its own header, with its title and its actions: the Chat view then shows none above it. */
	readonly hasHeader: boolean;
	/** Whether the Chat view shows only the sessions, without its chat. */
	readonly sessionsOnly: IObservable<boolean>;
	/** Creates, in `container`, the composer of new chats that the Chat view shows in place of its new chat. */
	createComposer?(container: HTMLElement): IChatViewSessionsComposer;
}

/** Gives the Chat view a sessions list in place of its own. */
export interface IChatViewSessionsListProvider {
	/** Creates the sessions list in `container`, with `instantiationService` of the Chat view. */
	create(container: HTMLElement, instantiationService: IInstantiationService, options: { readonly overrideStyles: IStyleOverride<IListStyles> }): IChatViewSessionsList;
}

export const IChatViewSessionsListService = createDecorator<IChatViewSessionsListService>('chatViewSessionsListService');

/**
 * Where the Chat view takes its sessions list from: its own, unless a provider is registered as the Chat view is created. The
 * provider registered last is the one in use.
 */
export interface IChatViewSessionsListService {
	readonly _serviceBrand: undefined;
	readonly provider: IChatViewSessionsListProvider | undefined;
	registerProvider(provider: IChatViewSessionsListProvider): IDisposable;
}

export class ChatViewSessionsListService implements IChatViewSessionsListService {

	declare readonly _serviceBrand: undefined;

	/** One registration each, also of the same provider. */
	private readonly _providers: { readonly provider: IChatViewSessionsListProvider }[] = [];

	get provider(): IChatViewSessionsListProvider | undefined {
		return this._providers.at(-1)?.provider;
	}

	registerProvider(provider: IChatViewSessionsListProvider): IDisposable {
		const registration = { provider };
		this._providers.push(registration);
		return toDisposable(() => {
			const index = this._providers.indexOf(registration);
			if (index >= 0) {
				this._providers.splice(index, 1);
			}
		});
	}
}

registerSingleton(IChatViewSessionsListService, ChatViewSessionsListService, InstantiationType.Delayed);
