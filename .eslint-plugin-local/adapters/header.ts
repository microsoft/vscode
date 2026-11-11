/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fixupPluginRules } from '@eslint/compat';
import type { ESLint } from 'eslint';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * `eslint-plugin-header`, as the `header` plugin that both linters load. It predates the rule APIs of current
 * linters, so its rules go through `fixupPluginRules`, and its options are not validated against a schema.
 */
const pluginHeader = require('eslint-plugin-header');
pluginHeader.rules.header.meta.schema = false;

export default { meta: { name: 'header' }, rules: fixupPluginRules(pluginHeader).rules } satisfies ESLint.Plugin;
