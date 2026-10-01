/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { autorun, IObservable, ISettableObservable, observableValue } from '../../base/common/observable.js';
import { isEqual } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IActiveSession } from '../services/sessions/common/sessionsManagement.js';
import { ISession } from '../services/sessions/common/session.js';

export const CHAT_SPECIFIC_LAYOUT_SETTING = 'sessions.experimental.chatSpecificLayout';

export interface IChatLayoutOwner {
	readonly sessionResource: URI;
	readonly chatResource: URI;
}

export function chatLayoutOwnersEqual(a: IChatLayoutOwner | undefined, b: IChatLayoutOwner | undefined): boolean {
	return a === b || !!a && !!b && isEqual(a.sessionResource, b.sessionResource) && isEqual(a.chatResource, b.chatResource);
}

export function getChatLayoutOwnerAfterReplacement(owner: IChatLayoutOwner, replacement: { readonly from: ISession; readonly to: ISession }): IChatLayoutOwner {
	if (!isEqual(owner.sessionResource, replacement.from.resource)) {
		return owner;
	}
	return Object.freeze({
		sessionResource: replacement.to.resource,
		chatResource: isEqual(owner.chatResource, replacement.from.mainChat.get().resource)
			? replacement.to.mainChat.get().resource
			: owner.chatResource,
	});
}

export interface IChatLayoutPresentationSnapshot {
	readonly active: boolean;
	readonly generation: number;
}

export class ChatLayoutPresentation extends Disposable {
	readonly configured: boolean;
	readonly enabled: boolean;
	private readonly _state = observableValue<IChatLayoutPresentationSnapshot>(this, Object.freeze({ active: false, generation: 0 }));
	readonly state: IObservable<IChatLayoutPresentationSnapshot> = this._state;

	constructor(configurationService: IConfigurationService, startupDesktop: boolean, isPhoneLayout: IObservable<boolean>) {
		super();
		this.configured = configurationService.getValue<boolean>(CHAT_SPECIFIC_LAYOUT_SETTING) === true;
		this.enabled = startupDesktop && this.configured;
		this._register(autorun(reader => {
			const active = this.enabled && !isPhoneLayout.read(reader);
			const previous = this._state.read(undefined);
			if (active !== previous.active) {
				this._state.set(Object.freeze({ active, generation: previous.generation + 1 }), undefined);
			}
		}));
	}

	isCurrent(snapshot: IChatLayoutPresentationSnapshot): boolean {
		return snapshot.active && snapshot === this._state.get();
	}
}

export interface IChatLayoutSnapshot {
	readonly owner: IChatLayoutOwner | undefined;
	readonly presentation: IChatLayoutPresentationSnapshot;
	readonly generation: number;
}

export class ChatLayoutContext extends Disposable {
	private readonly _state: ISettableObservable<IChatLayoutSnapshot>;
	readonly state: IObservable<IChatLayoutSnapshot>;

	constructor(presentation: ChatLayoutPresentation, activeSession: IObservable<IActiveSession | undefined>) {
		super();
		this._state = observableValue<IChatLayoutSnapshot>(this, Object.freeze({ owner: undefined, presentation: presentation.state.get(), generation: 0 }));
		this.state = this._state;
		this._register(autorun(reader => {
			const session = activeSession.read(reader);
			const chat = session?.activeChat.read(reader);
			const owner = session && chat ? Object.freeze({ sessionResource: session.resource, chatResource: chat.resource }) : undefined;
			const currentPresentation = presentation.state.read(reader);
			const previous = this._state.read(undefined);
			if (!chatLayoutOwnersEqual(owner, previous.owner) || currentPresentation !== previous.presentation) {
				this._state.set(Object.freeze({ owner, presentation: currentPresentation, generation: previous.generation + 1 }), undefined);
			}
		}));
	}

	isCurrent(snapshot: IChatLayoutSnapshot): boolean {
		return snapshot.owner !== undefined && snapshot.presentation.active && snapshot === this._state.get();
	}
}
