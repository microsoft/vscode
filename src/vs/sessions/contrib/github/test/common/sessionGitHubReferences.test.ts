/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChat, IGitHubInfo, ISession, ISessionArtifact, ISessionWorkspace, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { getSessionGitHubReferences } from '../../common/sessionGitHubReferences.js';

suite('Session GitHub References', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(entries: readonly ISessionArtifact[], gitHubInfo?: IGitHubInfo) {
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', entries);
		const root = URI.file('/repo');
		return upcastPartial<ISession>({
			artifacts,
			workspace: constObservable(gitHubInfo ? upcastPartial<ISessionWorkspace>({
				folders: [{
					root, workingDirectory: root, name: 'repo', description: undefined,
					gitRepository: { uri: root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(gitHubInfo) },
				}],
			}) : undefined),
		});
	}

	for (const isArtifact of [true, false]) {
		test(`${isArtifact ? 'resolves' : 'leaves out'} an issue-only ${isArtifact ? 'artifact' : 'reference'} without a workspace or repository`, () => {
			const uri = URI.parse('https://github.com/microsoft/vscode/issues/337297');
			const session = createSession([{
				id: 'issue', kind: SessionArtifactKind.Issue, label: 'Workspace picker', isArtifact, isGitHub: true, link: uri,
			}]);

			assert.deepStrictEqual(getSessionGitHubReferences(session, undefined), {
				pullRequests: [],
				issues: isArtifact ? [{ owner: 'microsoft', repo: 'vscode', number: 337297, uri, title: 'Workspace picker', recordedReferenceId: 'issue' }] : [],
			});
		});
	}

	test('keeps recorded links from different repositories alongside checkout associations', () => {
		const pullRequest = URI.parse('https://github.com/other/project/pull/1');
		const issue = URI.parse('https://github.com/another/project/issues/2');
		const discovered = { owner: 'owner', repo: 'repo', number: 3, uri: URI.parse('https://github.com/owner/repo/pull/3') };
		const session = createSession([
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'Recorded PR', isArtifact: true, isGitHub: true, link: pullRequest },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Recorded issue', isArtifact: true, isGitHub: true, link: issue },
		], { owner: 'owner', repo: 'repo', pullRequest: discovered });

		const references = getSessionGitHubReferences(session, undefined);
		assert.deepStrictEqual({
			pullRequests: references.pullRequests.map(ref => [ref.owner, ref.repo, ref.number, ref.recordedReferenceId, ref.createdByThisSession]),
			issues: references.issues.map(ref => [ref.owner, ref.repo, ref.number, ref.recordedReferenceId]),
		}, {
			pullRequests: [['other', 'project', 1, 'pr', true], ['owner', 'repo', 3, undefined, undefined]],
			issues: [['another', 'project', 2, 'issue']],
		});
	});

	test('leaves recorded references and their echoed associations out, keeping a referenced PR the session produced', () => {
		const link = (path: string) => URI.parse(`https://github.com/owner/repo/${path}`);
		const association = (number: number) => ({ owner: 'owner', repo: 'repo', number, uri: link(`pull/${number}`) });
		const session = createSession([
			{ id: 'artifact', kind: SessionArtifactKind.PullRequest, label: 'Artifact', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/OWNER/REPO/pull/1/') },
			{ id: 'duplicate-reference', kind: SessionArtifactKind.PullRequest, label: 'Duplicate', isArtifact: false, isGitHub: true, link: link('pull/1') },
			{ id: 'reference', kind: SessionArtifactKind.PullRequest, label: 'Reference', isArtifact: false, isGitHub: true, link: link('pull/2') },
			{ id: 'produced-reference', kind: SessionArtifactKind.PullRequest, label: 'Produced', isArtifact: false, isGitHub: true, link: link('pull/3') },
			{ id: 'issue-reference', kind: SessionArtifactKind.Issue, label: 'Issue', isArtifact: false, isGitHub: true, link: link('issues/4') },
		], {
			owner: 'owner', repo: 'repo',
			pullRequests: [
				{ ...association(1), recordedReferenceId: 'artifact', createdByThisSession: true, state: 'merged', icon: Codicon.gitMerge, title: 'Live title' },
				{ ...association(1), recordedReferenceId: 'duplicate-reference', createdByThisSession: false },
				{ ...association(2), recordedReferenceId: 'reference', createdByThisSession: false },
				// The provider also discovered this referenced PR from the session's own git state.
				{ ...association(3), recordedReferenceId: 'produced-reference', createdByThisSession: true },
			],
			issues: [{ owner: 'owner', repo: 'repo', number: 4, uri: link('issues/4'), recordedReferenceId: 'issue-reference' }],
		});

		const references = getSessionGitHubReferences(session, undefined);
		assert.deepStrictEqual({
			pullRequests: references.pullRequests.map(ref => ({
				number: ref.number, id: ref.recordedReferenceId, title: ref.title, owned: ref.createdByThisSession, state: ref.state, icon: ref.icon,
			})),
			issues: references.issues,
		}, {
			pullRequests: [
				{ number: 1, id: 'artifact', title: 'Live title', owned: true, state: 'merged', icon: Codicon.gitMerge },
				{ number: 3, id: undefined, title: undefined, owned: true, state: undefined, icon: undefined },
			],
			issues: [],
		});
	});

	test('keeps an independently discovered PR after its recorded duplicate is removed', () => {
		const uri = URI.parse('https://github.com/owner/repo/pull/1');
		const associated = { owner: 'owner', repo: 'repo', number: 1, uri, createdByThisSession: false };
		const entry: ISessionArtifact = { id: 'artifact', kind: SessionArtifactKind.PullRequest, label: 'Recorded', isArtifact: true, isGitHub: true, link: uri };
		const gitHubInfo = { owner: 'owner', repo: 'repo', pullRequests: [associated] };
		const before = getSessionGitHubReferences(createSession([entry], gitHubInfo), undefined);
		const after = getSessionGitHubReferences(createSession([], gitHubInfo), undefined);

		assert.deepStrictEqual([before, after].map(refs => refs.pullRequests.map(ref => [ref.number, ref.recordedReferenceId, ref.createdByThisSession])), [
			[[1, 'artifact', true]],
			[[1, undefined, false]],
		]);
	});

	test('scopes a pull request recorded by multiple chats to the focused chat', () => {
		const uri = URI.parse('https://github.com/owner/repo/pull/1');
		const peerChatResource = URI.parse('ahp-chat://peer/session');
		const mainChatResource = URI.parse('ahp-chat://default/session');
		const session = createSession([
			{ id: 'peer-artifact', chat: peerChatResource, kind: SessionArtifactKind.PullRequest, label: 'Peer label', isArtifact: true, isGitHub: true, link: uri },
			{ id: 'main-artifact', chat: mainChatResource, kind: SessionArtifactKind.PullRequest, label: 'Main label', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/OWNER/REPO/pull/1/') },
		], {
			owner: 'owner',
			repo: 'repo',
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 1, uri, recordedReferenceId: 'main-artifact', title: 'Live title' }],
		});
		const chat = (resource: URI) => upcastPartial<IChat>({ resource, workspace: constObservable(undefined) });

		assert.deepStrictEqual({
			session: getSessionGitHubReferences(session, undefined).pullRequests.map(ref => ref.recordedReferenceId),
			peer: getSessionGitHubReferences(session, undefined, chat(peerChatResource)).pullRequests.map(ref => ref.recordedReferenceId),
			main: getSessionGitHubReferences(session, undefined, chat(mainChatResource)).pullRequests.map(ref => ref.recordedReferenceId),
		}, {
			session: ['peer-artifact'],
			peer: ['peer-artifact'],
			main: ['main-artifact'],
		});
	});

	test('resolves a chat\'s pull requests from its own repository only', () => {
		const sessionPullRequest = { owner: 'microsoft', repo: 'vscode', number: 1, uri: URI.parse('https://github.com/microsoft/vscode/pull/1') };
		const chatPullRequest = { owner: 'contoso', repo: 'tools', number: 7, uri: URI.parse('https://github.com/contoso/tools/pull/7') };
		const session = createSession([
			{ id: 'session-repo-pr', kind: SessionArtifactKind.PullRequest, label: 'Session repo PR', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/microsoft/vscode/pull/2') },
			{ id: 'chat-repo-pr', kind: SessionArtifactKind.PullRequest, label: 'Chat repo PR', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/Contoso/Tools/pull/8') },
		], { owner: 'microsoft', repo: 'vscode', pullRequests: [sessionPullRequest] });
		const chatRoot = URI.file('/other');
		const chat = upcastPartial<IChat>({
			resource: URI.parse('ahp-chat://peer/session'),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root: chatRoot, workingDirectory: chatRoot, name: 'other', description: undefined,
					gitRepository: { uri: chatRoot, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable<IGitHubInfo | undefined>({ owner: 'contoso', repo: 'tools', pullRequests: [chatPullRequest] }) },
				}],
			})),
		});

		assert.deepStrictEqual({
			session: getSessionGitHubReferences(session, undefined).pullRequests.map(ref => ref.uri.toString()),
			chat: getSessionGitHubReferences(session, undefined, chat).pullRequests.map(ref => ref.uri.toString()),
		}, {
			session: ['https://github.com/microsoft/vscode/pull/2', 'https://github.com/Contoso/Tools/pull/8', 'https://github.com/microsoft/vscode/pull/1'],
			chat: ['https://github.com/Contoso/Tools/pull/8', 'https://github.com/contoso/tools/pull/7'],
		});
	});

	test('resolves pull requests from every folder of a chat', () => {
		const folder = (path: string, gitHubInfo: IGitHubInfo) => {
			const root = URI.file(path);
			return { root, workingDirectory: root, name: path, description: undefined, gitRepository: { uri: root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable<IGitHubInfo | undefined>(gitHubInfo) } };
		};
		const session = createSession([
			{ id: 'foreign', kind: SessionArtifactKind.PullRequest, label: 'Foreign', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/other/project/pull/3') },
		]);
		const chat = upcastPartial<IChat>({
			resource: URI.parse('ahp-chat://peer/session'),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [
					folder('/repo', { owner: 'microsoft', repo: 'vscode', pullRequests: [{ owner: 'microsoft', repo: 'vscode', number: 1, uri: URI.parse('https://github.com/microsoft/vscode/pull/1') }] }),
					folder('/tools', { owner: 'contoso', repo: 'tools', pullRequests: [{ owner: 'contoso', repo: 'tools', number: 7, uri: URI.parse('https://github.com/contoso/tools/pull/7') }] }),
				],
			})),
		});

		assert.deepStrictEqual(getSessionGitHubReferences(session, undefined, chat).pullRequests.map(ref => ref.uri.toString()), [
			'https://github.com/microsoft/vscode/pull/1',
			'https://github.com/contoso/tools/pull/7',
		]);
	});

	test('restricts shared-folder pull requests to their creating chat only when automatic association is disabled', () => {
		const mainResource = URI.parse('custom-chat://host/main');
		const peerResource = URI.parse('custom-chat://host/peer');
		const link = (number: number) => URI.parse(`https://github.com/owner/repo/pull/${number}`);
		const entries: readonly ISessionArtifact[] = [
			{ id: 'main', chat: mainResource, kind: SessionArtifactKind.PullRequest, label: 'Main PR', isArtifact: true, isGitHub: true, link: link(1) },
			{ id: 'peer', chat: peerResource, kind: SessionArtifactKind.PullRequest, label: 'Peer PR', isArtifact: true, isGitHub: true, link: link(2) },
			{ id: 'legacy', kind: SessionArtifactKind.PullRequest, label: 'Legacy PR', isArtifact: true, isGitHub: true, link: link(3) },
			{ id: 'reference', chat: peerResource, kind: SessionArtifactKind.PullRequest, label: 'Reference', isArtifact: false, isGitHub: true, link: link(4) },
		];
		const baseSession = createSession(entries, {
			owner: 'owner', repo: 'repo',
			pullRequests: [1, 2, 3, 4, 5].map(number => ({ owner: 'owner', repo: 'repo', number, uri: link(number), title: `Live ${number}`, createdByThisSession: true })),
		});
		const workspace = baseSession.workspace;
		const main = upcastPartial<IChat>({ resource: mainResource, workspace });
		const peer = upcastPartial<IChat>({ resource: peerResource, workspace });
		const session = upcastPartial<ISession>({ ...baseSession, mainChat: constObservable(main) });
		const snapshot = (chat: IChat | undefined, automatic: boolean) => getSessionGitHubReferences(session, undefined, chat, automatic).pullRequests.map(ref => [ref.number, ref.title]);

		assert.deepStrictEqual({
			restrictedMain: snapshot(main, false),
			restrictedPeer: snapshot(peer, false),
			automaticMain: snapshot(main, true),
			automaticPeer: snapshot(peer, true),
			session: snapshot(undefined, false),
		}, {
			restrictedMain: [[1, 'Live 1'], [3, 'Live 3']],
			restrictedPeer: [[2, 'Live 2']],
			automaticMain: [[1, 'Live 1'], [3, 'Live 3'], [2, 'Live 2'], [4, 'Live 4'], [5, 'Live 5']],
			automaticPeer: [[2, 'Live 2'], [3, 'Live 3'], [1, 'Live 1'], [4, 'Live 4'], [5, 'Live 5']],
			session: [[1, 'Live 1'], [2, 'Live 2'], [3, 'Live 3'], [4, 'Live 4'], [5, 'Live 5']],
		});
	});

	test('keeps a chat-owned PR without a workspace and leaves unknown ownership out of restricted peer pills', () => {
		const resource = URI.parse('custom-chat://host/peer');
		const session = createSession([
			{ id: 'own', chat: resource, kind: SessionArtifactKind.PullRequest, label: 'Own PR', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/1') },
			{ id: 'legacy', kind: SessionArtifactKind.PullRequest, label: 'Legacy PR', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/2') },
		]);
		const chat = upcastPartial<IChat>({ resource, workspace: constObservable(undefined) });
		assert.deepStrictEqual(getSessionGitHubReferences(session, undefined, chat, false).pullRequests.map(ref => ref.number), [1]);
	});

	test('shows the selected PR through standard main-chat artifacts without automatic attachment', () => {
		const mainResource = URI.parse('custom-chat://host/main');
		const peerResource = URI.parse('custom-chat://host/peer');
		const link = (number: number) => URI.parse(`https://github.com/owner/repo/pull/${number}`);
		const baseSession = createSession([
			{ id: 'selected', chat: mainResource, kind: SessionArtifactKind.PullRequest, label: '', isArtifact: true, isGitHub: true, link: link(1) },
			{ id: 'peer', chat: peerResource, kind: SessionArtifactKind.PullRequest, label: 'Peer PR', isArtifact: true, isGitHub: true, link: link(2) },
		], {
			owner: 'owner', repo: 'repo',
			pullRequests: [
				{ owner: 'owner', repo: 'repo', number: 1, uri: link(1), createdByThisSession: true, recordedReferenceId: 'selected' },
				{ owner: 'owner', repo: 'repo', number: 2, uri: link(2), createdByThisSession: true, recordedReferenceId: 'peer' },
				{ owner: 'owner', repo: 'repo', number: 3, uri: link(3), createdByThisSession: true },
			],
		});
		const main = upcastPartial<IChat>({ resource: mainResource, workspace: baseSession.workspace });
		const peer = upcastPartial<IChat>({ resource: peerResource, workspace: baseSession.workspace });
		const session = upcastPartial<ISession>({ ...baseSession, mainChat: constObservable(main) });

		assert.deepStrictEqual({
			main: getSessionGitHubReferences(session, undefined, main, false).pullRequests.map(ref => ref.number),
			peer: getSessionGitHubReferences(session, undefined, peer, false).pullRequests.map(ref => ref.number),
		}, { main: [1], peer: [2] });
	});
});
