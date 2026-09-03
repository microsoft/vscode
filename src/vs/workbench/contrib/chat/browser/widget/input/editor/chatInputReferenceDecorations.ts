/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { themeColorFromId } from '../../../../../../../base/common/themables.js';
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js';
import { TrackedRangeStickiness } from '../../../../../../../editor/common/model.js';
import { dynamicVariableDecorationType } from '../../../attachments/chatDynamicVariables.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../../common/widget/chatColors.js';

export function registerChatInputReferenceDecorationType(codeEditorService: ICodeEditorService, decorationType = dynamicVariableDecorationType): IDisposable {
	return codeEditorService.registerDecorationType('chat', decorationType, {
		color: themeColorFromId(chatSlashCommandForeground),
		backgroundColor: themeColorFromId(chatSlashCommandBackground),
		borderRadius: '3px',
		rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	});
}
