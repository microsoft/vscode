/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Plugin } from '@oxlint/plugins';
import noBufferConstructor from './eslintJs/no-buffer-constructor.ts';
import noRestrictedSyntax from './eslintJs/no-restricted-syntax.ts';

/**
 * Our implementations of the ESLint core rules that oxlint does not implement natively, under the plugin name that the
 * configuration and the disable directives use. They behave and report like ESLint's rules.
 */
export default {
	meta: { name: 'eslint-js' },
	rules: {
		'no-buffer-constructor': noBufferConstructor,
		'no-restricted-syntax': noRestrictedSyntax,
	},
} satisfies Plugin;
