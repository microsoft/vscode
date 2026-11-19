/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari } from '../../browser/browser.js';

/**
 * Whether the tests run in WebKit on Linux, Playwright's port, which the merge queue runs. It reports the user agent
 * of Safari on macOS, so `isLinux` is false there, but the platform of Linux. A test that fails there for a reason of
 * the port, such as an image it can't decode, while it passes in Chromium and in WebKit on macOS, skips itself:
 * `(isLinuxWebKit ? test.skip : test)(...)`.
 */
export const isLinuxWebKit = isSafari && typeof navigator === 'object' && navigator.platform.startsWith('Linux');