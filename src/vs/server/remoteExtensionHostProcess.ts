/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { startExtensionHostProcess } from 'vs/workbench/services/extensions/node/extensionHostProcessSetup';

startExtensionHostProcess().catch((err) => console.log(err));
