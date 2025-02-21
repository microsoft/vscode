/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from './chatContextKeys.js';

export const IChatQuotasService = createDecorator<IChatQuotasService>('chatQuotasService');

export interface IChatQuotasService {

	_serviceBrand: undefined;

	readonly onDidChangeQuotas: Event<void>;
	readonly quotas: IChatQuotas;

	acceptQuotas(quotas: IChatQuotas): void;
	clearQuotas(): void;
}

export interface IChatQuotas {
	chatQuotaExceeded: boolean;
	completionsQuotaExceeded: boolean;
	quotaResetDate: Date | undefined;
}

export class ChatQuotasService extends Disposable implements IChatQuotasService {

	declare _serviceBrand: undefined;

	private readonly _onDidChangeQuotas = this._register(new Emitter<void>());
	readonly onDidChangeQuotas: Event<void> = this._onDidChangeQuotas.event;

	private _quotas: IChatQuotas = { chatQuotaExceeded: false, completionsQuotaExceeded: false, quotaResetDate: undefined };
	get quotas(): IChatQuotas { return this._quotas; }

	private readonly chatQuotaExceededContextKey = ChatContextKeys.chatQuotaExceeded.bindTo(this.contextKeyService);
	private readonly completionsQuotaExceededContextKey = ChatContextKeys.completionsQuotaExceeded.bindTo(this.contextKeyService);

	private ExtensionQuotaContextKeys = {
		chatQuotaExceeded: 'github.copilot.chat.quotaExceeded',
		completionsQuotaExceeded: 'github.copilot.completions.quotaExceeded',
	};

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		const chatQuotaExceededSet = new Set([this.ExtensionQuotaContextKeys.chatQuotaExceeded]);
		const completionsQuotaExceededSet = new Set([this.ExtensionQuotaContextKeys.completionsQuotaExceeded]);

		this._register(this.contextKeyService.onDidChangeContext(e => {
			let changed = false;
			if (e.affectsSome(chatQuotaExceededSet)) {
				const newChatQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.ExtensionQuotaContextKeys.chatQuotaExceeded);
				if (typeof newChatQuotaExceeded === 'boolean' && newChatQuotaExceeded !== this._quotas.chatQuotaExceeded) {
					this._quotas.chatQuotaExceeded = newChatQuotaExceeded;
					changed = true;
				}
			}

			if (e.affectsSome(completionsQuotaExceededSet)) {
				const newCompletionsQuotaExceeded = this.contextKeyService.getContextKeyValue<boolean>(this.ExtensionQuotaContextKeys.completionsQuotaExceeded);
				if (typeof newCompletionsQuotaExceeded === 'boolean' && newCompletionsQuotaExceeded !== this._quotas.completionsQuotaExceeded) {
					this._quotas.completionsQuotaExceeded = newCompletionsQuotaExceeded;
					changed = true;
				}
			}

			if (changed) {
				this.updateContextKeys();
				this._onDidChangeQuotas.fire();
			}
		}));
	}

	acceptQuotas(quotas: IChatQuotas): void {
		this._quotas = quotas;
		this.updateContextKeys();

		this._onDidChangeQuotas.fire();
	}

	clearQuotas(): void {
		if (this.quotas.chatQuotaExceeded || this.quotas.completionsQuotaExceeded) {
			this.acceptQuotas({ chatQuotaExceeded: false, completionsQuotaExceeded: false, quotaResetDate: undefined });
		}
	}

	private updateContextKeys(): void {
		this.chatQuotaExceededContextKey.set(this._quotas.chatQuotaExceeded);
		this.completionsQuotaExceededContextKey.set(this._quotas.completionsQuotaExceeded);
	}
}
