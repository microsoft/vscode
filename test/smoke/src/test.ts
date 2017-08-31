/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testSettings } from './areas/preferences/settings.test';
import { testKeybindings } from './areas/preferences/keybindings.test';

describe('Smoke:', () => {
	testSettings();
	testKeybindings();
});