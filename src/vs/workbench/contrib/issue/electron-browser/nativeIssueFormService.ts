/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkbenchGitHubService } from '../../../services/github/common/githubService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import product from '../../../../platform/product/common/product.js';
import { DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IssueFormService } from '../browser/issueFormService.js';
import { IGitHubUploadService } from '../browser/githubUploadService.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IAuxiliaryEditorPart, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import { IssueReporter } from './issueReporterService.js';
import { localize } from '../../../../nls.js';

class ReporterWindow extends DisposableStore {
	readonly ready = new DeferredPromise<void>();
	closeOperation: Promise<boolean> | undefined;
	initialEditor: { readonly input: IssueReporterEditorInput; readonly group: IEditorGroup } | undefined;

	constructor(readonly part: IAuxiliaryEditorPart, input: IssueReporterEditorInput) {
		super();
		this.initialEditor = { input, group: part.activeGroup };
		this.add(toDisposable(() => {
			this.initialEditor = undefined;
			void this.ready.complete();
		}));
	}
}

export class NativeIssueFormService extends IssueFormService implements IIssueFormService {

	private openingReporter: Promise<void> | undefined;
	private readonly reporterWindows = this._register(new DisposableMap<number, ReporterWindow>());

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
		@IWorkbenchGitHubService gitHubService: IWorkbenchGitHubService,
	) {
		super(instantiationService, auxiliaryWindowService, menuService, contextKeyService, logService, dialogService, hostService, openerService, fileService, githubUploadService, editorService, clipboardService, gitHubService);
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

		if (this.openingReporter) {
			return this.openingReporter;
		}
		// Install the guard before editor-opening callbacks can request another reporter.
		const opening = Promise.resolve().then(() => this.openNewReporter(data));
		this.openingReporter = opening;
		try {
			await opening;
		} finally {
			if (this.openingReporter === opening) {
				this.openingReporter = undefined;
			}
		}
	}

	private async openNewReporter(data: IssueReporterData): Promise<void> {
		for (const window of this.reporterWindows.values()) {
			await window.closeOperation;
		}
		if (this._store.isDisposed) {
			return;
		}
		for (const group of this.editorGroupService.groups) {
			const existing = group.editors.find((editor): editor is IssueReporterEditorInput => editor instanceof IssueReporterEditorInput);
			if (existing) {
				await this.editorService.openEditor(existing, { pinned: true }, group);
				return;
			}
		}

		const input = this.instantiationService.createInstance(IssueReporterEditorInput, data);
		let part: IAuxiliaryEditorPart | undefined;
		let reporterWindow: ReporterWindow | undefined;
		try {
			if (this.configurationService.getValue<string>('issueReporter.wizard.openLocation') === 'editor') {
				const preferredGroup = data.isSessionsWindow ? this.editorGroupService.mainPart.activeGroup : undefined;
				await this.editorService.openEditor(input, { pinned: true }, preferredGroup);
				return;
			}

			part = await this.editorGroupService.createAuxiliaryEditorPart();
			if (this._store.isDisposed) {
				return;
			}
			const auxiliaryWindow = this.auxiliaryWindowService.getWindow(part.windowId);
			if (!auxiliaryWindow?.registerCloseHandler) {
				throw new Error(localize('reporterWindowCloseUnsupported', "The issue reporter window could not be opened with safe close handling."));
			}
			reporterWindow = new ReporterWindow(part, input);
			this.reporterWindows.set(part.windowId, reporterWindow);
			const window = reporterWindow;
			window.add(Event.once(auxiliaryWindow.onWillDispose)(() => this.reporterWindows.deleteAndDispose(window.part.windowId)));
			window.add(auxiliaryWindow.registerCloseHandler({
				close: () => this.closeReporterWindow(window),
				isReadyToClose: () => !window.isDisposed && window.ready.isSettled && window.part.groups.every(group => group.isEmpty),
			}));
			await this.editorService.openEditor(input, { pinned: true }, window.initialEditor!.group);
		} finally {
			if (reporterWindow) {
				reporterWindow.initialEditor = undefined;
				void reporterWindow.ready.complete();
			}
			if (!this.editorGroupService.groups.some(group => group.editors.includes(input))) {
				input.dispose();
				if (part?.groups.every(group => group.isEmpty)) {
					part.close();
				}
			}
		}
	}

	private closeReporterWindow(window: ReporterWindow): Promise<boolean> {
		if (window.closeOperation) {
			return window.closeOperation;
		}
		const operation = this.doCloseReporterWindow(window);
		window.closeOperation = operation;
		const clear = () => {
			if (window.closeOperation === operation) {
				window.closeOperation = undefined;
			}
		};
		void operation.then(clear, clear);
		return operation;
	}

	private async doCloseReporterWindow(window: ReporterWindow): Promise<boolean> {
		const snapshots = window.part.groups.map(group => ({ group, editors: [...group.editors] }));
		const initial = window.initialEditor;
		if (initial) {
			const snapshot = snapshots.find(snapshot => snapshot.group === initial.group);
			if (snapshot && !snapshot.editors.includes(initial.input)) {
				snapshot.editors.push(initial.input);
			}
		}
		await window.ready.p;
		if (window.isDisposed) {
			return false;
		}
		for (const { group, editors } of snapshots) {
			const remaining = editors.filter(editor => group.editors.includes(editor));
			if (remaining.length && !await group.closeEditors(remaining)) {
				return false;
			}
		}
		return !window.isDisposed && window.part.groups.every(group => group.isEmpty);
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
