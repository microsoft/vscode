/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { AccessibilityVoiceSettingId } from '../common/speechService.js';

export const IMaiSpeechCredentialsService = createDecorator<IMaiSpeechCredentialsService>('maiSpeechCredentialsService');

export const MAI_SPEECH_ENDPOINT_SETTING = AccessibilityVoiceSettingId.MaiSpeechEndpoint;

/** Key of the secret holding the speech service key, in {@link ISecretStorageService}. */
export const MAI_SPEECH_KEY_SECRET = 'speech.mai.key';

export interface IMaiSpeechCredentials {
	readonly endpoint: string;
	readonly key: string;
}

/**
 * Where the MAI speech service lives and how to authenticate with it.
 *
 * Deliberately separate from the engine that uses it: the key is supplied by the
 * user for now, and is expected to be replaced by an endpoint that authenticates
 * with the identity the user already signed in with, the way voice mode does.
 * Only this service should need to change for that.
 */
export interface IMaiSpeechCredentialsService {

	readonly _serviceBrand: undefined;

	/**
	 * Whether an endpoint and a key are both available, and reading aloud can
	 * therefore use this service. Fires {@link onDidChangeConfigured} when this
	 * changes, so that the engine can be offered or withdrawn.
	 */
	readonly isConfigured: boolean;
	readonly onDidChangeConfigured: Event<void>;

	/** The credentials to use, or `undefined` when they are not configured. */
	resolve(): Promise<IMaiSpeechCredentials | undefined>;

	/** Stores `key` for the configured endpoint, or forgets it when empty. */
	setKey(key: string | undefined): Promise<void>;
}

export class MaiSpeechCredentialsService extends Disposable implements IMaiSpeechCredentialsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfigured = this._register(new Emitter<void>());
	readonly onDidChangeConfigured = this._onDidChangeConfigured.event;

	private hasKey = false;

	get isConfigured(): boolean {
		return !!this.endpoint && this.hasKey;
	}

	private get endpoint(): string | undefined {
		const configured = this.configurationService.getValue<string>(MAI_SPEECH_ENDPOINT_SETTING)?.trim();
		if (!configured) {
			return undefined;
		}

		// The key travels with every request, so it must never leave the machine
		// in the clear. `localhost` is allowed so the service can be run locally.
		try {
			const url = new URL(configured);
			const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

			return url.protocol === 'https:' || (isLocal && url.protocol === 'http:') ? configured : undefined;
		} catch {
			return undefined; // not a URL at all
		}
	}

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(MAI_SPEECH_ENDPOINT_SETTING)) {
				this._onDidChangeConfigured.fire();
			}
		}));

		// The key is shared between windows, so it can be set or removed by one
		// of the others while this one is running.
		this._register(this.secretStorageService.onDidChangeSecret(key => {
			if (key === MAI_SPEECH_KEY_SECRET) {
				this.refreshHasKey();
			}
		}));

		this.refreshHasKey();
	}

	private async refreshHasKey(): Promise<void> {
		const wasConfigured = this.isConfigured;
		this.hasKey = !!await this.resolve();

		if (this.isConfigured !== wasConfigured) {
			this._onDidChangeConfigured.fire();
		}
	}

	/**
	 * The stored key together with the endpoint it was given for, or `undefined`
	 * when nothing is stored.
	 */
	private async readStoredKey(): Promise<IMaiSpeechCredentials | undefined> {
		try {
			const stored = await this.secretStorageService.get(MAI_SPEECH_KEY_SECRET);

			return stored ? JSON.parse(stored) as IMaiSpeechCredentials : undefined;
		} catch (error) {
			// Secret storage is unavailable on some platforms, and a value written
			// by an older version is not in this shape; reading aloud then falls
			// back to the speech synthesizer of the platform.
			this.logService.warn(`[speech] could not read the MAI speech key: ${error}`);

			return undefined;
		}
	}

	async resolve(): Promise<IMaiSpeechCredentials | undefined> {
		const endpoint = this.endpoint;
		const stored = await this.readStoredKey();

		// A key is only ever sent to the endpoint it was given for. Pointing the
		// setting at another host therefore stops reading aloud until a key for
		// that host is entered, instead of handing this one to it.
		return endpoint && stored?.key && stored.endpoint === endpoint ? { endpoint, key: stored.key } : undefined;
	}

	async setKey(key: string | undefined): Promise<void> {
		const endpoint = this.endpoint;
		if (key?.trim() && endpoint) {
			await this.secretStorageService.set(MAI_SPEECH_KEY_SECRET, JSON.stringify({ endpoint, key: key.trim() } satisfies IMaiSpeechCredentials));
		} else {
			await this.secretStorageService.delete(MAI_SPEECH_KEY_SECRET);
		}

		await this.refreshHasKey();
	}
}
