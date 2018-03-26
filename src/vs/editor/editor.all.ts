/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/editor/browser/controller/coreCommands';
import 'vs/editor/browser/widget/codeEditorWidget';
import 'vs/editor/browser/widget/diffEditorWidget';
import 'vs/editor/browser/widget/diffNavigator';

import 'vs/editor/contrib/bracketMatching/bracketMatching';
import 'vs/editor/contrib/caretOperations/caretOperations';
import 'vs/editor/contrib/caretOperations/transpose';
import 'vs/editor/contrib/clipboard/clipboard';
import 'vs/editor/contrib/codelens/codelensController';
import 'vs/editor/contrib/colorPicker/colorDetector';
import 'vs/editor/contrib/comment/comment';
import 'vs/editor/contrib/contextmenu/contextmenu';
import 'vs/editor/contrib/cursorUndo/cursorUndo';
import 'vs/editor/contrib/dnd/dnd';
import 'vs/editor/contrib/find/findController';
import 'vs/editor/contrib/folding/folding';
import 'vs/editor/contrib/review/review';
import 'vs/editor/contrib/format/formatActions';
import 'vs/editor/contrib/goToDeclaration/goToDeclarationCommands';
import 'vs/editor/contrib/goToDeclaration/goToDeclarationMouse';
import 'vs/editor/contrib/gotoError/gotoError';
import 'vs/editor/contrib/hover/hover';
import 'vs/editor/contrib/inPlaceReplace/inPlaceReplace';
import 'vs/editor/contrib/linesOperations/linesOperations';
import 'vs/editor/contrib/links/links';
import 'vs/editor/contrib/multicursor/multicursor';
import 'vs/editor/contrib/parameterHints/parameterHints';
import 'vs/editor/contrib/quickFix/quickFixCommands';
import 'vs/editor/contrib/referenceSearch/referenceSearch';
import 'vs/editor/contrib/rename/rename';
import 'vs/editor/contrib/smartSelect/smartSelect';
import 'vs/editor/contrib/snippet/snippetController2';
import 'vs/editor/contrib/suggest/suggestController';
import 'vs/editor/contrib/toggleTabFocusMode/toggleTabFocusMode';
import 'vs/editor/contrib/wordHighlighter/wordHighlighter';
import 'vs/editor/contrib/wordOperations/wordOperations';
