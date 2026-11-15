/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
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
	/** Opens the list's find, as Find of the Chat view's sessions toolbar does, which a list without a header of its own keeps. */
	openFind(): void;
}

/** A sessions list of the Chat view, with how the Chat view shows it. */
export interface IChatViewSessionsList {
	readonly control: IChatViewSessionsListControl;
	/** Whether it shows its own header, with its title and its actions: the Chat view then shows none above it. */
	readonly hasHeader: boolean;
	/** Whether the Chat view shows only the sessions, without its chat. */
	readonly sessionsOnly: IObservable<boolean>;
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
	/** Fires as {@link provider} changes, such as a feature that provides the list turning on or off. */
	readonly onDidChangeProvider: Event<void>;
	registerProvider(provider: IChatViewSessionsListProvider): IDisposable;

	/** Whether the Chat view shows only its sessions, without its chat: while the list it shows says so, or a claim is held. */
	readonly sessionsOnly: IObservable<boolean>;

	/** Makes the Chat view show only its sessions, whichever list it shows, until the returned disposable is disposed. */
	claimSessionsOnly(): IDisposable;

	/** Called by the Chat view with the provided list it shows, until the returned disposable is disposed. */
	setActiveList(list: IChatViewSessionsList): IDisposable;
}

export class ChatViewSessionsListService extends Disposable implements IChatViewSessionsListService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProvider = this._register(new Emitter<void>());
	readonly onDidChangeProvider = this._onDidChangeProvider.event;

	/** One registration each, also of the same provider. */
	private readonly _providers: { readonly provider: IChatViewSessionsListProvider }[] = [];

	get provider(): IChatViewSessionsListProvider | undefined {
		return this._providers.at(-1)?.provider;
	}

	private readonly _activeList = observableValue<IChatViewSessionsList | undefined>(this, undefined);
	private readonly _sessionsOnlyClaims = observableValue(this, 0);
	readonly sessionsOnly: IObservable<boolean> = derived(this, reader => this._sessionsOnlyClaims.read(reader) > 0 || (this._activeList.read(reader)?.sessionsOnly.read(reader) ?? false));

	claimSessionsOnly(): IDisposable {
		this._sessionsOnlyClaims.set(this._sessionsOnlyClaims.get() + 1, undefined);
		return toDisposable(() => this._sessionsOnlyClaims.set(this._sessionsOnlyClaims.get() - 1, undefined));
	}

	setActiveList(list: IChatViewSessionsList): IDisposable {
		this._activeList.set(list, undefined);
		return toDisposable(() => {
			if (this._activeList.get() === list) {
				this._activeList.set(undefined, undefined);
			}
		});
	}

	registerProvider(provider: IChatViewSessionsListProvider): IDisposable {
		const registration = { provider };
		const previous = this.provider;
		this._providers.push(registration);
		// The same provider registering again, such as a feature that holds it more than once, changes nothing
		if (this.provider !== previous) {
			this._onDidChangeProvider.fire();
		}
		return toDisposable(() => {
			const index = this._providers.indexOf(registration);
			if (index >= 0) {
				const previous = this.provider;
				this._providers.splice(index, 1);
				if (this.provider !== previous) {
					this._onDidChangeProvider.fire();
				}
			}
		});
	}
}

registerSingleton(IChatViewSessionsListService, ChatViewSessionsListService, InstantiationType.Delayed);
