/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Plugin } from '@oxlint/plugins';
import namingConvention from './typescriptEslintJs/naming-convention.ts';
import noRestrictedImports from './typescriptEslintJs/no-restricted-imports.ts';

/**
 * Our implementations of the typescript-eslint rules that oxlint does not implement equivalently, under the plugin
 * name that the configuration and the disable directives use. They behave and report like typescript-eslint's rules,
 * for the options that do not need type information.
 */
export default {
	meta: { name: 'ts-eslint-js' },
	rules: {
		'naming-convention': namingConvention,
		'no-restricted-imports': noRestrictedImports,
	},
} satisfies Plugin;
