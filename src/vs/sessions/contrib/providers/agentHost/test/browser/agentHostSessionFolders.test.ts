/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isLinux } from '../../../../../../base/common/platform.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../../../../../platform/agentHost/common/agentHostWorkingDirectories.js';
import { withChangesetFolderFailures } from '../../../../../../platform/agentHost/common/meta/agentChangesetFolderFailuresMeta.js';
import { withSessionNonRepositoryFolders } from '../../../../../../platform/agentHost/common/meta/agentSessionNonRepositoryFoldersMeta.js';
import { withSessionRepositories } from '../../../../../../platform/agentHost/common/meta/agentSessionRepositoriesMeta.js';
import { readSessionMultiRootMetadata, withFolderScopeGitState, type SessionMeta } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { agentHostConnectionKinds } from '../../../../../../platform/agentHost/test/common/testAgentHostResourceUriMappers.js';
import { ISessionFolder, ISessionWorkspace } from '../../../../../../workbench/services/sessions/common/session.js';
import { getSessionWorkingDirectories, readSessionChangesetFolderFailures, readSessionWorkspaceConfig, withSessionFolderState, withSessionWorkspaceConfig } from '../../../../../../workbench/contrib/sessions/providers/agentHost/browser/agentHostSessionFolders.js';

suite('agentHostSessionFolders', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const api = URI.file('/work/api');
	const web = URI.file('/work/web');
	const docs = URI.file('/work/docs');

	function folder(uri: URI): ISessionFolder {
		return { root: uri, workingDirectory: uri, name: uri.path, description: undefined };
	}

	function workspace(folders: readonly URI[]): ISessionWorkspace {
		return { uri: folders[0], label: 'api', icon: Codicon.folder, folders: folders.map(folder), requiresWorkspaceTrust: true, isVirtualWorkspace: false };
	}

	test('getSessionWorkingDirectories starts with the default folder', () => {
		const config = { uri: URI.file('/work/project.code-workspace'), name: 'project', folders: [api, web] };
		assert.deepStrictEqual({
			folders: getSessionWorkingDirectories(api, config, [api, docs, docs]).map(String),
			config: getSessionWorkingDirectories(api, config, undefined).map(String),
			// Neither starts with the default folder
			mismatch: getSessionWorkingDirectories(docs, config, [api]).map(String),
		}, {
			folders: [api, docs].map(String),
			config: [api, web].map(String),
			mismatch: [docs].map(String),
		});
	});

	test('matches Windows paths across drive-letter case and encoding as the platform compares paths', () => {
		// Paths compare case-insensitively except on Linux
		const ignoresCase = !isLinux;
		const encoded = URI.parse('file:///c%3A/work/api');
		const upper = URI.parse('file:///C:/work/api');
		const winWeb = URI.parse('file:///c%3A/work/web');
		const hostWeb = 'file:///C:/work/web';
		let meta: SessionMeta | undefined = withFolderScopeGitState(undefined, getWorkingDirectoryScopeId([hostWeb]), { branchName: 'feature/web' }, [hostWeb]);
		meta = withSessionRepositories(meta, {
			[getWorkingDirectoryKey(hostWeb)]: [{ root: hostWeb, kind: 'folder' }, { root: 'file:///c%3A/work/WEB', kind: 'folder' }],
		});
		const result = withSessionFolderState(workspace([encoded, winWeb]), meta, uri => uri, uri => uri);
		const config = { uri: URI.parse('file:///c%3A/work/project.code-workspace'), name: 'project', folders: [upper, winWeb] };
		assert.deepStrictEqual({
			folders: getSessionWorkingDirectories(encoded, undefined, [encoded, upper, winWeb]).length,
			// The configuration's first folder differs from the default folder only in case
			configFolders: getSessionWorkingDirectories(encoded, config, undefined).length,
			webBranch: result?.folders[1].gitRepository?.branchName,
			repositories: result?.repositories?.length,
		}, {
			folders: ignoresCase ? 2 : 3,
			configFolders: ignoresCase ? 2 : 1,
			webBranch: ignoresCase ? 'feature/web' : undefined,
			// The same root in another case is listed once
			repositories: ignoresCase ? 1 : 0,
		});
	});

	for (const kind of agentHostConnectionKinds) {
		suite(kind.name, () => {
			const toHost = (uri: URI) => kind.resourceUris.toAgentHost(uri);
			const toClient = (uri: URI) => kind.resourceUris.fromAgentHost(uri);
			const clientApi = kind.toClient(api);
			const clientWeb = kind.toClient(web);
			const clientDocs = kind.toClient(docs);
			const hostKey = (uri: URI) => getWorkingDirectoryKey(uri.toString());

			test('records only the workspace file, in the host URI space, and reads it named after the file with the session\'s folders', () => {
				const config = { uri: kind.toClient(URI.file('/work/project.code-workspace')), name: 'Project', folders: [clientApi, clientWeb] };
				const meta = withSessionWorkspaceConfig({ other: true }, config, toHost);
				const read = readSessionWorkspaceConfig(meta, toClient, [clientApi, clientDocs]);
				assert.deepStrictEqual({
					recorded: readSessionMultiRootMetadata(meta),
					read: { uri: read?.uri.toString(), name: read?.name, folders: read?.folders.map(String) },
					// No folders: no workspace configuration to show
					withoutFolders: readSessionWorkspaceConfig(meta, toClient, []),
				}, {
					recorded: { workspaceFile: URI.file('/work/project.code-workspace').toString() },
					read: { uri: config.uri.toString(), name: 'project', folders: [clientApi, clientDocs].map(String) },
					withoutFolders: undefined,
				});
			});

			test('adds per-folder Git state, non-repository folders and repositories', () => {
				let meta: SessionMeta | undefined = withFolderScopeGitState(undefined, 'web-scope', { branchName: 'feature/web', hasGitRemote: true }, [web.toString()]);
				meta = withSessionNonRepositoryFolders(meta, [hostKey(docs)]);
				meta = withSessionRepositories(meta, {
					[hostKey(api)]: [{ root: api.toString(), kind: 'folder' }, { root: URI.file('/work/api/lib').toString(), kind: 'nested' }],
					[hostKey(web)]: [{ root: web.toString(), kind: 'folder' }, { root: api.toString(), kind: 'folder' }],
				});
				const result = withSessionFolderState(workspace([clientApi, clientWeb, clientDocs]), meta, toHost, toClient);
				assert.deepStrictEqual({
					folders: result?.folders.map(folder => ({ folder: folder.workingDirectory.toString(), branch: folder.gitRepository?.branchName, isRepository: folder.gitRepository?.isRepository?.get() })),
					repositories: result?.repositories?.map(repository => ({ root: repository.root.toString(), folder: repository.folder.toString(), kind: repository.kind, branch: repository.gitRepository?.branchName })),
				}, {
					folders: [
						// The first folder's state is the session's, which the workspace builder adds
						{ folder: clientApi.toString(), branch: undefined, isRepository: undefined },
						{ folder: clientWeb.toString(), branch: 'feature/web', isRepository: true },
						{ folder: clientDocs.toString(), branch: undefined, isRepository: false },
					],
					repositories: [
						{ root: clientApi.toString(), folder: clientApi.toString(), kind: 'folder', branch: undefined },
						{ root: kind.toClient(URI.file('/work/api/lib')).toString(), folder: clientApi.toString(), kind: 'nested', branch: undefined },
						// The repository shared with the first folder is listed once
						{ root: clientWeb.toString(), folder: clientWeb.toString(), kind: 'folder', branch: 'feature/web' },
					],
				});
			});

			test('leaves a workspace without repository records as it is, and lists the repositories nested in its only folder', () => {
				const single = workspace([clientApi]);
				const multi = withSessionFolderState(workspace([clientApi, clientWeb]), undefined, toHost, toClient);
				const nested = withSessionFolderState(single, withSessionRepositories(undefined, {
					[hostKey(api)]: [{ root: api.toString(), kind: 'folder' }, { root: URI.file('/work/api/lib').toString(), kind: 'nested' }],
				}), toHost, toClient);
				assert.deepStrictEqual({
					single: withSessionFolderState(single, withSessionNonRepositoryFolders(undefined, [hostKey(api)]), toHost, toClient) === single,
					repositories: multi?.repositories,
					webRepository: multi?.folders[1].gitRepository,
					nested: nested?.repositories?.map(repository => [repository.root.toString(), repository.kind]),
				}, {
					single: true,
					repositories: undefined,
					webRepository: undefined,
					nested: [[clientApi.toString(), 'folder'], [kind.toClient(URI.file('/work/api/lib')).toString(), 'nested']],
				});
			});

			test('reads a changeset\'s folder failures', () => {
				const changeset = 'copilot:/session/changeset/branch';
				const meta = withChangesetFolderFailures(undefined, changeset, [{ folder: web.toString(), message: 'Not a repository', detail: 'fatal' }]);
				assert.deepStrictEqual(readSessionChangesetFolderFailures(meta, changeset, toClient).map(failure => ({ ...failure, workingDirectory: failure.workingDirectory.toString() })), [
					{ workingDirectory: clientWeb.toString(), message: 'Not a repository', detail: 'fatal' },
				]);
				assert.deepStrictEqual(readSessionChangesetFolderFailures(meta, 'copilot:/session/changeset/other', toClient), []);
			});
		});
	}
});
