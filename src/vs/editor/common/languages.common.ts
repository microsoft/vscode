/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// base common
import 'vs/base/common/json';
import 'vs/base/common/uri';
import 'vs/base/common/network';
import 'vs/base/common/arrays';
import 'vs/base/common/collections';
import 'vs/base/common/lifecycle';
import 'vs/base/common/async';
import 'vs/base/common/glob';
import 'vs/base/common/events';

// platform common
import 'vs/platform/configuration/common/configurationRegistry';
import 'vs/platform/files/common/files';
import 'vs/platform/search/common/search';
import 'vs/platform/request/common/request';
import 'vs/platform/workspace/common/workspace';
import 'vs/platform/telemetry/common/telemetry';

// Editor common
import 'vs/editor/common/editorCommon';
import 'vs/editor/common/modes/modesRegistry';
import 'vs/editor/common/modes/monarch/monarch';
import 'vs/editor/common/modes/monarch/monarchCompile';
import 'vs/editor/common/modes/textToHtmlTokenizer';
import 'vs/editor/common/services/modeService';
import 'vs/editor/common/services/modelService';

// Modules duplicated in different language bundles
this.require.config({
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
