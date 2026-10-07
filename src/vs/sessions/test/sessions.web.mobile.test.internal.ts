/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test entry point for the mobile Sessions workbench with mock services.
// Mirrors sessions.web.mobile.main.internal.ts but uses TestSessionsBrowserMain.

import '../sessions.web.mobile.main.js';
import { create as createTestSessionsWorkbench } from './web.test.factory.js';
import { createMobileSessionsWorkbench } from '../browser/mobile/mobileWorkbench.js';
import { IWorkbenchConstructionOptions } from '../../workbench/browser/web.api.js';
import { Disposable, IDisposable } from '../../base/common/lifecycle.js';
import { URI } from '../../base/common/uri.js';
import { Event, Emitter } from '../../base/common/event.js';
import { LogLevel } from '../../platform/log/common/log.js';

/**
 * Creates the mobile Sessions workbench with mock services for E2E testing.
 */
function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): IDisposable {
	return createTestSessionsWorkbench(domElement, options, createMobileSessionsWorkbench);
}

export {
	create,
	URI,
	Event,
	Emitter,
	Disposable,
	LogLevel,
};
