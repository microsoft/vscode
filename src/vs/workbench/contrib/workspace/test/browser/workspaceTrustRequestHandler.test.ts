/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService, IPrompt } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IBannerService } from '../../../../services/banner/browser/bannerService.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { isSingleFolderWorkspaceIdentifier, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestContextService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceTrustRequestHandler, WorkspaceTrustUXHandler } from '../../browser/workspace.contribution.js';

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
	test('the startup trust prompt names the folder it will trust while at an alternate location', async () => {
		const primary = URI.file('/safe/project');
		const alternate = URI.file('/external/checkouts/feature');
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: alternate, name: 'feature', index: 0 })], false, null, () => false, undefined, primary);
		const checkboxes: (string | undefined)[] = [];
		const labelled: string[] = [];
		const prompted = new DeferredPromise<void>();
		const startup = disposables.add(new Emitter<void>());
		const trust = new class extends mock<IWorkspaceTrustManagementService>() {
			override readonly workspaceTrustInitialized = Promise.resolve();
			override readonly workspaceResolved = Promise.resolve();
			override readonly onDidChangeTrust = Event.None;
			override isWorkspaceTrusted() { return false; }
			override canSetParentFolderTrust() { return true; }
		};
		const request = new class extends mock<IWorkspaceTrustRequestService>() {
			override readonly onDidInitiateWorkspaceTrustRequestOnStartup = startup.event;
			override readonly onDidInitiateOpenFilesTrustRequest = Event.None;
			override readonly onDidInitiateResourcesTrustRequest = Event.None;
			override readonly onDidInitiateWorkspaceTrustRequest = Event.None;
		};
		const dialogService = new class extends mock<IDialogService>() {
			override async prompt<T>(prompt: IPrompt<T>) {
				checkboxes.push(prompt.checkbox?.label);
				prompted.complete();
				return { result: undefined };
			}
		};
		const labelService = new class extends mock<ILabelService>() {
			override getWorkspaceLabel(workspace: Parameters<ILabelService['getWorkspaceLabel']>[0]) {
				const uri = URI.isUri(workspace) ? workspace : isSingleFolderWorkspaceIdentifier(workspace) ? workspace.uri : undefined;
				labelled.push(uri?.path ?? '');
				return uri?.path ?? '';
			}
			override getUriLabel(uri: URI) { return uri.path; }
		};

		disposables.add(new WorkspaceTrustUXHandler(
			dialogService,
			new TestContextService(workspace),
			new class extends mock<IWorkspaceTrustEnablementService>() { override isWorkspaceTrustEnabled() { return true; } },
			trust,
			new class extends mock<IConfigurationService>() { },
			new class extends mock<IStatusbarService>() { override addEntry() { return { dispose() { }, update() { } }; } },
			new class extends mock<IStorageService>() { override store() { } },
			request,
			new class extends mock<IBannerService>() { override show() { } override hide() { } },
			labelService,
			new class extends mock<IHostService>() { override readonly hasFocus = false; override readonly onDidChangeFocus = Event.None; },
			new class extends mock<IProductService>() { override readonly nameShort = 'Code'; },
			new class extends mock<IRemoteAgentService>() { },
			new class extends mock<IWorkbenchEnvironmentService>() { override readonly workspaceStorageHome = URI.file('/storage'); },
			new class extends mock<IFileService>() { override async exists() { return false; } }
		));
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		// The startup prompt warns when the product has no AI-generated workspace trust contents
		const consoleWarn = stub(console, 'warn');
		let warnings: unknown[][] = [];
		try {
			startup.fire();
			await prompted.p;
		} finally {
			warnings = consoleWarn.args;
			consoleWarn.restore();
		}

		assert.deepStrictEqual({ checkboxes, labelled, warnings }, {
			checkboxes: ['Trust the authors of all files in the parent folder \'checkouts\''],
			labelled: ['/external/checkouts/feature'],
			warnings: [['AI generated workspace trust dialog contents not available.']]
		});
	});
});
