/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Plugin } from '@oxlint/plugins';
import checkParamNames from './jsdoc/check-param-names.ts';
import noMultiAsterisks from './jsdoc/no-multi-asterisks.ts';
import noTypes from './jsdoc/no-types.ts';
import requireJsdoc from './jsdoc/require-jsdoc.ts';
import tagLines from './jsdoc/tag-lines.ts';
import validTypes from './jsdoc/valid-types.ts';

/**
 * Our implementation of the rules of `eslint-plugin-jsdoc` that the configuration uses, under the plugin name that the
 * configuration and the disable directives use (oxlint reserves `jsdoc` for its own rules). They behave and report like
 * the originals with the options that the configuration sets.
 */
export default {
	meta: { name: 'jsdoc-js' },
	rules: {
		'check-param-names': checkParamNames,
		'no-multi-asterisks': noMultiAsterisks,
		'no-types': noTypes,
		'require-jsdoc': requireJsdoc,
		'tag-lines': tagLines,
		'valid-types': validTypes,
	},
} satisfies Plugin;
