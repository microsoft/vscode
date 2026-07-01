/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provides backward compatibility for settings by mapping old or new value types to the new type.
 *
 * Chat configuration service doesn't have great support for migrating settings between types.
 * This utility function helps to maintain backward compatibility when a setting's type changes.
 *
 * @param settingValue The setting value of the new type.
 * @param map A function that transforms the setting value (which can be either old or new type) to the new type.
 * @returns The mapped setting value of the new type.
 */
export function backwardCompatSetting<TOld, TNew>(settingValue: TNew, map: (oldValue: TOld | TNew) => TNew): TNew {
	return map(settingValue);
}
