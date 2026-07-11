/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { DebugAgentHostInDevToolsAction } from '../../../../../workbench/contrib/chat/electron-browser/actions/debugAgentHostAction.js';
import '../../../../../workbench/contrib/chat/electron-browser/actions/exportAgentHostDebugLogsService.js';
import { ProfileAgentHostAction, StopAgentHostProfileAction } from '../../../../../workbench/contrib/chat/electron-browser/actions/profileAgentHostAction.js';

registerAction2(DebugAgentHostInDevToolsAction);
registerAction2(ProfileAgentHostAction);
registerAction2(StopAgentHostProfileAction);
