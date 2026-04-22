/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileEditInput, FileWriteInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { isFileOkForTool } from '../../../../tools/node/toolUtils';
import { ClaudeToolPermissionContext, IClaudeToolPermissionHandler } from '../../common/claudeToolPermission';
import { registerToolPermissionHandler } from '../../common/claudeToolPermissionRegistry';
import { ClaudeToolNames } from '../../common/claudeTools';

type EditToolName = ClaudeToolNames.Edit | ClaudeToolNames.Write | ClaudeToolNames.MultiEdit;

/**
 * Handler for edit tools (Edit, Write, MultiEdit).
 * Auto-approves edits to files within the workspace, or when permission mode is 'acceptEdits'.
 */
export class EditToolHandler implements IClaudeToolPermissionHandler<EditToolName> {
	public readonly toolNames = [ClaudeToolNames.Edit, ClaudeToolNames.Write, ClaudeToolNames.MultiEdit] as const;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	public async canAutoApprove(
		_toolName: EditToolName,
		input: FileEditInput | FileWriteInput,
		context: ClaudeToolPermissionContext
	): Promise<boolean> {
		// Auto-approve all edits in 'acceptEdits' mode
		if (context.permissionMode === 'acceptEdits') {
			return true;
		} else if (context.permissionMode === 'bypassPermissions') {
			return true;
		} else if (context.permissionMode === 'default') {
			return false;
		}
		// Otherwise, only auto-approve files within the workspace
		return this.instantiationService.invokeFunction(isFileOkForTool, URI.file(input.file_path));
	}
}

// Self-register the handler
registerToolPermissionHandler(
	[ClaudeToolNames.Edit, ClaudeToolNames.Write, ClaudeToolNames.MultiEdit],
	EditToolHandler
);
