/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { CancelAction, InlineChatQuickVoice, StartAction, StopAction } from 'vs/workbench/contrib/inlineChat/electron-sandbox/inlineChatQuickVoice';
import { HoldToSpeak } from './inlineChatActions';

// start and hold for voice

registerAction2(HoldToSpeak);

// quick voice

registerEditorContribution(InlineChatQuickVoice.ID, InlineChatQuickVoice, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors
registerAction2(StartAction);
registerAction2(StopAction);
registerAction2(CancelAction);
