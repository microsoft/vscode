/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { startExtensionHostProcess } from 'vs/workbench/services/extensions/node/extensionHostProcessSetup';

startExtensionHostProcess().catch((err) => console.log(err));
