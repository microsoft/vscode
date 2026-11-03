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
import { addDisposableListener, EventType, isHTMLInputElement, isHTMLTextAreaElement } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
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
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { applyZoom, zoomIn, zoomOut } from '../../../../platform/window/electron-browser/window.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import { IssueReporter } from './issueReporterService.js';
import { IssueReporterController } from './issueReporterController.js';
import { localize } from '../../../../nls.js';

class ReporterWindow extends DisposableStore {
	readonly ready = new DeferredPromise<void>();
	closeOperation: Promise<boolean> | undefined;
	confirmOperation: Promise<boolean> | undefined;
	controller: IssueReporterController | undefined;
	closeApproved = false;

	constructor(readonly auxiliaryWindow: IAuxiliaryWindow, readonly input: IssueReporterEditorInput) {
		super();
		this.add(input);
		this.add(auxiliaryWindow);
		this.add(toDisposable(() => {
			void this.ready.complete();
		}));
	}

}

export class NativeIssueFormService extends IssueFormService implements IIssueFormService {

	private openingReporter: Promise<void> | undefined;
	private shuttingDown = false;
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
		@ILifecycleService lifecycleService: ILifecycleService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(instantiationService, auxiliaryWindowService, menuService, contextKeyService, logService, dialogService, hostService, openerService, fileService, githubUploadService, editorService, clipboardService, gitHubService);
		this._register(lifecycleService.onBeforeShutdown(event => {
			this.shuttingDown = true;
			if (this.reporterWindows.size || this.openingReporter) {
				event.veto(this.vetoShutdown(), 'issueReporter');
			}
		}));
		const resetShutdown = () => {
			this.shuttingDown = false;
			for (const window of this.reporterWindows.values()) {
				window.closeApproved = false;
			}
		};
		this._register(lifecycleService.onShutdownVeto(resetShutdown));
		this._register(lifecycleService.onBeforeShutdownError(resetShutdown));
		this._register(lifecycleService.onWillShutdown(() => this.reporterWindows.clearAndDisposeAll()));
	}

	private async vetoShutdown(): Promise<boolean> {
		try {
			await this.openingReporter;
		} catch (error) {
			// The opener reports this error; shutdown only protects drafts that survived it.
			this.logService.trace('[IssueReporter] Opening failed while shutdown was waiting:', error);
		}
		for (const window of this.reporterWindows.values()) {
			if (!await this.confirmReporterWindow(window)) {
				return true;
			}
			window.input.cancelPendingSubmissions();
		}
		return false;
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
				bounds: { width: 800, height: 900 },
			});
			if (this._store.isDisposed) {
				return;
			}
			auxiliaryWindow.container.style.opacity = '0';
			reporterWindow = new ReporterWindow(auxiliaryWindow, input);
			const windowId = auxiliaryWindow.window.vscodeWindowId;
			this.reporterWindows.set(windowId, reporterWindow);
			const window = reporterWindow;
			window.add(addDisposableListener(auxiliaryWindow.window, EventType.UNLOAD, () => this.reporterWindows.deleteAndDispose(windowId), { once: true }));
			const beforeUnloadListener = auxiliaryWindow.onBeforeUnload(event => {
				if (window.isDisposed || input.isDisposed()) {
					return;
				}
				if (window.closeApproved) {
					window.closeApproved = false;
					return;
				}
				if (input.closeHandler.showConfirm()) {
					event.veto(localize('issueReporterUnsavedChanges', "The issue report has unsaved changes. Confirm whether to discard them to close the window."));
					void this.closeReporterWindow(window).catch(error => {
						this.logService.error('[IssueReporter] Close failed:', error);
						void this.dialogService.error(localize('issueReporterCloseFailed', "The issue reporter could not be closed. Please try again."))
							.catch(error => this.logService.error('[IssueReporter] Close error dialog failed:', error));
					});
				}
			});
			if (window.isDisposed) {
				beforeUnloadListener.dispose();
				return;
			}
			window.add(beforeUnloadListener);
			void auxiliaryWindow.whenStylesHaveLoaded.then(() => {
				if (!window.isDisposed) {
					window.auxiliaryWindow.container.style.removeProperty('opacity');
				}
			});
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
				this.reporterWindows.deleteAndDispose(auxiliaryWindow.window.vscodeWindowId);
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
			// Keep keybindings local to the standalone form.
			event.stopPropagation();
			const key = new StandardKeyboardEvent(event);
			const resolved = this.keybindingService.softDispatch(key, key.target ?? targetWindow.document.body);
			if (resolved.kind === ResultKind.KbFound) {
				if (this.zoomReporterWindow(window, resolved.commandId)) {
					event.preventDefault();
					return;
				}
				const target = key.target;
				if ((isHTMLInputElement(target) || isHTMLTextAreaElement(target)) &&
					(resolved.commandId === 'undo' || resolved.commandId === 'redo' || resolved.commandId === 'editor.action.selectAll')) {
					// macOS menu shortcuts can reach the form without a native browser editing action.
					event.preventDefault();
					if (resolved.commandId === 'undo') {
						target.ownerDocument.execCommand('undo');
					} else if (resolved.commandId === 'redo') {
						target.ownerDocument.execCommand('redo');
					} else {
						target.ownerDocument.execCommand('selectAll');
					}
					return;
				}
			}
			const primary = isMacintosh ? key.metaKey : key.ctrlKey;
			const secondary = isMacintosh ? key.ctrlKey : key.metaKey;
			if (primary && !secondary && !key.altKey && key.keyCode === KeyCode.KeyW) {
				event.preventDefault();
				window.auxiliaryWindow.window.close();
			}
		}));
		window.add(addDisposableListener(targetWindow.document, EventType.KEY_UP, event => event.stopPropagation()));
	}

	private zoomReporterWindow(window: ReporterWindow, commandId: string | null): boolean {
		if (window.isDisposed || window.input.isDisposed()) {
			return false;
		}
		const target = window.auxiliaryWindow.window;
		switch (commandId) {
			case 'workbench.action.zoomIn':
				zoomIn(target);
				return true;
			case 'workbench.action.zoomOut':
				zoomOut(target);
				return true;
			case 'workbench.action.zoomReset': {
				const level = this.configurationService.getValue<number>('window.zoomLevel');
				applyZoom(typeof level === 'number' ? level : 0, target);
				return true;
			}
		}
		return false;
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
		if (!await this.confirmReporterWindow(window) || window.isDisposed) {
			return false;
		}
		window.input.cancelPendingSubmissions();
		if (this.shuttingDown) {
			return false;
		}
		window.closeApproved = true;
		try {
			await this.nativeHostService.closeWindow({ targetWindowId: window.auxiliaryWindow.window.vscodeWindowId });
		} catch (error) {
			window.closeApproved = false;
			throw error;
		}
		return true;
	}

	private confirmReporterWindow(window: ReporterWindow): Promise<boolean> {
		if (window.confirmOperation) {
			return window.confirmOperation;
		}
		const operation = this.doConfirmReporterWindow(window);
		window.confirmOperation = operation;
		const clear = () => {
			if (window.confirmOperation === operation) {
				window.confirmOperation = undefined;
			}
		};
		void operation.then(clear, clear);
		return operation;
	}

	private async doConfirmReporterWindow(window: ReporterWindow): Promise<boolean> {
		await window.ready.p;
		if (window.isDisposed || window.input.isDisposed()) {
			return true;
		}
		return !window.input.closeHandler.showConfirm() || await window.input.closeHandler.confirm([]) !== ConfirmResult.CANCEL;
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
