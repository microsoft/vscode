/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IOpenURLOptions, IURLService } from '../../../../../platform/url/common/url.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasPullRequestContext } from '../../../../common/contextkeys.js';
import { IGitHubPullRequestRef, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import '../../browser/pullRequestActions.js';

function createSessionWithPullRequest(pullRequestUri: URI | undefined, pullRequestRefs?: readonly IGitHubPullRequestRef[]): ISession {
	const workspaceUri = URI.from({ scheme: 'test', path: '/workspace' });
	const workspace: ISessionWorkspace = {
		uri: workspaceUri,
		label: 'workspace',
		icon: Codicon.folder,
		folders: [{
			root: workspaceUri,
			workingDirectory: workspaceUri,
			name: 'workspace',
			description: undefined,
			gitRepository: pullRequestUri ? {
				uri: workspaceUri,
				workTreeUri: undefined,
				baseBranchName: undefined,
				gitHubInfo: constObservable({
					owner: 'owner',
					repo: 'repo',
					pullRequest: { number: 1, uri: pullRequestUri },
					pullRequests: pullRequestRefs,
				}),
			} : undefined,
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	return new class extends mock<ISession>() {
		override readonly workspace = constObservable<ISessionWorkspace | undefined>(workspace);
	};
}

class TestURLService extends mock<IURLService>() {
	readonly opened: { readonly uri: URI; readonly options: IOpenURLOptions | undefined }[] = [];

	override create(options?: Partial<UriComponents>): URI {
		return URI.from({ scheme: 'code-oss', ...options });
	}

	override async open(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		this.opened.push({ uri, options });
		return true;
	}
}

class TestOpenerService extends mock<IOpenerService>() {
	readonly opened: { readonly resource: URI; readonly openExternal: boolean | undefined }[] = [];

	override async open(resource: URI, options?: { readonly openExternal?: boolean }): Promise<boolean> {
		this.opened.push({ resource, openExternal: options?.openExternal });
		return true;
	}
}

suite('Pull Request Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Open Pull Request and Copy Pull Request URL are contributed to a dedicated context menu group', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionItemContextMenu)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'workbench.agentSessions.action.openPullRequest' || item.command.id === 'workbench.agentSessions.action.copyPullRequestUrl');

		assert.deepStrictEqual(items.map(item => ({
			id: item.command.id,
			group: item.group,
			order: item.order,
			hasPullRequestGate: (item.when?.serialize() ?? '').includes(SessionHasPullRequestContext.key),
		})).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [
			{ id: 'workbench.agentSessions.action.openPullRequest', group: '2_pullRequest', order: 0, hasPullRequestGate: true },
			{ id: 'workbench.agentSessions.action.copyPullRequestUrl', group: '2_pullRequest', order: 1, hasPullRequestGate: true },
		]);
	});

	test('Copy Pull Request URL writes the pull request URL to the clipboard', async () => {
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const session = createSessionWithPullRequest(pullRequestUri);

		const instantiationService = new TestInstantiationService();
		const clipboardService = new class extends mock<IClipboardService>() {
			readonly writes: string[] = [];
			override async writeText(text: string): Promise<void> {
				this.writes.push(text);
			}
		};
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.copyPullRequestUrl')!.handler(accessor, session));

		assert.deepStrictEqual(clipboardService.writes, [pullRequestUri.toString(true)]);
	});

	test('Copy Pull Request URL is a no-op when the session has no pull request', async () => {
		const session = createSessionWithPullRequest(undefined);

		const instantiationService = new TestInstantiationService();
		const clipboardService = new class extends mock<IClipboardService>() {
			readonly writes: string[] = [];
			override async writeText(text: string): Promise<void> {
				this.writes.push(text);
			}
		};
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.copyPullRequestUrl')!.handler(accessor, session));

		assert.deepStrictEqual(clipboardService.writes, []);
	});

	test('Open Pull Request opens the pull request URL externally when the GitHub Pull Requests extension is unavailable', async () => {
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const session = createSessionWithPullRequest(pullRequestUri);

		const instantiationService = new TestInstantiationService();
		const urlService = new TestURLService();
		const openerService = new TestOpenerService();
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override async getExtension(): Promise<IExtensionDescription | undefined> {
				return undefined;
			}
		});
		instantiationService.stub(IOpenerService, openerService);
		instantiationService.stub(IURLService, urlService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openPullRequest')!.handler(accessor, session));

		assert.deepStrictEqual({
			handledUris: urlService.opened,
			opened: openerService.opened,
		}, {
			handledUris: [],
			opened: [{ resource: pullRequestUri, openExternal: true }],
		});
	});

	test('Open Pull Request prefers the explicit pull request repository identity', async () => {
		const pullRequestUri = URI.parse('https://github.com/upstream/project/pull/7');
		const session = createSessionWithPullRequest(pullRequestUri, [{
			owner: 'upstream',
			repo: 'project',
			number: 7,
			uri: pullRequestUri,
		}]);
		const instantiationService = new TestInstantiationService();
		const urlService = new TestURLService();
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override async getExtension(): Promise<IExtensionDescription | undefined> {
				return new class extends mock<IExtensionDescription>() { };
			}
		});
		instantiationService.stub(IOpenerService, new TestOpenerService());
		instantiationService.stub(IURLService, urlService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openPullRequest')!.handler(accessor, session));

		assert.deepStrictEqual(JSON.parse(urlService.opened[0].uri.query), {
			owner: 'upstream',
			repo: 'project',
			pullRequestNumber: 7,
		});
	});

	test('Copy Pull Request URL uses an explicit contextual pull request', async () => {
		const secondPullRequestUri = URI.parse('https://github.com/upstream/project/pull/7');
		const secondPullRequest = { owner: 'upstream', repo: 'project', number: 7, uri: secondPullRequestUri };

		const instantiationService = new TestInstantiationService();
		const clipboardService = new class extends mock<IClipboardService>() {
			readonly writes: string[] = [];
			override async writeText(text: string): Promise<void> {
				this.writes.push(text);
			}
		};
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.copyPullRequestUrl')!.handler(accessor, { pullRequest: secondPullRequest }));

		assert.deepStrictEqual(clipboardService.writes, [secondPullRequestUri.toString(true)]);
	});

	test('Open Pull Request uses the GitHub Pull Requests extension when available', async () => {
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const session = createSessionWithPullRequest(pullRequestUri);

		const instantiationService = new TestInstantiationService();
		const requestedExtensionIds: string[] = [];
		const urlService = new TestURLService();
		const openerService = new TestOpenerService();
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override async getExtension(id: string): Promise<IExtensionDescription | undefined> {
				requestedExtensionIds.push(id);
				return new class extends mock<IExtensionDescription>() { };
			}
		});
		instantiationService.stub(IOpenerService, openerService);
		instantiationService.stub(IURLService, urlService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openPullRequest')!.handler(accessor, session));

		assert.deepStrictEqual({
			requestedExtensionIds,
			handledUris: urlService.opened.map(({ uri, options }) => ({
				scheme: uri.scheme,
				authority: uri.authority,
				path: uri.path,
				query: JSON.parse(uri.query),
				trusted: options?.trusted,
			})),
			opened: openerService.opened,
		}, {
			requestedExtensionIds: ['github.vscode-pull-request-github'],
			handledUris: [{
				scheme: 'code-oss',
				authority: 'github.vscode-pull-request-github',
				path: '/open-pull-request-webview',
				query: {
					owner: 'owner',
					repo: 'repo',
					pullRequestNumber: 1,
				},
				trusted: true,
			}],
			opened: [],
		});
	});
});
