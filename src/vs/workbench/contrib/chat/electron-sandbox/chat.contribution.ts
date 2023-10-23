/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineVoiceChatAction, QuickVoiceChatAction, StartVoiceChatAction, StopInlineVoiceChatAction, StopQuickVoiceChatAction, StopVoiceChatAction, StopVoiceChatAndSubmitAction, StopVoiceChatInChatEditorAction, StopVoiceChatInChatViewAction, VoiceChatInChatViewAction } from 'vs/workbench/contrib/chat/electron-sandbox/actions/voiceChatActions';
import { registerAction2 } from 'vs/platform/actions/common/actions';

registerAction2(StartVoiceChatAction);

registerAction2(VoiceChatInChatViewAction);
registerAction2(QuickVoiceChatAction);
registerAction2(InlineVoiceChatAction);

registerAction2(StopVoiceChatAction);
registerAction2(StopVoiceChatAndSubmitAction);

registerAction2(StopVoiceChatInChatViewAction);
registerAction2(StopVoiceChatInChatEditorAction);
registerAction2(StopQuickVoiceChatAction);
registerAction2(StopInlineVoiceChatAction);

