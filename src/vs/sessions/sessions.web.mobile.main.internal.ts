/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This file is the web embedder entry point for the mobile Sessions workbench.
// It mirrors sessions.web.main.internal.ts but loads the allow-listed mobile
// entry point and creates the mobile workbench.

import './sessions.web.mobile.main.js';
import { create as createSessionsWorkbench } from './browser/web.factory.js';
import { createMobileSessionsWorkbench } from './browser/mobile/mobileWorkbench.js';
import { IWorkbenchConstructionOptions } from '../workbench/browser/web.api.js';
import { Disposable, IDisposable } from '../base/common/lifecycle.js';
import { URI } from '../base/common/uri.js';
import { Event, Emitter } from '../base/common/event.js';
import { LogLevel } from '../platform/log/common/log.js';

/**
 * Creates the mobile Sessions workbench in the provided container.
 */
function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): IDisposable {
	return createSessionsWorkbench(domElement, options, createMobileSessionsWorkbench);
}

export {
	create,
	URI,
	Event,
	Emitter,
	Disposable,
	LogLevel,
};
