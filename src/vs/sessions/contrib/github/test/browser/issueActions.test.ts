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
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IOpenURLOptions, IURLService } from '../../../../../platform/url/common/url.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import '../../browser/issueActions.js';

function createSessionWithIssue(issueUri: URI): ISession {
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
			gitRepository: {
				uri: workspaceUri,
				workTreeUri: undefined,
				baseBranchName: undefined,
				gitHubInfo: constObservable({
					owner: 'owner',
					repo: 'repo',
					issues: [{ owner: 'owner', repo: 'repo', number: 7, uri: issueUri }],
				}),
			},
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

suite('Issue Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Open Issue opens externally when the GitHub Pull Requests extension is unavailable', async () => {
		const issueUri = URI.parse('https://github.com/owner/repo/issues/7');
		const session = createSessionWithIssue(issueUri);
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

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openIssue')!.handler(accessor, session));

		assert.deepStrictEqual({
			handledUris: urlService.opened,
			opened: openerService.opened,
		}, {
			handledUris: [],
			opened: [{ resource: issueUri, openExternal: true }],
		});
	});

	test('Open Issue uses the GitHub Pull Requests extension when available', async () => {
		const issueUri = URI.parse('https://github.com/owner/repo/issues/7');
		const session = createSessionWithIssue(issueUri);
		const instantiationService = new TestInstantiationService();
		const urlService = new TestURLService();
		const openerService = new TestOpenerService();
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override async getExtension(): Promise<IExtensionDescription | undefined> {
				return new class extends mock<IExtensionDescription>() { };
			}
		});
		instantiationService.stub(IOpenerService, openerService);
		instantiationService.stub(IURLService, urlService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openIssue')!.handler(accessor, session));

		assert.deepStrictEqual({
			handledUris: urlService.opened.map(({ uri, options }) => ({
				scheme: uri.scheme,
				authority: uri.authority,
				path: uri.path,
				query: JSON.parse(uri.query),
				trusted: options?.trusted,
			})),
			opened: openerService.opened,
		}, {
			handledUris: [{
				scheme: 'code-oss',
				authority: 'github.vscode-pull-request-github',
				path: '/open-issue-webview',
				query: {
					owner: 'owner',
					repo: 'repo',
					issueNumber: 7,
				},
				trusted: true,
			}],
			opened: [],
		});
	});
});
