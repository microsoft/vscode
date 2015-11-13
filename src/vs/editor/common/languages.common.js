/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
require.config({
	ignoreDuplicateModules: [
		// Both TypeScript and JavaScript are referencing and including these
		'vs/languages/typescript/common/features/tokenization',

		'vs/languages/typescript/common/features/quickFixMainActions',
		'vs/nls!vs/languages/typescript/common/features/quickFixMainActions',

		'vs/languages/typescript/common/typescript',

		'vs/languages/typescript/common/typescriptMode',
		'vs/nls!vs/languages/typescript/common/typescriptMode',

		'vs/languages/javascript/common/javascript.extensions',

		// Both markdown and html are referencing and including:
		'vs/languages/html/common/htmlTokenTypes',
	]
});
define([
	// base common
	'vs/base/common/json',
	'vs/base/common/uri',
	'vs/base/common/network',
	'vs/base/common/arrays',
	'vs/base/common/collections',
	'vs/base/common/lifecycle',
	'vs/base/common/async',
	'vs/base/common/glob',
	'vs/base/common/events',

	// platform common
	'vs/platform/configuration/common/configurationRegistry',
	'vs/platform/files/common/files',
	'vs/platform/search/common/search',
	'vs/platform/request/common/request',
	'vs/platform/workspace/common/workspace',
	'vs/platform/telemetry/common/telemetry',

	// Editor common
	'vs/editor/common/editorCommon',
	'vs/editor/common/modes/modesRegistry',
	'vs/editor/common/modes/monarch/monarch',
	'vs/editor/common/modes/monarch/monarchCompile',
	'vs/editor/common/modes/textToHtmlTokenizer',
	'vs/editor/common/services/modeService',
	'vs/editor/common/services/modelService',

	// Load plain/text in all environments because markdown & html (at least) expect it to be defined
	'vs/languages/plaintext/common/plaintext'
], function() {
	'use strict';
});