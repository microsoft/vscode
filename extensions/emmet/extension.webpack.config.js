/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'path';

import withDefaults from '../shared.webpack.config.mjs';

export default withDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/node/emmetNodeMain.ts',
	},
	output: {
		path: path.join(import.meta.dirname, 'dist', 'node'),
		filename: 'emmetNodeMain.js'
	}
});
