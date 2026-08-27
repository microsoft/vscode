/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { basename, extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ISession } from '../../../sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../sessions/browser/sessionsService.js';
import { SessionsWorkspaceFolderLabelService } from '../../browser/workspaceFolderLabelService.js';

suite('Sessions - Workspace Folder Label Service', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses repository identity for plain and verbose worktree labels', () => {
		const repository = URI.file('/repos/vscode-tools');
		const workingDirectory = URI.file('/worktrees/add-sandeep-to-readme-26eb9789');
		const session = new class extends mock<ISession>() {
			override readonly workspace = observableValue(this, {
				uri: repository,
				label: 'vscode-tools',
				icon: { id: 'folder' },
				folders: [{
					root: repository,
					workingDirectory,
					name: 'microsoft/vscode-tools',
					description: undefined,
					gitRepository: {
						uri: repository,
						workTreeUri: workingDirectory,
						branchName: 'add-sandeep-to-readme-26eb9789',
						baseBranchName: undefined,
						gitHubInfo: observableValue(this, undefined),
					}
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			});
		};
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>(this, new class extends mock<IActiveSession>() {
				override readonly workspace = session.workspace;
			});
		};
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		};
		const labelService = new class extends mock<ILabelService>() {
			override getUriBasenameLabel(resource: URI): string {
				return basename(resource);
			}
		};
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessions(): ISession[] {
				return [session];
			}
		};
		const service = new SessionsWorkspaceFolderLabelService(sessionsService, sessionsManagementService, uriIdentityService, labelService);
		const workspaceFolder = new WorkspaceFolder({ uri: workingDirectory, name: 'vscode-tools (add-sandeep-to-readme-26eb9789)', index: 0 });

		assert.deepStrictEqual({
			plain: service.getWorkspaceFolderLabel(workspaceFolder),
			verbose: service.getWorkspaceFolderLabel(workspaceFolder, true),
		}, {
			plain: 'microsoft/vscode-tools',
			verbose: 'microsoft/vscode-tools (add-sandeep-to-readme-26eb9789)',
		});
	});

	test('falls back to a managed session when the active session does not own the folder', () => {
		const repository = URI.file('/repos/vscode-tools');
		const workingDirectory = URI.file('/worktrees/feature');
		const session = new class extends mock<ISession>() {
			override readonly workspace = observableValue(this, {
				uri: repository,
				label: 'vscode-tools',
				icon: { id: 'folder' },
				folders: [{ root: repository, workingDirectory, name: 'vscode-tools', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			});
		};
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>(this, undefined);
		};
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override getSessions(): ISession[] {
				return [session];
			}
		};
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		};
		const labelService = new class extends mock<ILabelService>() {
			override getUriBasenameLabel(resource: URI): string {
				return basename(resource);
			}
		};
		const service = new SessionsWorkspaceFolderLabelService(sessionsService, sessionsManagementService, uriIdentityService, labelService);

		assert.strictEqual(service.getWorkspaceFolderLabel(new WorkspaceFolder({ uri: workingDirectory, name: 'feature', index: 0 })), 'vscode-tools');
	});
});
