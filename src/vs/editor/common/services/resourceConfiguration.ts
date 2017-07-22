/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IPosition } from 'vs/editor/common/core/position';

export const ITextResourceConfigurationService = createDecorator<ITextResourceConfigurationService>('textResourceConfigurationService');

export interface ITextResourceConfigurationService {

	_serviceBrand: any;

	/**
	 * Event that fires when the configuration changes.
	 */
	onDidUpdateConfiguration: Event<void>;

	/**
	 * Fetches the appropriate section of the for the given resource with appropriate overrides (e.g. language).
	 * This will be an object keyed off the section name.
	 *
	 * @param resource - Resource for which the configuration has to be fetched. Can be `null` or `undefined`.
	 * @param postion - Position in the resource for which configuration has to be fetched. Can be `null` or `undefined`.
	 * @param section - Section of the configuraion. Can be `null` or `undefined`.
	 *
	 */
	getConfiguration<T>(resource: URI, section?: string): T;
	getConfiguration<T>(resource: URI, position?: IPosition, section?: string): T;

}