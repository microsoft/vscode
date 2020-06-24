import { Event } from '../../base/common/event';

export const DEFAULT_CONFIG_LEVEL = 'DEFAULT';

export interface IConfigurationChangeEvent {
	source: string;
	affectedKeys: string[];
}

export interface IConfigurationService {
	onDidChangeConfiguration: Event<IConfigurationChangeEvent>;

	/**
	 * Fetches the value of the section for the given overrides.
	 * Value can be of native type or an object keyed off the section name.
	 *
	 * @param section - Section of the configuraion. Can be `null` or `undefined`.
	 *
	 */
	getValue<T>(section: string): T;
}
