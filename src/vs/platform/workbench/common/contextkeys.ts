/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { isMacintosh, isLinux, isWindows } from 'vs/base/common/platform';

export const InputFocusedContextKey = 'inputFocus';
export const InputFocusedContext = new RawContextKey<boolean>(InputFocusedContextKey, false);
export const IsMacContext = new RawContextKey<boolean>('isMac', isMacintosh);
export const IsLinuxContext = new RawContextKey<boolean>('isLinux', isLinux);
export const IsWindowsContext = new RawContextKey<boolean>('isWindows', isWindows);
