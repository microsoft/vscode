/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This file is the web embedder entry point for the Sessions workbench.
// It mirrors workbench.web.main.internal.ts but loads the sessions entry
// point and factory instead of the standard workbench ones.

import './sessions.web.main.js';
import { create } from './browser/web.factory.js';
import { URI } from '../base/common/uri.js';
import { Event, Emitter } from '../base/common/event.js';
import { Disposable } from '../base/common/lifecycle.js';
import { LogLevel } from '../platform/log/common/log.js';

export {
	create,
	URI,
	Event,
	Emitter,
	Disposable,
	LogLevel,
};
