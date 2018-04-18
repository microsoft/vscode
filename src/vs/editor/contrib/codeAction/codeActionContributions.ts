/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEditorAction, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { SourceAction, QuickFixController, QuickFixAction, CodeActionCommand, RefactorAction } from 'vs/editor/contrib/codeAction/codeActionCommands';


registerEditorContribution(QuickFixController);
registerEditorAction(QuickFixAction);
registerEditorAction(RefactorAction);
registerEditorAction(SourceAction);
registerEditorCommand(new CodeActionCommand());
