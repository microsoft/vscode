/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { firstOrDefault } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const ISpeechService = createDecorator<ISpeechService>('speechService');

export const HasSpeechProvider = new RawContextKey<boolean>('hasSpeechProvider', false, { type: 'string', description: localize('hasSpeechProvider', "A speech provider is registered to the speech service.") });

export interface ISpeechProviderMetadata {
	readonly extension: ExtensionIdentifier;
	readonly displayName: string;
}

export enum SpeechToTextStatus {
	Started = 1,
	Recognizing = 2,
	Recognized = 3,
	Stopped = 4
}

export interface ISpeechToTextEvent {
	readonly status: SpeechToTextStatus;
	readonly text?: string;
}

export interface ISpeechProvider {
	readonly metadata: ISpeechProviderMetadata;

	createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession;
}

export interface ISpeechToTextSession extends IDisposable {
	readonly onDidChange: Event<ISpeechToTextEvent>;
}

export interface ISpeechService {

	readonly _serviceBrand: undefined;

	readonly onDidRegisterSpeechProvider: Event<ISpeechProvider>;
	readonly onDidUnregisterSpeechProvider: Event<ISpeechProvider>;

	readonly hasSpeechProvider: boolean;

	registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable;

	createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession;
}

export class SpeechService implements ISpeechService {

	readonly _serviceBrand: undefined;

	private readonly _onDidRegisterSpeechProvider = new Emitter<ISpeechProvider>();
	readonly onDidRegisterSpeechProvider = this._onDidRegisterSpeechProvider.event;

	private readonly _onDidUnregisterSpeechProvider = new Emitter<ISpeechProvider>();
	readonly onDidUnregisterSpeechProvider = this._onDidUnregisterSpeechProvider.event;

	get hasSpeechProvider(): boolean { return this.providers.size > 0; }

	private readonly providers = new Map<string, ISpeechProvider>();

	private readonly hasSpeechProviderContext = HasSpeechProvider.bindTo(this.contextKeyService);

	constructor(
		@ILogService private readonly logService: ILogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
	}

	registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable {
		if (this.providers.has(identifier)) {
			throw new Error(`Speech provider with identifier ${identifier} is already registered.`);
		}

		this.providers.set(identifier, provider);
		this.hasSpeechProviderContext.set(true);

		this._onDidRegisterSpeechProvider.fire(provider);

		return toDisposable(() => {
			this.providers.delete(identifier);
			this._onDidUnregisterSpeechProvider.fire(provider);

			if (this.providers.size === 0) {
				this.hasSpeechProviderContext.set(false);
			}
		});
	}

	createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession {
		const provider = firstOrDefault(Array.from(this.providers.values()));
		if (!provider) {
			throw new Error(`No Speech provider is registered.`);
		} else if (this.providers.size > 1) {
			this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
		}

		return provider.createSpeechToTextSession(token);
	}
}
