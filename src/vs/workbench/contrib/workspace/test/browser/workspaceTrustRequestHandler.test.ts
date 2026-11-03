/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService, IPrompt } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestContextService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceTrustRequestHandler } from '../../browser/workspace.contribution.js';

suite('WorkspaceTrustRequestHandler', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function getResourcesTrustDetails(options: ResourceTrustRequestOptions): Promise<string[]> {
		const resourcesTrustRequest = disposables.add(new Emitter<ResourceTrustRequestOptions>());
		const details = new DeferredPromise<string[]>();

		const trustRequestService = new class extends mock<IWorkspaceTrustRequestService>() {
			override readonly onDidInitiateOpenFilesTrustRequest = Event.None;
			override readonly onDidInitiateResourcesTrustRequest = resourcesTrustRequest.event;
			override readonly onDidInitiateWorkspaceTrustRequest = Event.None;
		};
		const dialogService = new class extends mock<IDialogService>() {
			override async prompt<T>(prompt: IPrompt<T>) {
				details.complete((prompt.custom && typeof prompt.custom === 'object' ? prompt.custom.markdownDetails ?? [] : []).map(detail => detail.markdown.value));
				return { result: undefined };
			}
		};
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(uri: URI) { return uri.path; }
		};
		const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = true;
		};
		const productService = new class extends mock<IProductService>() {
			override readonly nameLong = 'Code - OSS';
		};

		disposables.add(new WorkspaceTrustRequestHandler(dialogService, new class extends mock<ICommandService>() { }, labelService, new TestContextService(), disposables.add(new TestWorkspaceTrustManagementService()), trustRequestService, environmentService, productService));
		resourcesTrustRequest.fire(options);

		return details.p;
	}

	test('names the remote agent environment and explains the trust scope', async () => {
		const details = await getResourcesTrustDetails({
			uri: URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'box', path: '/work/project' }),
			message: 'Message.',
			remoteHostLabel: 'Dev `Box`',
		});

		assert.deepStrictEqual(details.slice(2), [
			'`/work/project`',
			'This folder is hosted on the remote agent environment `Dev Box`.',
			'Your decision is saved in Code - OSS on this computer and lets agent sessions read, modify, and run commands in this folder on `Dev Box`. It does not change any trust settings on the remote environment.',
		]);
	});

	test('keeps a multiline remote environment name in a single code span', async () => {
		const details = await getResourcesTrustDetails({
			uri: URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'box', path: '/work/project' }),
			message: 'Message.',
			remoteHostLabel: 'Box\n\n# Safe to trust\r\n\nrest',
		});

		assert.deepStrictEqual(details.slice(3), [
			'This folder is hosted on the remote agent environment `Box # Safe to trust rest`.',
			'Your decision is saved in Code - OSS on this computer and lets agent sessions read, modify, and run commands in this folder on `Box # Safe to trust rest`. It does not change any trust settings on the remote environment.',
		]);
	});

	test('does not claim local trust for an unnamed remote agent host folder', async () => {
		const details = await getResourcesTrustDetails({
			uri: URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'box', path: '/work/project' }),
			message: 'Message.',
		});

		assert.deepStrictEqual(details.slice(2), [
			'`/work/project`',
			'This folder is hosted on a remote agent environment.',
			'Your decision is saved in Code - OSS on this computer and lets agent sessions read, modify, and run commands in this folder. It does not change any trust settings on the remote environment.',
		]);
	});

	test('keeps the local trust note for a local folder', async () => {
		const details = await getResourcesTrustDetails({
			uri: URI.file('/work/project'),
			message: 'Message.',
		});

		assert.deepStrictEqual(details.slice(2), [
			'`/work/project`',
			'Trusting this folder will also mark it as trusted in Code - OSS.',
		]);
	});
});
