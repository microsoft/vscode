/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type { IAgentHostCompletionAction, ICommandCompletionAttachmentMeta, ISkillCompletionAttachmentMeta, CompletionAttachmentMeta } from './vscode/agentCompletionAttachmentMeta.js';
export { readCompletionAttachmentMeta, toCommandCompletionAttachmentMeta, getCompletionAction, getCommandArgumentHint, toSkillCompletionAttachmentMeta } from './vscode/agentCompletionAttachmentMeta.js';
