/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IPosition } from 'vs/editor/common/core/position';
import { IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITextResourceConfigurationService = createDecorator<ITextResourceConfigurationService>('textResourceConfigurationService');

export interface ITextResourceConfigurationService {

	_serviceBrand: any;

	/**
	 * Event that fires when the configuration changes.
	 */
	onDidChangeConfiguration: Event<IConfigurationChangeEvent>;

	/**
	 * Fetches the value of the section for the given resource by applying language overrides.
	 * Value can be of native type or an object keyed off the section name.
	 *
	 * @param resource - Resource for which the configuration has to be fetched. Can be `null` or `undefined`.
	 * @param postion - Position in the resource for which configuration has to be fetched. Can be `null` or `undefined`.
	 * @param section - Section of the configuraion. Can be `null` or `undefined`.
	 *
	 */
	getValue<T>(resource: URI, section?: string): T;
	getValue<T>(resource: URI, position?: IPosition, section?: string): T;

}

export const ITextResourcePropertiesService = createDecorator<ITextResourcePropertiesService>('textResourcePropertiesService');

export interface ITextResourcePropertiesService {

	_serviceBrand: any;

	/**
	 * Returns the End of Line characters for the given resource
	 */
	getEOL(resource: URI | null | undefined, language?: string): string;
}