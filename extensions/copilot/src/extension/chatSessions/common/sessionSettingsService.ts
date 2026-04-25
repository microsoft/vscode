/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Describes a settings file with its location type, parsed settings, and URI.
 */
export interface SessionSettingsFile<TLocationType extends string, TSettings> {
	type: TLocationType;
	settings: TSettings;
	uri: URI;
}

/**
 * Describes a settings location: the enum value and how to derive URIs from workspace folders / user home.
 */
export interface SessionSettingsLocationDescriptor<TLocationType extends string> {
	type: TLocationType;
	/**
	 * Returns the URIs for this location given the workspace folders and user home.
	 */
	getUris(workspaceFolders: readonly URI[], userHome: URI): URI[];
	/**
	 * Sort priority — lower numbers come first (higher precedence).
	 */
	priority: number;
}

/**
 * Base interface for session settings services that read/write JSON settings files.
 * Generic over the location enum and the settings shape.
 */
export interface ISessionSettingsService<TLocationType extends string, TSettings> {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when any settings file changes on disk.
	 */
	readonly onDidChange: Event<void>;

	/**
	 * Returns the settings from all settings files as separate objects,
	 * ordered by precedence (highest priority first).
	 */
	readAllSettings(): Promise<Readonly<SessionSettingsFile<TLocationType, TSettings>[]>>;

	/**
	 * Reads a single settings file as a typed object.
	 * Returns a default empty object if the file doesn't exist or can't be parsed.
	 */
	readSettingsFile(uri: URI): Promise<TSettings>;

	/**
	 * Writes settings to the given URI.
	 */
	writeSettingsFile(uri: URI, settings: TSettings): Promise<void>;

	/**
	 * Returns known settings URIs. If location is provided, returns only the URIs for that location.
	 */
	getUris(location?: TLocationType): URI[];

	/**
	 * Returns the settings URI for the given location closest to the given workspace URI.
	 */
	getUri(location: TLocationType, workspaceUri: URI): URI;
}
