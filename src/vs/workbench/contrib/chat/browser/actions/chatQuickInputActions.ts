/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { AskQuickQuestionAction } from 'vs/workbench/contrib/chat/browser/actions/quickQuestionActions/quickQuestionAction';

import 'vs/workbench/contrib/chat/browser/actions/quickQuestionActions/singleQuickQuestionAction';
import 'vs/workbench/contrib/chat/browser/actions/quickQuestionActions/multipleByScrollQuickQuestionAction';

export function registerChatQuickQuestionActions() {
	registerAction2(AskQuickQuestionAction);
}
