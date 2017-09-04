/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import { TPromise } from 'vs/base/common/winjs.base';
import arrays = require('vs/base/common/arrays');
import DOM = require('vs/base/browser/dom');
import Severity from 'vs/base/common/severity';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, Action } from 'vs/base/common/actions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { AutoSaveConfiguration } from 'vs/platform/files/common/files';
import { toResource } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService, IResourceInputType } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IWindowsService, IWindowService, IWindowSettings, IPath, IOpenFileRequest, IWindowsConfiguration, IAddFoldersRequest } from 'vs/platform/windows/common/windows';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IWorkbenchThemeService, VS_HC_THEME, VS_DARK_THEME } from 'vs/workbench/services/themes/common/workbenchThemeService';
import * as browser from 'vs/base/browser/browser';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Position, IResourceInput, IUntitledResourceInput, IEditor } from 'vs/platform/editor/common/editor';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { Themable } from 'vs/workbench/common/theme';
import { ipcRenderer as ipc, webFrame } from 'electron';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';

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

	private static AUTO_SAVE_SETTING = 'files.autoSave';

	constructor(
		shellContainer: HTMLElement,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IPartService private partService: IPartService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@ITitleService private titleService: ITitleService,
		@IWorkbenchThemeService protected themeService: IWorkbenchThemeService,
		@IMessageService private messageService: IMessageService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@ICommandService private commandService: ICommandService,
		@IExtensionService private extensionService: IExtensionService,
		@IViewletService private viewletService: IViewletService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService
	) {
		super(themeService);

		this.registerListeners();
		this.setup();
	}

	private registerListeners(): void {

		// React to editor input changes
		this.editorGroupService.onEditorsChanged(() => {
			const file = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });

			this.titleService.setRepresentedFilename(file ? file.fsPath : '');
		});

		// prevent opening a real URL inside the shell
		[DOM.EventType.DRAG_OVER, DOM.EventType.DROP].forEach(event => {
			window.document.body.addEventListener(event, (e: DragEvent) => {
				DOM.EventHelper.stop(e);
			});
		});

		// Handle window.open() calls
		const $this = this;
		(<any>window).open = function (url: string, target: string, features: string, replace: boolean) {
			$this.windowsService.openExternal(url);

			return null;
		};
	}

	private setup(): void {

		// Support runAction event
		ipc.on('vscode:runAction', (event, actionId: string) => {
			this.commandService.executeCommand(actionId, { from: 'menu' }).done(_ => {
				this.telemetryService.publicLog('commandExecuted', { id: actionId, from: 'menu' });
			}, err => {
				this.messageService.show(Severity.Error, err);
			});
		});

		// Support resolve keybindings event
		ipc.on('vscode:resolveKeybindings', (event, rawActionIds: string) => {
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

		// Send over all extension viewlets when extensions are ready
		this.extensionService.onReady().then(() => {
			ipc.send('vscode:extensionViewlets', JSON.stringify(this.viewletService.getViewlets().filter(v => !!v.extensionId).map(v => { return { id: v.id, label: v.name }; })));
		});

		ipc.on('vscode:reportError', (event, error) => {
			if (error) {
				const errorParsed = JSON.parse(error);
				errorParsed.mainProcess = true;
				errors.onUnexpectedError(errorParsed);
			}
		});

		// Support openFiles event for existing and new files
		ipc.on('vscode:openFiles', (event, request: IOpenFileRequest) => this.onOpenFiles(request));

		// Support addFolders event if we have a workspace opened
		ipc.on('vscode:addFolders', (event, request: IAddFoldersRequest) => this.onAddFolders(request));

		// Emit event when vscode has loaded
		this.partService.joinCreation().then(() => {
			ipc.send('vscode:workbenchLoaded', this.windowService.getCurrentWindowId());
		});

		// Message support
		ipc.on('vscode:showInfoMessage', (event, message: string) => {
			this.messageService.show(Severity.Info, message);
		});

		// Support toggling auto save
		ipc.on('vscode.toggleAutoSave', event => {
			this.toggleAutoSave();
		});

		// Fullscreen Events
		ipc.on('vscode:enterFullScreen', event => {
			this.partService.joinCreation().then(() => {
				browser.setFullscreen(true);
			});
		});

		ipc.on('vscode:leaveFullScreen', event => {
			this.partService.joinCreation().then(() => {
				browser.setFullscreen(false);
			});
		});

		// High Contrast Events
		ipc.on('vscode:enterHighContrast', event => {
			const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
			if (windowConfig && windowConfig.autoDetectHighContrast) {
				this.partService.joinCreation().then(() => {
					this.themeService.setColorTheme(VS_HC_THEME, null);
				});
			}
		});

		ipc.on('vscode:leaveHighContrast', event => {
			const windowConfig = this.configurationService.getConfiguration<IWindowSettings>('window');
			if (windowConfig && windowConfig.autoDetectHighContrast) {
				this.partService.joinCreation().then(() => {
					this.themeService.setColorTheme(VS_DARK_THEME, null);
				});
			}
		});

		// keyboard layout changed event
		ipc.on('vscode:keyboardLayoutChanged', (event, isISOKeyboard: boolean) => {
			KeyboardMapperFactory.INSTANCE._onKeyboardLayoutChanged(isISOKeyboard);
		});

		// keyboard layout changed event
		ipc.on('vscode:accessibilitySupportChanged', (event, accessibilitySupportEnabled: boolean) => {
			browser.setAccessibilitySupport(accessibilitySupportEnabled ? platform.AccessibilitySupport.Enabled : platform.AccessibilitySupport.Disabled);
		});

		// Configuration changes
		let previousConfiguredZoomLevel: number;
		this.configurationService.onDidUpdateConfiguration(e => {
			const windowConfig: IWindowsConfiguration = this.configurationService.getConfiguration<IWindowsConfiguration>();

			let newZoomLevel = 0;
			if (windowConfig.window && typeof windowConfig.window.zoomLevel === 'number') {
				newZoomLevel = windowConfig.window.zoomLevel;

				// Leave early if the configured zoom level did not change (https://github.com/Microsoft/vscode/issues/1536)
				if (previousConfiguredZoomLevel === newZoomLevel) {
					return;
				}

				previousConfiguredZoomLevel = newZoomLevel;
			}

			if (webFrame.getZoomLevel() !== newZoomLevel) {
				webFrame.setZoomLevel(newZoomLevel);
				browser.setZoomFactor(webFrame.getZoomFactor());
				// See https://github.com/Microsoft/vscode/issues/26151
				// Cannot be trusted because the webFrame might take some time
				// until it really applies the new zoom level
				browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
			}
		});

		// Context menu support in input/textarea
		window.document.addEventListener('contextmenu', e => {
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
		});
	}

	private resolveKeybindings(actionIds: string[]): TPromise<{ id: string; label: string, isNative: boolean; }[]> {
		return TPromise.join([this.partService.joinCreation(), this.extensionService.onReady()]).then(() => {
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

	private onAddFolders(request: IAddFoldersRequest): void {
		const foldersToAdd = request.foldersToAdd.map(folderToAdd => URI.file(folderToAdd.filePath));

		// Workspace: just add to workspace config
		if (this.contextService.hasMultiFolderWorkspace()) {
			this.workspaceEditingService.addRoots(foldersToAdd).done(null, errors.onUnexpectedError);
		}

		// Single folder or no workspace: create workspace and open
		else {
			let workspaceFolders: URI[] = [];

			// Folder of workspace is the first of multi root workspace, so add it
			if (this.contextService.hasFolderWorkspace()) {
				workspaceFolders.push(...this.contextService.getWorkspace().roots);
			}

			// Fill in remaining ones from request
			workspaceFolders.push(...request.foldersToAdd.map(folderToAdd => URI.file(folderToAdd.filePath)));

			// Create workspace and open (ensure no duplicates)
			this.windowService.createAndOpenWorkspace(arrays.distinct(workspaceFolders.map(folder => folder.fsPath), folder => platform.isLinux ? folder : folder.toLowerCase()));
		}
	}

	private onOpenFiles(request: IOpenFileRequest): void {
		let inputs: IResourceInputType[] = [];
		let diffMode = (request.filesToDiff.length === 2);

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
			this.openResources(inputs, diffMode).done(null, errors.onUnexpectedError);
		}
	}

	private openResources(resources: (IResourceInput | IUntitledResourceInput)[], diffMode: boolean): TPromise<IEditor | IEditor[]> {
		return this.partService.joinCreation().then((): TPromise<IEditor | IEditor[]> => {


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
		const setting = this.configurationService.lookup(ElectronWindow.AUTO_SAVE_SETTING);
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

		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ElectronWindow.AUTO_SAVE_SETTING, value: newAutoSaveValue });
	}
}
