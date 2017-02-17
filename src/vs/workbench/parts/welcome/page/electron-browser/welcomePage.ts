/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./welcomePage';
import URI from 'vs/base/common/uri';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import * as arrays from 'vs/base/common/arrays';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Schemas } from 'vs/base/common/network';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IMessageService, Severity, CancelAction } from 'vs/platform/message/common/message';
import { getInstalledKeymaps } from 'vs/workbench/parts/extensions/electron-browser/keymapExtensions';
import { IExtensionEnablementService, IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { used } from 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page';

used();

const enabledKey = 'workbench.welcome.enabled';
const telemetryFrom = 'welcomePage';

export class WelcomePageContribution implements IWorkbenchContribution {

	constructor(
		@IPartService partService: IPartService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IBackupFileService backupFileService: IBackupFileService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		const enabled = configurationService.lookup<boolean>(enabledKey).value;
		if (enabled) {
			TPromise.join([
				backupFileService.hasBackups(),
				partService.joinCreation()
			]).then(([hasBackups]) => {
				const activeInput = editorService.getActiveEditorInput();
				if (!activeInput && !hasBackups) {
					instantiationService.createInstance(WelcomePage);
				}
			}).then(null, onUnexpectedError);
		}
	}

	public getId() {
		return 'vs.welcomePage';
	}
}

export class WelcomePageAction extends Action {

	public static ID = 'workbench.action.showWelcomePage';
	public static LABEL = localize('welcomePage', "Welcome");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		this.instantiationService.createInstance(WelcomePage);
		return null;
	}
}

const reorderedQuickLinks = [
	'showInterfaceOverview',
	'selectTheme',
	'showRecommendedKeymapExtensions',
	'showCommands',
	'keybindingsReference',
	'openGlobalSettings',
	'showInteractivePlayground',
];

class WelcomePage {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IMessageService private messageService: IMessageService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.create();
	}

	private create() {
		const recentlyOpened = this.windowService.getRecentlyOpen();
		const uri = URI.parse('vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page')
			.with({ scheme: Schemas.walkThrough });
		const input = this.instantiationService.createInstance(WalkThroughInput, localize('welcome.title', "Welcome"), '', uri, telemetryFrom, container => this.onReady(container, recentlyOpened));
		this.editorService.openEditor(input, { pinned: true }, Position.ONE)
			.then(null, onUnexpectedError);
	}

	private onReady(container: HTMLElement, recentlyOpened: TPromise<{ files: string[]; folders: string[]; }>): void {
		const enabled = this.configurationService.lookup<boolean>(enabledKey).value;
		const showOnStartup = <HTMLInputElement>container.querySelector('#showOnStartup');
		if (enabled) {
			showOnStartup.setAttribute('checked', 'checked');
		}
		showOnStartup.addEventListener('click', e => {
			this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: enabledKey, value: showOnStartup.checked })
				.then(null, error => this.messageService.show(Severity.Error, error));
		});

		recentlyOpened.then(({folders}) => {
			if (this.contextService.hasWorkspace()) {
				const current = this.contextService.getWorkspace().resource.fsPath;
				folders = folders.filter(folder => folder !== current);
			}
			if (!folders.length) {
				const recent = container.querySelector('.welcomePage') as HTMLElement;
				recent.classList.add('emptyRecent');
				return;
			}
			const ul = container.querySelector('.recent ul');
			folders.slice(0, 5).forEach(folder => {
				const li = document.createElement('li');

				const a = document.createElement('a');
				let name = path.basename(folder);
				let parentFolder = path.dirname(folder);
				if (!name && parentFolder) {
					const tmp = name;
					name = parentFolder;
					parentFolder = tmp;
				}
				a.innerText = name;
				a.title = folder;
				a.href = 'javascript:void(0)';
				a.addEventListener('click', e => {
					this.telemetryService.publicLog('workbenchActionExecuted', {
						id: 'openRecentFolder',
						from: telemetryFrom
					});
					this.windowsService.openWindow([folder]);
					e.preventDefault();
					e.stopPropagation();
				});
				li.appendChild(a);

				const span = document.createElement('span');
				span.classList.add('path');
				if ((platform.isMacintosh || platform.isLinux) && strings.startsWith(parentFolder, this.environmentService.userHome)) {
					parentFolder = `~${parentFolder.substr(this.environmentService.userHome.length)}`;
				}
				span.innerText = parentFolder;
				span.title = folder;
				li.appendChild(span);

				ul.appendChild(li);
			});
		}).then(null, onUnexpectedError);

		if (this.telemetryService.getExperiments().reorderQuickLinks) {
			reorderedQuickLinks.forEach(clazz => {
				const link = container.querySelector(`.commands .${clazz}`);
				if (link) {
					link.parentElement.appendChild(link);
				}
			});
		}

		container.addEventListener('click', event => {
			for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
				if (node instanceof HTMLAnchorElement && node.classList.contains('installKeymap')) {
					const keymapName = node.getAttribute('data-keymap-name');
					const keymapIdentifier = node.getAttribute('data-keymap');
					if (keymapName && keymapIdentifier) {
						this.installKeymap(keymapName, keymapIdentifier).then(null, err => {
							this.messageService.show(Severity.Error, err);
						});
						event.preventDefault();
						event.stopPropagation();
					}
				}
			}
		});
	}

	private installKeymap(keymapName: string, keymapIdentifier: string): TPromise<void> {
		return this.instantiationService.invokeFunction(getInstalledKeymaps).then(extensions => {
			const keymap = arrays.first(extensions, extension => extension.identifier === keymapIdentifier);
			if (keymap && keymap.globallyEnabled) {
				this.messageService.show(Severity.Info, localize('welcomePage.keymapAlreadyInstalled', "The {0} keyboard shortcuts are already installed.", keymapName));
				return;
			}
			this.messageService.show(Severity.Info, {
				message: localize('welcomePage.willReloadAfterInstallingKeymap', "The window will quickly reload after installing the {0} keyboard shortcuts.", keymapName),
				actions: [
					new Action('ok', localize('ok', "OK"), null, true, () => {
						return TPromise.join(extensions.filter(extension => extension.globallyEnabled)
							.map(extension => {
								return this.extensionEnablementService.setEnablement(extension.identifier, false);
							})).then(() => {
								if (keymap) {
									return this.extensionEnablementService.setEnablement(keymap.identifier, true)
										.then(() => {
											return this.windowService.reloadWindow();
										});
								}
								return this.extensionGalleryService.query({ names: [keymapIdentifier] })
									.then(result => {
										const [extension] = result.firstPage;
										if (!extension) {
											this.messageService.show(Severity.Error, localize('welcomePage.keymapNotFound', "The {0} keyboard shortcuts with id {1} could not be found.", keymapName, keymapIdentifier));
											return undefined;
										}
										return this.extensionManagementService.installFromGallery(extension)
											.then(() => {
												return this.windowService.reloadWindow();
											});
									});
							});
					}),
					CancelAction
				]
			});
		});
	}
}
