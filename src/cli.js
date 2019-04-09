/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const bootstrap = require('./bootstrap');

bootstrap.avoidMonkeyPatchFromAppInsights();

bootstrap.configurePortable();

bootstrap.enableASARSupport();

require('./bootstrap-amd').load('vs/code/node/cli');
