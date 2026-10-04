/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource, cancelOnDispose } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IGitHubService } from '../../../../platform/github/common/githubService.js';
import { ISharedProcessGitHubService } from '../../../../platform/github/common/githubIpc.js';
import { GitHubAnonymousReadOptions, GitHubRestResponse } from '../../../../platform/github/common/githubTransport.js';
import { GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import product from '../../../../platform/product/common/product.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IssueFormService } from '../browser/issueFormService.js';
import { IGitHubUploadService } from '../browser/githubUploadService.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import { IssueReporter } from './issueReporterService.js';

export class NativeIssueFormService extends IssueFormService implements IIssueFormService {

	private readonly gitHubSearchCancellation = cancelOnDispose(this._store);

	/**
	 * Holds the currently-rendered legacy IssueReporter so its listeners on long-lived services
	 * (e.g. authentication onDidChangeSessions) are released when the aux window closes or a new
	 * reporter is opened.
	 */
	private readonly legacyReporter = this._register(new MutableDisposable<IssueReporter>());

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IAuxiliaryWindowService auxiliaryWindowService: IAuxiliaryWindowService,
		@ILogService logService: ILogService,
		@IDialogService dialogService: IDialogService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@IOpenerService openerService: IOpenerService,
		@IFileService fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IGitHubUploadService githubUploadService: IGitHubUploadService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@IClipboardService clipboardService: IClipboardService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IGitHubService gitHubService: IGitHubService,
		@ISharedProcessGitHubService private readonly sharedProcessGitHubService: ISharedProcessGitHubService,
	) {
		super(instantiationService, auxiliaryWindowService, menuService, contextKeyService, logService, dialogService, hostService, openerService, fileService, githubUploadService, editorService, clipboardService, gitHubService);
	}

	protected override async getGitHubSearchResponse(path: string, signal: AbortSignal, options: GitHubAnonymousReadOptions): Promise<GitHubRestResponse<unknown>> {
		const lifetime = new DisposableStore();
		const cancellation = lifetime.add(new CancellationTokenSource(this.gitHubSearchCancellation));
		lifetime.add(Event.once(Event.fromDOMEventEmitter(signal, 'abort'))(() => cancellation.cancel()));
		try {
			signal.throwIfAborted();
			const request = raceCancellationError(
				this.sharedProcessGitHubService.getAnonymous({ apiBaseUri: 'https://api.github.com', path, options }, cancellation.token),
				cancellation.token,
			);
			const { deadline } = options;
			const response = deadline === undefined ? await request
				: await raceTimeout(request, Math.max(0, deadline - Date.now()), () => cancellation.cancel());
			if (response === undefined || (deadline !== undefined && Date.now() >= deadline)) {
				// IPC may still be connecting, so whether the request was dispatched is unknown.
				throw new GitHubRequestError('GitHub issue search timed out', 'timeout');
			}
			return response;
		} finally {
			lifetime.dispose();
		}
	}

	override async openReporter(data: IssueReporterData): Promise<void> {
		if (this.hasToReload(data)) {
			return;
		}

		const useWizard = this.configurationService.getValue<boolean>('issueReporter.wizard.enabled');
		if (!useWizard) {
			// Legacy reporter needs OS properties synchronously for the issue body.
			const { arch, release, type } = await this.nativeHostService.getOSProperties();
			this.arch = arch;
			this.release = release;
			this.type = type;
			return this.openAuxIssueReporterLegacy(data);
		}

		// Wizard path pulls system info from IProcessService.getSystemInfo() inside
		// the editor pane, so it does not depend on arch/release/type here.
		const input = this.instantiationService.createInstance(IssueReporterEditorInput, data);

		// When editors are forced modal (`workbench.editor.useModal: 'all'`), the
		// issue reporter still needs to sit alongside the rest of the app so the
		// user can capture screenshots and recordings. In the Agents window, target
		// the main editor part's active group explicitly to open it docked in the
		// editor area instead of as a modal overlay.
		const preferredGroup = data.isSessionsWindow ? this.editorGroupService.mainPart.activeGroup : undefined;
		await this.editorService.openEditor(input, { pinned: true }, preferredGroup);
	}

	/**
	 * Desktop legacy path uses the native `IssueReporter` (so it can populate
	 * system/performance info via `IProcessService`) and centers the auxiliary
	 * window on the active window via `getActiveWindowPosition()`.
	 */
	override async openAuxIssueReporterLegacy(data: IssueReporterData): Promise<void> {
		const bounds = await this.nativeHostService.getActiveWindowPosition();
		await this.openAuxIssueReporter(data, bounds);

		if (this.issueReporterWindow) {
			const issueReporter = this.instantiationService.createInstance(
				IssueReporter,
				!!this.environmentService.disableExtensions,
				data,
				{ type: this.type, arch: this.arch, release: this.release },
				product,
				this.issueReporterWindow,
			);
			this.legacyReporter.value = issueReporter;
			this.issueReporterWindow.addEventListener('beforeunload', () => this.legacyReporter.clear(), { once: true });
			issueReporter.render();
		}
	}
}
