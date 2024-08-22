/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './browser/coreCommands';
import './browser/widget/codeEditor/codeEditorWidget';
import './browser/widget/diffEditor/diffEditor.contribution';
import './contrib/anchorSelect/browser/anchorSelect';
import './contrib/bracketMatching/browser/bracketMatching';
import './contrib/caretOperations/browser/caretOperations';
import './contrib/caretOperations/browser/transpose';
import './contrib/clipboard/browser/clipboard';
import './contrib/codeAction/browser/codeActionContributions';
import './contrib/codelens/browser/codelensController';
import './contrib/colorPicker/browser/colorContributions';
import './contrib/colorPicker/browser/standaloneColorPickerActions';
import './contrib/comment/browser/comment';
import './contrib/contextmenu/browser/contextmenu';
import './contrib/cursorUndo/browser/cursorUndo';
import './contrib/dnd/browser/dnd';
import './contrib/dropOrPasteInto/browser/copyPasteContribution';
import './contrib/dropOrPasteInto/browser/dropIntoEditorContribution';
import './contrib/find/browser/findController';
import './contrib/folding/browser/folding';
import './contrib/fontZoom/browser/fontZoom';
import './contrib/format/browser/formatActions';
import './contrib/documentSymbols/browser/documentSymbols';
import './contrib/inlineCompletions/browser/inlineCompletions.contribution';
import './contrib/inlineProgress/browser/inlineProgress';
import './contrib/gotoSymbol/browser/goToCommands';
import './contrib/gotoSymbol/browser/link/goToDefinitionAtPosition';
import './contrib/gotoError/browser/gotoError';
import './contrib/hover/browser/hoverContribution';
import './contrib/indentation/browser/indentation';
import './contrib/inlayHints/browser/inlayHintsContribution';
import './contrib/inPlaceReplace/browser/inPlaceReplace';
import './contrib/lineSelection/browser/lineSelection';
import './contrib/linesOperations/browser/linesOperations';
import './contrib/linkedEditing/browser/linkedEditing';
import './contrib/links/browser/links';
import './contrib/longLinesHelper/browser/longLinesHelper';
import './contrib/multicursor/browser/multicursor';
import './contrib/inlineEdit/browser/inlineEdit.contribution';
import './contrib/inlineEdits/browser/inlineEdits.contribution';
import './contrib/parameterHints/browser/parameterHints';
import './contrib/placeholderText/browser/placeholderText.contribution';
import './contrib/rename/browser/rename';
import './contrib/sectionHeaders/browser/sectionHeaders';
import './contrib/semanticTokens/browser/documentSemanticTokens';
import './contrib/semanticTokens/browser/viewportSemanticTokens';
import './contrib/smartSelect/browser/smartSelect';
import './contrib/snippet/browser/snippetController2';
import './contrib/stickyScroll/browser/stickyScrollContribution';
import './contrib/suggest/browser/suggestController';
import './contrib/suggest/browser/suggestInlineCompletions';
import './contrib/tokenization/browser/tokenization';
import './contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import './contrib/unicodeHighlighter/browser/unicodeHighlighter';
import './contrib/unusualLineTerminators/browser/unusualLineTerminators';
import './contrib/wordHighlighter/browser/wordHighlighter';
import './contrib/wordOperations/browser/wordOperations';
import './contrib/wordPartOperations/browser/wordPartOperations';
import './contrib/readOnlyMessage/browser/contribution';
import './contrib/diffEditorBreadcrumbs/browser/contribution';

// Load up these strings even in VSCode, even if they are not used
// in order to get them translated
import './common/standaloneStrings';

import '../base/browser/ui/codicons/codiconStyles'; // The codicons are defined here and must be loaded
