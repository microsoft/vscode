/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InsertSpaces } from './indentation.js';

export const EDITOR_MODEL_DEFAULTS = {
	tabSize: 4,
	indentSize: 4,
	insertSpaces: InsertSpaces.Spaces,
	detectIndentation: true,
	trimAutoWhitespace: true,
	largeFileOptimizations: true,
	bracketPairColorizationOptions: {
		enabled: true,
		independentColorPoolPerBracketType: false,
	},
};
