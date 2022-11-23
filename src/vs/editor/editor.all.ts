/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/editor/browser/coreCommands';
import 'vs/editor/browser/widget/codeEditorWidget';
import 'vs/editor/browser/widget/diffEditorWidget';
import 'vs/editor/browser/widget/diffNavigator';
import 'vs/editor/contrib/anchorSelect/browser/anchorSelect';
import 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'vs/editor/contrib/caretOperations/browser/caretOperations';
import 'vs/editor/contrib/caretOperations/browser/transpose';
import 'vs/editor/contrib/clipboard/browser/clipboard';
import 'vs/editor/contrib/codeAction/browser/codeActionContributions';
import 'vs/editor/contrib/codelens/browser/codelensController';
import 'vs/editor/contrib/colorPicker/browser/colorContributions';
import 'vs/editor/contrib/copyPaste/browser/copyPasteContribution';
import 'vs/editor/contrib/comment/browser/comment';
import 'vs/editor/contrib/contextmenu/browser/contextmenu';
import 'vs/editor/contrib/cursorUndo/browser/cursorUndo';
import 'vs/editor/contrib/dnd/browser/dnd';
import 'vs/editor/contrib/dropIntoEditor/browser/dropIntoEditorContribution';
import 'vs/editor/contrib/find/browser/findController';
import 'vs/editor/contrib/folding/browser/folding';
import 'vs/editor/contrib/fontZoom/browser/fontZoom';
import 'vs/editor/contrib/format/browser/formatActions';
import 'vs/editor/contrib/documentSymbols/browser/documentSymbols';
import 'vs/editor/contrib/inlineCompletions/browser/ghostText.contribution';
import 'vs/editor/contrib/gotoSymbol/browser/goToCommands';
import 'vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition';
import 'vs/editor/contrib/gotoError/browser/gotoError';
import 'vs/editor/contrib/hover/browser/hover';
import 'vs/editor/contrib/indentation/browser/indentation';
import 'vs/editor/contrib/inlayHints/browser/inlayHintsContribution';
import 'vs/editor/contrib/inPlaceReplace/browser/inPlaceReplace';
import 'vs/editor/contrib/lineSelection/browser/lineSelection';
import 'vs/editor/contrib/linesOperations/browser/linesOperations';
import 'vs/editor/contrib/linkedEditing/browser/linkedEditing';
import 'vs/editor/contrib/links/browser/links';
import 'vs/editor/contrib/longLinesHelper/browser/longLinesHelper';
import 'vs/editor/contrib/multicursor/browser/multicursor';
import 'vs/editor/contrib/parameterHints/browser/parameterHints';
import 'vs/editor/contrib/rename/browser/rename';
import 'vs/editor/contrib/stickyScroll/browser/stickyScrollContribution';
import 'vs/editor/contrib/smartSelect/browser/smartSelect';
import 'vs/editor/contrib/snippet/browser/snippetController2';
import 'vs/editor/contrib/suggest/browser/suggestController';
import 'vs/editor/contrib/suggest/browser/suggestInlineCompletions';
import 'vs/editor/contrib/tokenization/browser/tokenization';
import 'vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import 'vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter';
import 'vs/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators';
import 'vs/editor/contrib/viewportSemanticTokens/browser/viewportSemanticTokens';
import 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import 'vs/editor/contrib/wordOperations/browser/wordOperations';
import 'vs/editor/contrib/wordPartOperations/browser/wordPartOperations';
import 'vs/editor/contrib/readOnlyMessage/browser/contribution';

// Load up these strings even in VSCode, even if they are not used
// in order to get them translated
import 'vs/editor/common/standaloneStrings';

import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicons are defined here and must be loaded
