/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import { TPromise } from 'vs/base/common/winjs.base';
import arrays = require('vs/base/common/arrays');
import objects = require('vs/base/common/objects');
import DOM = require('vs/base/browser/dom');
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, Action } from 'vs/base/common/actions';
import { AutoSaveConfiguration, IFileService } from 'vs/platform/files/common/files';
import { toResource } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService, IResourceInputType } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IWindowsService, IWindowService, IWindowSettings, IPath, IOpenFileRequest, IWindowsConfiguration, IAddFoldersRequest, IRunActionInWindowRequest } from 'vs/platform/windows/common/windows';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IWorkbenchThemeService, VS_HC_THEME, VS_DARK_THEME } from 'vs/workbench/services/themes/common/workbenchThemeService';
import * as browser from 'vs/base/browser/browser';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Position, IResourceInput, IUntitledResourceInput, IEditor } from 'vs/platform/editor/common/editor';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { Themable } from 'vs/workbench/common/theme';
import { ipcRenderer as ipc, webFrame } from 'electron';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IMenuService, MenuId, IMenu, MenuItemAction, ICommandAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { LifecyclePhase, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { AccessibilitySupport, isRootUser, isWindows, isMacintosh } from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import { INotificationService } from 'vs/platform/notification/common/notification';

const TextInputActions: IAction[] = [
	new Action('undo', nls.localize('undo', "Undo"), null, true, () => document.execCommand('undo') && TPromise.as(true)),
	new Action('redo', nls.localize('redo', "Redo"), null, true, () => document.execCommand('redo') && TPromise.as(true)),
	new Separator(),
	new Action('editor.action.clipboardCutAction', nls.localize('cut', "Cut"), null, true, () => document.execCommand('cut') && TPromise.as(true)),
	new Action('editor.action.clipboardCopyAction', nls.localize('copy', "Copy"), null, true, () => document.execCommand('copy') && TPromise.as(true)),
	new Action('editor.action.clipboardPasteAction', nls.localize('paste', "Paste"), null, true, () => document.execCommand('paste') && TPromise.as(true)),
	new Separator(),
	new Action('editor.action.selectAll', nls.localize('selectAll', "Select All"), null, true, () => document.execCommand('selectAll') && TPromise.as(true))
];

export class ElectronWindow extends Themable {

	private static readonly AUTO_SAVE_SETTING = 'files.autoSave';

	private touchBarUpdater: RunOnceScheduler;
	private touchBarMenu: IMenu;
	private touchBarDisposables: IDisposable[];
	private lastInstalledTouchedBar: ICommandAction[][];

	private previousConfiguredZoomLevel: number;

	private addFoldersScheduler: RunOnceScheduler;
	private pendingFoldersToAdd: IAddFoldersRequest[];

	constructor(
		shellContainer: HTMLElement,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@ITitleService private titleService: ITitleService,
		@IWorkbenchThemeService protected themeService: IWorkbenchThemeService,
		@INotificationService private notificationService: INotificationService,
		@ICommandService private commandService: ICommandService,
		@IExtensionService private extensionService: IExtensionService,
		@IViewletService private viewletService: IViewletService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IFileService private fileService: IFileService,
		@IMenuService private menuService: IMenuService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IIntegrityService private integrityService: IIntegrityService
	) {
		super(themeService);

		this.touchBarDisposables = [];

		this.touchBarUpdater = new RunOnceScheduler(() => this.doSetupTouchbar(), 300);
		this.toUnbind.push(this.touchBarUpdater);

		this.pendingFoldersToAdd = [];
		this.addFoldersScheduler = new RunOnceScheduler(() => this.doAddFolders(), 100);
		this.toUnbind.push(this.addFoldersScheduler);

		this.registerListeners();
		this.create();
	}

	private registerListeners(): void {

		// React to editor input changes
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => {

			// Represented File Name
			const file = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
			this.titleService.setRepresentedFilename(file ? file.fsPath : '');

			// Touch Bar
			this.updateTouchbarMenu();
		}));

		// prevent opening a real URL inside the shell
		[DOM.EventType.DRAG_OVER, DOM.EventType.DROP].forEach(event => {
			window.document.body.addEventListener(event, (e: DragEvent) => {
				DOM.EventHelper.stop(e);
			});
		});

		// Support runAction event
		ipc.on('vscode:runAction', (_event: any, request: IRunActionInWindowRequest) => {
			const args: any[] = [];

			// If we run an action from the touchbar, we fill in the currently active resource
			// as payload because the touch bar items are context aware depending on the editor
			if (request.from === 'touchbar') {
				const activeEditor = this.editorService.getActiveEditor();
				if (activeEditor) {
					const resource = toResource(activeEditor.input, { supportSideBySide: true });
					if (resource) {
						args.push(resource);
					}
				}
			} else {
				args.push({ from: request.from }); // TODO@telemetry this is a bit weird to send this to every action?
			}

			this.commandService.executeCommand(request.id, ...args).done(_ => {
				/* __GDPR__
					"commandExecuted" : {
						"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('commandExecuted', { id: request.id, from: request.from });
			}, err => {
				this.notificationService.error(err);
			});
		});

		// Support resolve keybindings event
		ipc.on('vscode:resolveKeybindings', (_event: any, rawActionIds: string) => {
			let actionIds: string[] = [];
			try {
				actionIds = JSON.parse(rawActionIds);
			} catch (error) {
				// should not happen
			}

			// Resolve keys using the keybinding service and send back to browser process
			this.resolveKeybindings(actionIds).done(keybindings => {
				if (keybindings.length) {
					ipc.send('vscode:keybindingsResolved', JSON.stringify(keybindings));
				}
			}, () => errors.onUnexpectedError);
		});

		ipc.on('vscode:reportError', (_event: any, error: string) => {
			if (error) {
				const errorParsed = JSON.parse(error);
				errorParsed.mainProcess = true;
				errors.onUnexpectedError(errorParsed);
			}
		});

		// Support openFiles event for existing and new files
		ipc.on('vscode:openFiles', (_event: any, request: IOpenFileRequest) => this.onOpenFiles(request));

		// Support addFolders event if we have a workspace opened
		ipc.on('vscode:addFolders', (_event: any, request: IAddFoldersRequest) => this.onAddFoldersRequest(request));

		// Message support
		ipc.on('vscode:showInfoMessage', (_event: any, message: string) => {
			this.notificationService.info(message);
		});

		// Support toggling auto save
		ipc.on('vscode.toggleAutoSave', () => {
			this.toggleAutoSave();
		});

		// Fullscreen Events
		ipc.on('vscode:enterFullScreen', () => {
			this.lifecycleService.when(LifecyclePhase.Running).then(() => {
				browser.setFullscreen(true);
			});
		});

		ipc.on('vscode:leaveFullScreen', () => {
			this.lifecycleService.when(LifecyclePhase.Running).then(() => {
				browser.setFullscreen(false);
			});
		});

		// High Contrast Events
		ipc.on('vscode:enterHighContrast', () => {
			const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
			if (windowConfig && windowConfig.autoDetectHighContrast) {
				this.lifecycleService.when(LifecyclePhase.Running).then(() => {
					this.themeService.setColorTheme(VS_HC_THEME, null);
				});
			}
		});

		ipc.on('vscode:leaveHighContrast', () => {
			const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
			if (windowConfig && windowConfig.autoDetectHighContrast) {
				this.lifecycleService.when(LifecyclePhase.Running).then(() => {
					this.themeService.setColorTheme(VS_DARK_THEME, null);
				});
			}
		});

		// keyboard layout changed event
		ipc.on('vscode:keyboardLayoutChanged', () => {
			KeyboardMapperFactory.INSTANCE._onKeyboardLayoutChanged();
		});

		// keyboard layout changed event
		ipc.on('vscode:accessibilitySupportChanged', (_event: any, accessibilitySupportEnabled: boolean) => {
			browser.setAccessibilitySupport(accessibilitySupportEnabled ? AccessibilitySupport.Enabled : AccessibilitySupport.Disabled);
		});

		// Zoom level changes
		this.updateWindowZoomLevel();
		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.zoomLevel')) {
				this.updateWindowZoomLevel();
			}
		}));

		// Context menu support in input/textarea
		window.document.addEventListener('contextmenu', e => this.onContextMenu(e));
	}

	private onContextMenu(e: PointerEvent): void {
		if (e.target instanceof HTMLElement) {
			const target = <HTMLElement>e.target;
			if (target.nodeName && (target.nodeName.toLowerCase() === 'input' || target.nodeName.toLowerCase() === 'textarea')) {
				e.preventDefault();
				e.stopPropagation();

				this.contextMenuService.showContextMenu({
					getAnchor: () => e,
					getActions: () => TPromise.as(TextInputActions)
				});
			}
		}
	}

	private updateWindowZoomLevel(): void {
		const windowConfig: IWindowsConfiguration = this.configurationService.getValue<IWindowsConfiguration>();

		let newZoomLevel = 0;
		if (windowConfig.window && typeof windowConfig.window.zoomLevel === 'number') {
			newZoomLevel = windowConfig.window.zoomLevel;

			// Leave early if the configured zoom level did not change (https://github.com/Microsoft/vscode/issues/1536)
			if (this.previousConfiguredZoomLevel === newZoomLevel) {
				return;
			}

			this.previousConfiguredZoomLevel = newZoomLevel;
		}

		if (webFrame.getZoomLevel() !== newZoomLevel) {
			webFrame.setZoomLevel(newZoomLevel);
			browser.setZoomFactor(webFrame.getZoomFactor());
			// See https://github.com/Microsoft/vscode/issues/26151
			// Cannot be trusted because the webFrame might take some time
			// until it really applies the new zoom level
			browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
		}
	}

	private create(): void {

		// Handle window.open() calls
		const $this = this;
		(<any>window).open = function (url: string, target: string, features: string, replace: boolean): any {
			$this.windowsService.openExternal(url);

			return null;
		};

		// Send over all extension viewlets when extensions are ready
		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			ipc.send('vscode:extensionViewlets', JSON.stringify(this.viewletService.getViewlets().filter(v => !!v.extensionId).map(v => { return { id: v.id, label: v.name }; })));
		});

		// Emit event when vscode has loaded
		this.lifecycleService.when(LifecyclePhase.Running).then(() => {
			ipc.send('vscode:workbenchLoaded', this.windowService.getCurrentWindowId());
		});

		// Touchbar Support
		this.updateTouchbarMenu();

		// Integrity warning
		this.integrityService.isPure().then(res => this.titleService.updateProperties({ isPure: res.isPure }));

		// Root warning
		this.lifecycleService.when(LifecyclePhase.Running).then(() => {
			let isAdminPromise: Promise<boolean>;
			if (isWindows) {
				isAdminPromise = import('native-is-elevated').then(isElevated => isElevated());
			} else {
				isAdminPromise = Promise.resolve(isRootUser());
			}

			return isAdminPromise.then(isAdmin => {

				// Update title
				this.titleService.updateProperties({ isAdmin });

				// Show warning message (unix only)
				if (isAdmin && !isWindows) {
					this.notificationService.warn(nls.localize('runningAsRoot', "It is not recommended to run {0} as root user.", product.nameShort));
				}
			});
		});
	}

	private updateTouchbarMenu(): void {
		if (!isMacintosh) {
			return; // macOS only
		}

		const touchbarEnabled = this.configurationService.getValue<boolean>('keyboard.touchbar.enabled');
		if (!touchbarEnabled) {
			return; // disabled via setting
		}

		// Dispose old
		this.touchBarDisposables = dispose(this.touchBarDisposables);

		// Create new
		this.touchBarMenu = this.editorGroupService.invokeWithinEditorContext(accessor => this.menuService.createMenu(MenuId.TouchBarContext, accessor.get(IContextKeyService)));
		this.touchBarDisposables.push(this.touchBarMenu);
		this.touchBarDisposables.push(this.touchBarMenu.onDidChange(() => {
			this.scheduleSetupTouchbar();
		}));

		this.scheduleSetupTouchbar();
	}

	private scheduleSetupTouchbar(): void {
		this.touchBarUpdater.schedule();
	}

	private doSetupTouchbar(): void {
		const actions: (MenuItemAction | Separator)[] = [];

		// Fill actions into groups respecting order
		fillInActions(this.touchBarMenu, void 0, actions, this.contextMenuService);

		// Convert into command action multi array
		const items: ICommandAction[][] = [];
		let group: ICommandAction[] = [];
		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];

			// Command
			if (action instanceof MenuItemAction) {
				group.push(action.item);
			}

			// Separator
			else if (action instanceof Separator) {
				if (group.length) {
					items.push(group);
				}

				group = [];
			}
		}

		if (group.length) {
			items.push(group);
		}

		// Only update if the actions have changed
		if (!objects.equals(this.lastInstalledTouchedBar, items)) {
			this.lastInstalledTouchedBar = items;
			this.windowService.updateTouchBar(items);
		}
	}

	private resolveKeybindings(actionIds: string[]): TPromise<{ id: string; label: string, isNative: boolean; }[]> {
		return TPromise.join([this.lifecycleService.when(LifecyclePhase.Running), this.extensionService.whenInstalledExtensionsRegistered()]).then(() => {
			return arrays.coalesce(actionIds.map(id => {
				const binding = this.keybindingService.lookupKeybinding(id);
				if (!binding) {
					return null;
				}

				// first try to resolve a native accelerator
				const electronAccelerator = binding.getElectronAccelerator();
				if (electronAccelerator) {
					return { id, label: electronAccelerator, isNative: true };
				}

				// we need this fallback to support keybindings that cannot show in electron menus (e.g. chords)
				const acceleratorLabel = binding.getLabel();
				if (acceleratorLabel) {
					return { id, label: acceleratorLabel, isNative: false };
				}

				return null;
			}));
		});
	}

	private onAddFoldersRequest(request: IAddFoldersRequest): void {

		// Buffer all pending requests
		this.pendingFoldersToAdd.push(request);

		// Delay the adding of folders a bit to buffer in case more requests are coming
		if (!this.addFoldersScheduler.isScheduled()) {
			this.addFoldersScheduler.schedule();
		}
	}

	private doAddFolders(): void {
		const foldersToAdd: IWorkspaceFolderCreationData[] = [];

		this.pendingFoldersToAdd.forEach(request => {
			foldersToAdd.push(...request.foldersToAdd.map(folderToAdd => ({ uri: URI.file(folderToAdd.filePath) })));
		});

		this.pendingFoldersToAdd = [];

		this.workspaceEditingService.addFolders(foldersToAdd).done(null, errors.onUnexpectedError);
	}

	private onOpenFiles(request: IOpenFileRequest): void {
		const inputs: IResourceInputType[] = [];
		const diffMode = (request.filesToDiff.length === 2);

		if (!diffMode && request.filesToOpen) {
			inputs.push(...this.toInputs(request.filesToOpen, false));
		}

		if (!diffMode && request.filesToCreate) {
			inputs.push(...this.toInputs(request.filesToCreate, true));
		}

		if (diffMode) {
			inputs.push(...this.toInputs(request.filesToDiff, false));
		}

		if (inputs.length) {
			this.openResources(inputs, diffMode).then(null, errors.onUnexpectedError);
		}

		if (request.filesToWait && inputs.length) {
			// In wait mode, listen to changes to the editors and wait until the files
			// are closed that the user wants to wait for. When this happens we delete
			// the wait marker file to signal to the outside that editing is done.
			const resourcesToWaitFor = request.filesToWait.paths.map(p => URI.file(p.filePath));
			const waitMarkerFile = URI.file(request.filesToWait.waitMarkerFilePath);
			const stacks = this.editorGroupService.getStacksModel();
			const unbind = stacks.onEditorClosed(() => {
				if (resourcesToWaitFor.every(r => !stacks.isOpen(r))) {
					unbind.dispose();
					this.fileService.del(waitMarkerFile).done(null, errors.onUnexpectedError);
				}
			});
		}
	}

	private openResources(resources: (IResourceInput | IUntitledResourceInput)[], diffMode: boolean): Thenable<IEditor | IEditor[]> {
		return this.lifecycleService.when(LifecyclePhase.Running).then((): TPromise<IEditor | IEditor[]> => {

			// In diffMode we open 2 resources as diff
			if (diffMode && resources.length === 2) {
				return this.editorService.openEditor({ leftResource: resources[0].resource, rightResource: resources[1].resource, options: { pinned: true } });
			}

			// For one file, just put it into the current active editor
			if (resources.length === 1) {
				return this.editorService.openEditor(resources[0]);
			}

			// Otherwise open all
			const activeEditor = this.editorService.getActiveEditor();
			return this.editorService.openEditors(resources.map((r, index) => {
				return {
					input: r,
					position: activeEditor ? activeEditor.position : Position.ONE
				};
			}));
		});
	}

	private toInputs(paths: IPath[], isNew: boolean): IResourceInputType[] {
		return paths.map(p => {
			const resource = URI.file(p.filePath);
			let input: IResourceInput | IUntitledResourceInput;
			if (isNew) {
				input = { filePath: resource.fsPath, options: { pinned: true } } as IUntitledResourceInput;
			} else {
				input = { resource, options: { pinned: true } } as IResourceInput;
			}

			if (!isNew && p.lineNumber) {
				input.options.selection = {
					startLineNumber: p.lineNumber,
					startColumn: p.columnNumber
				};
			}

			return input;
		});
	}

	private toggleAutoSave(): void {
		const setting = this.configurationService.inspect(ElectronWindow.AUTO_SAVE_SETTING);
		let userAutoSaveConfig = setting.user;
		if (types.isUndefinedOrNull(userAutoSaveConfig)) {
			userAutoSaveConfig = setting.default; // use default if setting not defined
		}

		let newAutoSaveValue: string;
		if ([AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE].some(s => s === userAutoSaveConfig)) {
			newAutoSaveValue = AutoSaveConfiguration.OFF;
		} else {
			newAutoSaveValue = AutoSaveConfiguration.AFTER_DELAY;
		}

		this.configurationService.updateValue(ElectronWindow.AUTO_SAVE_SETTING, newAutoSaveValue, ConfigurationTarget.USER);
	}

	public dispose(): void {
		this.touchBarDisposables = dispose(this.touchBarDisposables);

		super.dispose();
	}
}
