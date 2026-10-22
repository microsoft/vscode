/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
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
import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { AuxiliaryWindowMode, IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IssueFormService } from '../browser/issueFormService.js';
import { IGitHubUploadService } from '../browser/githubUploadService.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import { IssueReporter } from './issueReporterService.js';
import { IssueReporterController } from './issueReporterController.js';
import { localize } from '../../../../nls.js';

class ReporterWindow extends DisposableStore {
	readonly ready = new DeferredPromise<void>();
	closeOperation: Promise<boolean> | undefined;
	controller: IssueReporterController | undefined;

	constructor(readonly auxiliaryWindow: IAuxiliaryWindow, readonly input: IssueReporterEditorInput) {
		super();
		this.add(input);
		this.add(toDisposable(() => {
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
		for (const window of this.reporterWindows.values()) {
			if (!window.isDisposed && !window.input.isDisposed()) {
				await this.hostService.focus(window.auxiliaryWindow.window);
				window.controller?.focus();
				return;
			}
		}
		for (const group of this.editorGroupService.groups) {
			const existing = group.editors.find((editor): editor is IssueReporterEditorInput => editor instanceof IssueReporterEditorInput);
			if (existing) {
				await this.editorService.openEditor(existing, { pinned: true }, group);
				return;
			}
		}

		const input = this.instantiationService.createInstance(IssueReporterEditorInput, data);
		let auxiliaryWindow: IAuxiliaryWindow | undefined;
		let reporterWindow: ReporterWindow | undefined;
		try {
			if (this.configurationService.getValue<string>('issueReporter.wizard.openLocation') === 'editor') {
				const preferredGroup = data.isSessionsWindow ? this.editorGroupService.mainPart.activeGroup : undefined;
				await this.editorService.openEditor(input, { pinned: true }, preferredGroup);
				return;
			}

			auxiliaryWindow = await this.auxiliaryWindowService.open({
				mode: AuxiliaryWindowMode.Normal,
				nativeTitlebar: true,
				disableWorkbenchMenu: true,
				bounds: { width: 800, height: 900 },
			});
			if (this._store.isDisposed) {
				return;
			}
			if (!auxiliaryWindow.registerCloseHandler) {
				throw new Error(localize('reporterWindowCloseUnsupported', "The issue reporter window could not be opened with safe close handling."));
			}
			reporterWindow = new ReporterWindow(auxiliaryWindow, input);
			const windowId = auxiliaryWindow.window.vscodeWindowId;
			this.reporterWindows.set(windowId, reporterWindow);
			const window = reporterWindow;
			window.add(Event.once(auxiliaryWindow.onWillDispose)(() => this.reporterWindows.deleteAndDispose(windowId)));
			window.add(Event.once(auxiliaryWindow.onUnload)(() => window.auxiliaryWindow.dispose()));
			window.add(auxiliaryWindow.registerCloseHandler({
				close: () => this.closeReporterWindow(window),
				isReadyToClose: () => !window.isDisposed && window.ready.isSettled && input.isDisposed(),
			}));
			this.registerReporterWindowKeys(window);
			auxiliaryWindow.window.document.title = localize('issueReporterWindowTitle', "Issue Reporter");
			auxiliaryWindow.container.classList.add('issue-reporter-window');
			const controller = window.add(this.instantiationService.createInstance(IssueReporterController, auxiliaryWindow.container, {
				reveal: async () => {
					if (!window.isDisposed && !input.isDisposed()) {
						await this.hostService.focus(window.auxiliaryWindow.window);
						window.controller?.focus();
					}
				},
				close: () => window.auxiliaryWindow.window.close(),
				getPreviewGroup: () => this.editorGroupService.mainPart.activeGroup,
			}));
			window.controller = controller;
			window.add(auxiliaryWindow.onDidLayout(dimension => controller.layout(dimension)));
			controller.setInput(input);
			auxiliaryWindow.layout();
		} catch (error) {
			if (auxiliaryWindow && reporterWindow) {
				input.dispose();
				auxiliaryWindow.window.close();
			}
			throw error;
		} finally {
			if (reporterWindow) {
				void reporterWindow.ready.complete();
			}
			if (!reporterWindow && !this.editorGroupService.groups.some(group => group.editors.includes(input))) {
				input.dispose();
				auxiliaryWindow?.dispose();
			}
		}
	}

	private registerReporterWindowKeys(window: ReporterWindow): void {
		const targetWindow = window.auxiliaryWindow.window;
		window.add(addDisposableListener(targetWindow.document, EventType.KEY_DOWN, (event: KeyboardEvent) => {
			// Let controls and native editing handle keys, but never dispatch them to the workbench.
			event.stopPropagation();
			const key = new StandardKeyboardEvent(event);
			const primary = isMacintosh ? key.metaKey : key.ctrlKey;
			const secondary = isMacintosh ? key.ctrlKey : key.metaKey;
			if (primary && !secondary && !key.altKey && key.keyCode === KeyCode.KeyW) {
				event.preventDefault();
				window.auxiliaryWindow.window.close();
			}
		}));
		window.add(addDisposableListener(targetWindow.document, EventType.KEY_UP, event => event.stopPropagation()));
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
		await window.ready.p;
		if (window.isDisposed) {
			return false;
		}
		if (!window.input.isDisposed() && window.input.closeHandler.showConfirm()
			&& await window.input.closeHandler.confirm([]) === ConfirmResult.CANCEL) {
			return false;
		}
		if (window.isDisposed) {
			return false;
		}
		window.input.dispose();
		return true;
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
