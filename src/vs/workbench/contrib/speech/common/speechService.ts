/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ISpeechService = createDecorator<ISpeechService>('speechService');

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

	registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable;

	createSpeechToTextSession(identifier: string, token: CancellationToken): ISpeechToTextSession;
}

export class SpeechService implements ISpeechService {

	readonly _serviceBrand: undefined;

	private readonly providers = new Map<string, ISpeechProvider>();

	registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable {
		if (this.providers.has(identifier)) {
			throw new Error(`Speech provider with identifier ${identifier} is already registered.`);
		}

		this.providers.set(identifier, provider);

		return toDisposable(() => this.providers.delete(identifier));
	}

	createSpeechToTextSession(identifier: string, token: CancellationToken): ISpeechToTextSession {
		const provider = this.providers.get(identifier);
		if (!provider) {
			throw new Error(`Speech provider with identifier ${identifier} is not registered.`);
		}

		return provider.createSpeechToTextSession(token);
	}
}
