/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test entry point for the Sessions workbench with mock services.
// Mirrors sessions.web.main.internal.ts but uses TestSessionsBrowserMain.

import '../sessions.web.main.js';
import { create } from './web.test.factory.js';
import { URI } from '../../base/common/uri.js';
import { Event, Emitter } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { LogLevel } from '../../platform/log/common/log.js';

export {
	create,
	URI,
	Event,
	Emitter,
	Disposable,
	LogLevel,
};
