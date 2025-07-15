/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';

export const enum ChatViewsWelcomeExtensions {
	ChatViewsWelcomeRegistry = 'workbench.registry.chat.viewsWelcome',
}

export interface IChatViewsWelcomeDescriptor {
	icon?: ThemeIcon;
	title: string;
	content: IMarkdownString | ((disposables: DisposableStore) => HTMLElement);
	when: ContextKeyExpression;
}

export interface IChatViewsWelcomeContributionRegistry {
	onDidChange: Event<void>;
	get(): ReadonlyArray<IChatViewsWelcomeDescriptor>;
	register(descriptor: IChatViewsWelcomeDescriptor): void;
}

class ChatViewsWelcomeContributionRegistry extends Disposable implements IChatViewsWelcomeContributionRegistry {
	private readonly descriptors: IChatViewsWelcomeDescriptor[] = [];
	private readonly _onDidChange = this._register(new Emitter<void>());
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	public register(descriptor: IChatViewsWelcomeDescriptor): void {
		this.descriptors.push(descriptor);
		this._onDidChange.fire();
	}

	public get(): ReadonlyArray<IChatViewsWelcomeDescriptor> {
		return this.descriptors;
	}
}

export const chatViewsWelcomeRegistry = new ChatViewsWelcomeContributionRegistry();
Registry.add(ChatViewsWelcomeExtensions.ChatViewsWelcomeRegistry, chatViewsWelcomeRegistry);
