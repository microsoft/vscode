/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startExtensionHostProcess } from 'vs/workbench/services/extensions/node/extensionHostProcessSetup';
import { createRemoteURITransformer } from 'vs/agent/remoteUriTransformer';

startExtensionHostProcess(
	initData => initData.remoteAuthority ? createRemoteURITransformer(initData.remoteAuthority) : null
).catch((err) => console.log(err));
