/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {IEventEmitter} from 'vs/base/common/eventEmitter';
import Event from 'vs/base/common/event';
import winjs = require('vs/base/common/winjs.base');

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationService extends IEventEmitter {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Fetches the appropriate section of the configuration JSON file.
	 * This will be an object keyed off the section name.
	 */
	loadConfiguration(section?: string): winjs.TPromise<any>;

	/**
	 * Returns iff the workspace has configuration or not.
	 */
	hasWorkspaceConfiguration(): boolean;

	/**
	 * Event that fires when the configuration changes.
	 */
	onDidUpdateConfiguration: Event<{ config: any }>;
}

export class ConfigurationServiceEventTypes {

	/**
	 * This event happens after configuration is updated either programmatically
	 * or through a file change. It will include a IConfigurationServiceEvent
	 * object that includes the new config and which section was updated
	 * or null if entire config was updated.
	 *
	 * Subscribers can use the provided updated configuration
	 * rather than re-pulling for updates
	 */
	public static UPDATED = 'update';
}

export interface IConfigurationServiceEvent {
	section?: string;
	config: any;
}

export function extractSetting(config: any, settingPath: string): any {
	function accessSetting(config: any, path: string[]): any {
		let current = config;
		for (let i = 0; i < path.length; i++) {
			current = current[path[i]];
			if (!current) {
				return undefined;
			}
		}
		return current;
	}

	let path = settingPath.split('.');
	return accessSetting(config, path);
}