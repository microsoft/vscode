/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Plugin } from '@oxlint/plugins';
import header from './header/header.ts';

/**
 * Our implementation of `eslint-plugin-header`, under the plugin name that the configuration and the disable directives
 * use. It behaves and reports like the original.
 */
export default {
	meta: { name: 'header' },
	rules: {
		'header': header,
	},
} satisfies Plugin;
