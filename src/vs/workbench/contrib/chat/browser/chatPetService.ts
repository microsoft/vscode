/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import product from '../../../../platform/product/common/product.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

const CHAT_PET_ENABLED_STORAGE_KEY = 'chat.vscodePet.enabled';
const CHAT_PET_VARIANT_STORAGE_KEY = 'chat.vscodePet.variant';
const CHAT_PET_ON_THE_RUN_STORAGE_KEY = 'chat.vscodePet.onTheRun';
const CHAT_PET_DEFAULT_SCALE = 1;

export type ChatPetVariant = 'stable' | 'insiders';

type ChatPetEnablementEvent = {
	enabled: boolean;
	source: 'startup' | 'change';
};

type ChatPetEnablementClassification = {
	owner: 'justschen';
	comment: 'Tracks VS Code pet enablement so adoption can be measured.';
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the VS Code pet is enabled.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the state was observed at startup or changed while VS Code was running.' };
};

export function getChatPetVariant(configuredVariant: string | undefined, productQuality: string | undefined): ChatPetVariant {
	if (configuredVariant === 'stable' || configuredVariant === 'insiders') {
		return configuredVariant;
	}
	return productQuality === 'stable' ? 'stable' : 'insiders';
}

export const IChatPetService = createDecorator<IChatPetService>('chatPetService');

export interface IChatPetService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly variant: IObservable<ChatPetVariant>;
	readonly onTheRun: IObservable<boolean>;
	readonly scale: IObservable<number>;
	toggle(): boolean;
	setVariant(variant: ChatPetVariant): void;
	setOnTheRun(onTheRun: boolean): void;
	setScale(scale: number): void;
}

export class ChatPetService extends Disposable implements IChatPetService {

	declare readonly _serviceBrand: undefined;

	private readonly _enabled;
	readonly enabled: IObservable<boolean>;
	private readonly _variant;
	readonly variant: IObservable<ChatPetVariant>;
	private readonly _onTheRun;
	readonly onTheRun: IObservable<boolean>;
	private readonly _scale;
	readonly scale: IObservable<number>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._enabled = observableValue(this, this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false));
		this.enabled = this._enabled;
		this._variant = observableValue(this, getChatPetVariant(this.storageService.get(CHAT_PET_VARIANT_STORAGE_KEY, StorageScope.APPLICATION), product.quality));
		this.variant = this._variant;
		this._onTheRun = observableValue(this, this.storageService.getBoolean(CHAT_PET_ON_THE_RUN_STORAGE_KEY, StorageScope.APPLICATION, false));
		this.onTheRun = this._onTheRun;
		this._scale = observableValue(this, CHAT_PET_DEFAULT_SCALE);
		this.scale = this._scale;

		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_ENABLED_STORAGE_KEY, this._store)(() => {
			this._setEnabled(this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false));
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_VARIANT_STORAGE_KEY, this._store)(() => {
			this._variant.set(getChatPetVariant(this.storageService.get(CHAT_PET_VARIANT_STORAGE_KEY, StorageScope.APPLICATION), product.quality), undefined);
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_ON_THE_RUN_STORAGE_KEY, this._store)(() => {
			this._onTheRun.set(this.storageService.getBoolean(CHAT_PET_ON_THE_RUN_STORAGE_KEY, StorageScope.APPLICATION, false), undefined);
		}));
		this._logEnablement(this._enabled.get(), 'startup');
	}

	toggle(): boolean {
		const enabled = !this._enabled.get();
		this._setEnabled(enabled);
		this.storageService.store(CHAT_PET_ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
		status(enabled
			? localize('chatPet.enabled', "VS Code pet enabled. Click the pet to interact with it, or use the Left and Right Arrow keys to move it.")
			: localize('chatPet.disabled', "VS Code pet disabled"));
		return enabled;
	}

	private _setEnabled(enabled: boolean): void {
		if (enabled === this._enabled.get()) {
			return;
		}
		transaction(tx => {
			this._enabled.set(enabled, tx);
			if (!enabled) {
				this._scale.set(CHAT_PET_DEFAULT_SCALE, tx);
			}
		});
		this._logEnablement(enabled, 'change');
	}

	private _logEnablement(enabled: boolean, source: ChatPetEnablementEvent['source']): void {
		this.telemetryService.publicLog2<ChatPetEnablementEvent, ChatPetEnablementClassification>('chatPetEnablement', { enabled, source });
	}

	setVariant(variant: ChatPetVariant): void {
		this._variant.set(variant, undefined);
		this.storageService.store(CHAT_PET_VARIANT_STORAGE_KEY, variant, StorageScope.APPLICATION, StorageTarget.USER);
		status(variant === 'stable'
			? localize('chatPet.variant.stable', "VS Code pet changed to the Stable colors")
			: localize('chatPet.variant.insiders', "VS Code pet changed to the Insiders colors"));
	}

	setOnTheRun(onTheRun: boolean): void {
		this._onTheRun.set(onTheRun, undefined);
		this.storageService.store(CHAT_PET_ON_THE_RUN_STORAGE_KEY, onTheRun, StorageScope.APPLICATION, StorageTarget.USER);
		status(onTheRun
			? localize('chatPet.onTheRun', "The VS Code pet is on the run. Click the pet to bring it back.")
			: localize('chatPet.restored', "The VS Code pet is back"));
	}

	setScale(scale: number): void {
		this._scale.set(scale, undefined);
	}
}
