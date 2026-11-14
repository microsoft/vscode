/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Plugin } from '@oxlint/plugins';
import commaDangle from './stylistic/comma-dangle.ts';
import memberDelimiterStyle from './stylistic/member-delimiter-style.ts';
import noExtraSemi from './stylistic/no-extra-semi.ts';
import semi from './stylistic/semi.ts';

/**
 * The rules of `@stylistic/eslint-plugin` that this repository uses, under the same plugin and rule names.
 */
export default {
	meta: { name: '@stylistic' },
	rules: {
		'comma-dangle': commaDangle,
		'member-delimiter-style': memberDelimiterStyle,
		'no-extra-semi': noExtraSemi,
		'semi': semi,
	},
} satisfies Plugin;
