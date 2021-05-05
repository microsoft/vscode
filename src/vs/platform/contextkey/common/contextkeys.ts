/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { isMacintosh, isLinux, isWindows, isWeb } from 'vs/base/common/platform';

export const IsMacContext = new RawContextKey<boolean>('isMac', isMacintosh, localize('isMac', "Whether the operating system is macOS"));
export const IsLinuxContext = new RawContextKey<boolean>('isLinux', isLinux, localize('isLinux', "Whether the operating system is Linux"));
export const IsWindowsContext = new RawContextKey<boolean>('isWindows', isWindows, localize('isWindows', "Whether the operating system is Windows"));

export const IsWebContext = new RawContextKey<boolean>('isWeb', isWeb, localize('isWeb', "Whether the platform is a web browser"));
export const IsMacNativeContext = new RawContextKey<boolean>('isMacNative', isMacintosh && !isWeb, localize('isMacNative', "Whether the operating system is macOS on a non-browser platform"));

export const IsDevelopmentContext = new RawContextKey<boolean>('isDevelopment', false, true);

export const InputFocusedContextKey = 'inputFocus';
export const InputFocusedContext = new RawContextKey<boolean>(InputFocusedContextKey, false, localize('inputFocus', "Whether keyboard focus is inside an input box"));
