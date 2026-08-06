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
 * Auto-approves edits to files within the workspace. In 'acceptEdits' mode the
 * workspace boundary is still enforced: edits to files outside the workspace
 * require explicit confirmation. Only 'bypassPermissions' skips the boundary check.
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
		// 'bypassPermissions' explicitly opts out of all permission checks by design.
		if (context.permissionMode === 'bypassPermissions') {
			return true;
		}
		// 'default' mode always requires explicit confirmation.
		if (context.permissionMode === 'default') {
			return false;
		}
		// For 'acceptEdits' (and all other modes), only auto-approve edits to files
		// within the workspace. Edits to files outside the workspace still require
		// explicit confirmation, even in 'acceptEdits' mode, to prevent unauthorized
		// modification of sensitive files (e.g. ~/.bashrc, ~/.ssh/authorized_keys).
		return this.instantiationService.invokeFunction(isFileOkForTool, URI.file(input.file_path));
	}
}

// Self-register the handler
registerToolPermissionHandler(
	[ClaudeToolNames.Edit, ClaudeToolNames.Write, ClaudeToolNames.MultiEdit],
	EditToolHandler
);
