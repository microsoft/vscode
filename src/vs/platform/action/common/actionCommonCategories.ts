/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../nls.js';

export const Categories = Object.freeze({
	View: localize2('view', 'View'),
	Help: localize2('help', 'Help'),
	Test: localize2('test', 'Test'),
	File: localize2('file', 'File'),
	Preferences: localize2('preferences', 'Preferences'),
	Developer: localize2({ key: 'developer', comment: ['A developer on Code itself or someone diagnosing issues in Code'] }, "Developer"),
});
