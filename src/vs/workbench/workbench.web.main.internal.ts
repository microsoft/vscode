/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//
// Do NOT change these exports in a way that something is removed unless
// intentional. These exports are used by web embedders and thus require
// an adoption when something changes.
//
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

import './workbench.web.main.js';
import { create, commands, env, window, workspace, logger } from './browser/web.factory.js';
import { Menu } from './browser/web.api.js';
import { URI } from '../base/common/uri.js';
import { Event, Emitter } from '../base/common/event.js';
import { Disposable } from '../base/common/lifecycle.js';
import { GroupOrientation } from './services/editor/common/editorGroupsService.js';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from '../platform/remote/common/remoteAuthorityResolver.js';
import { LogLevel } from '../platform/log/common/log.js';

export {

	// Factory
	create,

	// Basic Types
	URI,
	Event,
	Emitter,
	Disposable,
	GroupOrientation,
	LogLevel,
	RemoteAuthorityResolverError,
	RemoteAuthorityResolverErrorCode,

	// Facade API
	env,
	window,
	workspace,
	commands,
	logger,
	Menu
};
