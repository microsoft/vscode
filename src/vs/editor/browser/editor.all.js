/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
define([
	'vs/editor/browser/widget/codeEditorWidget',
	'vs/editor/browser/widget/diffEditorWidget',

	'vs/editor/contrib/clipboard/browser/clipboard',
	'vs/editor/contrib/codelens/browser/codelens',
	'vs/editor/contrib/color/browser/color',
	'vs/editor/contrib/comment/common/comment',
	'vs/editor/contrib/contextmenu/browser/contextmenu',
	'vs/editor/contrib/diffNavigator/common/diffNavigator',
	'vs/editor/contrib/find/browser/find',
	'vs/editor/contrib/format/common/formatActions',
	'vs/editor/contrib/goToDeclaration/browser/goToDeclaration',
	'vs/editor/contrib/gotoError/browser/gotoError',
	'vs/editor/contrib/hover/browser/hover',
	'vs/editor/contrib/inPlaceReplace/common/inPlaceReplace',
	'vs/editor/contrib/iPadShowKeyboard/browser/iPadShowKeyboard',
	'vs/editor/contrib/linesOperations/common/linesOperations',
	'vs/editor/contrib/links/browser/links',
	'vs/editor/contrib/multicursor/common/multicursor',
	'vs/editor/contrib/outlineMarker/browser/outlineMarker',
	'vs/editor/contrib/parameterHints/browser/parameterHints',
	'vs/editor/contrib/quickFix/browser/quickFix',
	'vs/editor/contrib/referenceSearch/browser/referenceSearch',
	'vs/editor/contrib/rename/browser/rename2',
	'vs/editor/contrib/smartSelect/common/smartSelect',
	'vs/editor/contrib/smartSelect/common/jumpToBracket',
	'vs/editor/contrib/snippet/common/snippet',
	'vs/editor/contrib/snippet/browser/snippet',
	'vs/editor/contrib/suggest/browser/suggest',
	'vs/editor/contrib/toggleTabFocusMode/common/toggleTabFocusMode',
	'vs/editor/contrib/wordHighlighter/common/wordHighlighter',
	'vs/editor/contrib/workerStatusReporter/browser/workerStatusReporter',
	'vs/editor/contrib/defineKeybinding/browser/defineKeybinding',

	// include these in the editor bundle because they are widely used by many languages
	'vs/editor/common/languages.common'

], function() {
	'use strict';

});