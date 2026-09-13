/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const enum ChatRequestOriginKind {
	Delegation = 'delegation',
}

export interface IChatRequestOrigin {
	readonly kind: ChatRequestOriginKind;
	readonly sourceSessionResource: URI;
	readonly delegationScope?: 'chat' | 'session';
}

export interface ISerializableChatRequestOrigin {
	readonly kind: ChatRequestOriginKind;
	readonly sourceSessionResource: UriComponents;
	readonly delegationScope?: 'chat' | 'session';
}

export function serializeChatRequestOrigin(origin: IChatRequestOrigin): ISerializableChatRequestOrigin {
	return {
		kind: origin.kind,
		sourceSessionResource: origin.sourceSessionResource.toJSON(),
		...(origin.delegationScope ? { delegationScope: origin.delegationScope } : {}),
	};
}

export function reviveChatRequestOrigin(origin: ISerializableChatRequestOrigin | undefined): IChatRequestOrigin | undefined {
	if (origin?.kind !== ChatRequestOriginKind.Delegation) {
		return undefined;
	}
	const sourceSessionResource = URI.revive(origin.sourceSessionResource);
	return sourceSessionResource ? {
		kind: origin.kind,
		sourceSessionResource,
		...(origin.delegationScope ? { delegationScope: origin.delegationScope } : {}),
	} : undefined;
}

export interface IChatRequestOriginOpener {
	open(origin: IChatRequestOrigin): Promise<boolean>;
}

export const IChatRequestOriginService = createDecorator<IChatRequestOriginService>('chatRequestOriginService');

export interface IChatRequestOriginService {
	readonly _serviceBrand: undefined;
	registerOpener(opener: IChatRequestOriginOpener): IDisposable;
	open(origin: IChatRequestOrigin): Promise<boolean>;
}

export class ChatRequestOriginService extends Disposable implements IChatRequestOriginService {

	declare readonly _serviceBrand: undefined;

	private readonly _openers = new Set<IChatRequestOriginOpener>();

	registerOpener(opener: IChatRequestOriginOpener): IDisposable {
		this._openers.add(opener);
		return toDisposable(() => this._openers.delete(opener));
	}

	async open(origin: IChatRequestOrigin): Promise<boolean> {
		for (const opener of this._openers) {
			if (await opener.open(origin)) {
				return true;
			}
		}
		return false;
	}
}
