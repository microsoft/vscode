import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IEphemeralStateService = createDecorator<IEphemeralStateService>('ephemeralStateService');

export interface IEphemeralStateService {

	readonly _serviceBrand: undefined;

	getItem<T>(key: string, defaultValue: T): Promise<T>;
	getItem<T>(key: string, defaultValue?: T): Promise<T | undefined>;
	setItem(key: string, data?: object | string | number | boolean | undefined | null): Promise<void>;

	removeItem(key: string): Promise<void>;
}
