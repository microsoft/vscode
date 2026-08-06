/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { FileEditInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import type * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { URI } from '../../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ClaudeToolPermissionContext } from '../../common/claudeToolPermission';
import { ClaudeToolNames } from '../../common/claudeTools';
import { EditToolHandler } from '../toolPermissionHandlers/editToolHandler';

describe('EditToolHandler', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let handler: EditToolHandler;

	const workspaceFile = '/workspace/file.ts';
	const outsideFile = '/Users/victim/.bashrc';

	beforeEach(() => {
		const services = createExtensionUnitTestingServices();
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[[URI.file('/workspace')], []]
		));
		accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		handler = instantiationService.createInstance(EditToolHandler);
	});

	afterEach(() => {
		accessor.dispose();
	});

	function createContext(permissionMode?: PermissionMode): ClaudeToolPermissionContext {
		return {
			toolInvocationToken: {} as vscode.ChatParticipantToolToken,
			permissionMode
		};
	}

	function canAutoApprove(filePath: string, permissionMode?: PermissionMode): Promise<boolean> {
		const input: FileEditInput = { file_path: filePath, old_string: 'a', new_string: 'b' };
		return handler.canAutoApprove(ClaudeToolNames.Edit, input, createContext(permissionMode));
	}

	describe('acceptEdits mode', () => {
		it('auto-approves edits to files inside the workspace', async () => {
			expect(await canAutoApprove(workspaceFile, 'acceptEdits')).toBe(true);
		});

		it('does NOT auto-approve edits to files outside the workspace', async () => {
			// Regression test for MSRC 115876: acceptEdits must not bypass the
			// workspace boundary for files outside the workspace.
			expect(await canAutoApprove(outsideFile, 'acceptEdits')).toBe(false);
		});
	});

	describe('default mode', () => {
		it('never auto-approves, even inside the workspace', async () => {
			expect(await canAutoApprove(workspaceFile, 'default')).toBe(false);
			expect(await canAutoApprove(outsideFile, 'default')).toBe(false);
		});
	});

	describe('bypassPermissions mode', () => {
		it('auto-approves everything by design', async () => {
			expect(await canAutoApprove(workspaceFile, 'bypassPermissions')).toBe(true);
			expect(await canAutoApprove(outsideFile, 'bypassPermissions')).toBe(true);
		});
	});

	describe('no permission mode specified', () => {
		it('only auto-approves files within the workspace', async () => {
			expect(await canAutoApprove(workspaceFile, undefined)).toBe(true);
			expect(await canAutoApprove(outsideFile, undefined)).toBe(false);
		});
	});
});
