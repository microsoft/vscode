import { IEphemeralStateService } from '../../../../platform/ephemeralState/common/ephemeralState.js';
import { EPHEMERAL_STATE_CHANNEL_NAME, EphemeralStateChannelClient } from '../../../../platform/ephemeralState/common/ephemeralStateIpc.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';

export class ElectronEphemeralStateService implements IEphemeralStateService {

	_serviceBrand: undefined;
	_channel: EphemeralStateChannelClient;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		this._channel = new EphemeralStateChannelClient(mainProcessService.getChannel(EPHEMERAL_STATE_CHANNEL_NAME));
	}

	getItem<T>(key: unknown, defaultValue?: unknown): Promise<T | undefined> {
		return this._channel.getItem(key, defaultValue);
	}

	setItem(key: string, data?: object | string | number | boolean | undefined | null): Promise<void> {
		return this._channel.setItem(key, data);
	}

	removeItem(key: string): Promise<void> {
		return this._channel.removeItem(key);
	}
}

registerSingleton(IEphemeralStateService, ElectronEphemeralStateService, InstantiationType.Delayed);
