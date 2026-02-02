/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';

export const Categories = Object.freeze({
	View: { value: localize('view', "View"), original: 'View' },
	Help: { value: localize('help', "Help"), original: 'Help' },
	Test: { value: localize('test', "Test"), original: 'Test' },
	File: { value: localize('file', "File"), original: 'File' },
	Preferences: { value: localize('preferences', "Preferences"), original: 'Preferences' },
	Developer: { value: localize({ key: 'developer', comment: ['A developer on Code itself or someone diagnosing issues in Code'] }, "Developer"), original: 'Developer' }
});
