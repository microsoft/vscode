/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/editor/browser/widget/codeEditorWidget';
import 'vs/editor/browser/widget/diffEditorWidget';

import 'vs/editor/contrib/bracketMatching/common/bracketMatching';
import 'vs/css!vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'vs/editor/contrib/caretOperations/common/caretOperations';
import 'vs/editor/contrib/caretOperations/common/transpose';
import 'vs/editor/contrib/clipboard/browser/clipboard';
import 'vs/editor/contrib/codelens/browser/codelens';
import 'vs/editor/contrib/comment/common/comment';
import 'vs/editor/contrib/contextmenu/browser/contextmenu';
import 'vs/editor/contrib/diffNavigator/common/diffNavigator';
import 'vs/editor/contrib/dnd/browser/dnd';
import 'vs/editor/contrib/find/browser/find';
import 'vs/editor/contrib/folding/browser/folding';
import 'vs/editor/contrib/format/browser/formatActions';
import 'vs/editor/contrib/goToDeclaration/browser/goToDeclaration';
import 'vs/editor/contrib/gotoError/browser/gotoError';
import 'vs/editor/contrib/hover/browser/hover';
import 'vs/css!vs/editor/contrib/inPlaceReplace/browser/inPlaceReplace';
import 'vs/editor/contrib/inPlaceReplace/common/inPlaceReplace';
import 'vs/editor/contrib/iPadShowKeyboard/browser/iPadShowKeyboard';
import 'vs/editor/contrib/linesOperations/common/linesOperations';
import 'vs/editor/contrib/links/browser/links';
import 'vs/editor/contrib/multicursor/common/multicursor';
import 'vs/editor/contrib/multicursor/browser/menuPreventer';
import 'vs/editor/contrib/parameterHints/browser/parameterHints';
import 'vs/editor/contrib/quickFix/browser/quickFixCommands';
import 'vs/editor/contrib/referenceSearch/browser/referenceSearch';
import 'vs/editor/contrib/rename/browser/rename';
import 'vs/editor/contrib/smartSelect/common/smartSelect';
import 'vs/editor/contrib/snippet/common/snippet';
import 'vs/editor/contrib/snippet/browser/snippet';
import 'vs/editor/contrib/suggest/browser/suggestController';
import 'vs/editor/contrib/toggleTabFocusMode/common/toggleTabFocusMode';
import 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import 'vs/editor/contrib/wordOperations/common/wordOperations';
