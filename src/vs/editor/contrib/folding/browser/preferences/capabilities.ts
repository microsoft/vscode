/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorFoldingPreferences } from '../../../../common/config/editorOptions.js';

/**
 * Declares which folding preferences are natively supported by the provider.
 *
 * A preference key mapped to `true` indicates native support.
 * Keys that are absent are treated as not natively supported and
 * may trigger adjustments by the folding compatibility layer
 * if explicitly set to a value other than `'auto'`.
 */
export type FoldingPreferencesCapabilities = {
	readonly [K in keyof EditorFoldingPreferences]?: true;
};
