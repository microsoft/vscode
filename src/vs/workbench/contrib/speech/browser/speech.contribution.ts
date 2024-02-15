/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { EditorDictation, EditorDictationCancelAction, EditorDictationStartAction, EditorDictationStopAction } from 'vs/workbench/contrib/speech/browser/editorDictation';

registerEditorContribution(EditorDictation.ID, EditorDictation, EditorContributionInstantiation.Lazy);
registerAction2(EditorDictationStartAction);
registerAction2(EditorDictationStopAction);
registerAction2(EditorDictationCancelAction);
