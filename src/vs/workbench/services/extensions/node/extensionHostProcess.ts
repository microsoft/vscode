/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { startExtensionHostProcess } from 'vs/workbench/services/extensions/node/extensionHostProcessSetup';

startExtensionHostProcess(
	_ => null,
	_ => null,
	_ => nls.localize('extension host Log', "Extension Host")
).catch((err) => console.log(err));
