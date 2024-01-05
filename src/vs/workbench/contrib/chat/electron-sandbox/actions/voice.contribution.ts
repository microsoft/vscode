/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { StartTerminalSpeechToTextAction, StopTerminalSpeechToTextAction } from 'vs/workbench/contrib/chat/electron-sandbox/actions/voiceActions';

registerAction2(StartTerminalSpeechToTextAction);
registerAction2(StopTerminalSpeechToTextAction);
