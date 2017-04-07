/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./welcomePage';
import URI from 'vs/base/common/uri';
import * as path from 'path';
import * as arrays from 'vs/base/common/arrays';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError, isPromiseCanceledError } from 'vs/base/common/errors';
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
import { IMessageService, Severity, CloseAction } from 'vs/platform/message/common/message';
import { getInstalledKeymaps, IKeymapExtension, onKeymapExtensionChanged } from 'vs/workbench/parts/extensions/electron-browser/keymapExtensions';
import { IExtensionEnablementService, IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { used } from 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { tildify } from "vs/base/common/labels";

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

	private disposables: IDisposable[] = [];

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
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));
		this.create();
	}

	private create() {
		const recentlyOpened = this.windowService.getRecentlyOpen();
		const installedKeymaps = this.instantiationService.invokeFunction(getInstalledKeymaps);
		const uri = URI.parse(require.toUrl('./vs_code_welcome_page'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page' })
			});
		const input = this.instantiationService.createInstance(WalkThroughInput, localize('welcome.title', "Welcome"), '', uri, telemetryFrom, container => this.onReady(container, recentlyOpened, installedKeymaps));
		this.editorService.openEditor(input, { pinned: true }, Position.ONE)
			.then(null, onUnexpectedError);
	}

	private onReady(container: HTMLElement, recentlyOpened: TPromise<{ files: string[]; folders: string[]; }>, installedKeymaps: TPromise<IKeymapExtension[]>): void {
		const enabled = this.configurationService.lookup<boolean>(enabledKey).value;
		const showOnStartup = <HTMLInputElement>container.querySelector('#showOnStartup');
		if (enabled) {
			showOnStartup.setAttribute('checked', 'checked');
		}
		showOnStartup.addEventListener('click', e => {
			this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: enabledKey, value: showOnStartup.checked })
				.then(null, error => this.messageService.show(Severity.Error, error));
		});

		recentlyOpened.then(({ folders }) => {
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
					this.windowsService.openWindow([folder], { forceNewWindow: e.ctrlKey || e.metaKey });
					e.preventDefault();
					e.stopPropagation();
				});
				li.appendChild(a);

				const span = document.createElement('span');
				span.classList.add('path');
				span.innerText = tildify(parentFolder, this.environmentService.userHome);
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
						this.installKeymap(keymapName, keymapIdentifier);
						event.preventDefault();
						event.stopPropagation();
					}
				}
			}
		});

		this.updateInstalledKeymaps(container, installedKeymaps);
		this.disposables.push(this.instantiationService.invokeFunction(onKeymapExtensionChanged)(ids => {
			for (const id of ids) {
				if (container.querySelector(`.installKeymap[data-keymap="${id}"], .currentKeymap[data-keymap="${id}"]`)) {
					const installedKeymaps = this.instantiationService.invokeFunction(getInstalledKeymaps);
					this.updateInstalledKeymaps(container, installedKeymaps);
					break;
				}
			};
		}));
	}

	private installKeymap(keymapName: string, keymapIdentifier: string): void {
		this.telemetryService.publicLog('installKeymap', {
			from: telemetryFrom,
			extensionId: keymapIdentifier,
		});
		this.instantiationService.invokeFunction(getInstalledKeymaps).then(extensions => {
			const keymap = arrays.first(extensions, extension => extension.identifier === keymapIdentifier);
			if (keymap && keymap.globallyEnabled) {
				this.telemetryService.publicLog('installedKeymap', {
					from: telemetryFrom,
					extensionId: keymapIdentifier,
					outcome: 'already_enabled',
				});
				this.messageService.show(Severity.Info, localize('welcomePage.keymapAlreadyInstalled', "The {0} keyboard shortcuts are already installed.", keymapName));
				return;
			}
			const foundAndInstalled = keymap ? TPromise.as(true) : this.extensionGalleryService.query({ names: [keymapIdentifier] })
				.then(result => {
					const [extension] = result.firstPage;
					if (!extension) {
						return false;
					}
					return this.extensionManagementService.installFromGallery(extension)
						.then(() => {
							// TODO: Do this as part of the install to avoid multiple events.
							return this.extensionEnablementService.setEnablement(keymapIdentifier, false);
						}).then(() => {
							return true;
						});
				});
			this.messageService.show(Severity.Info, {
				message: localize('welcomePage.willReloadAfterInstallingKeymap', "The window will reload after installing the {0} keyboard shortcuts.", keymapName),
				actions: [
					new Action('ok', localize('ok', "OK"), null, true, () => {
						const messageDelay = TPromise.timeout(300);
						messageDelay.then(() => {
							this.messageService.show(Severity.Info, {
								message: localize('welcomePage.installingKeymap', "Installing the {0} keyboard shortcuts...", keymapName),
								actions: [CloseAction]
							});
						});
						TPromise.join(extensions.filter(extension => extension.globallyEnabled)
							.map(extension => {
								return this.extensionEnablementService.setEnablement(extension.identifier, false);
							})).then(() => {
								return foundAndInstalled.then(found => {
									messageDelay.cancel();
									if (found) {
										return this.extensionEnablementService.setEnablement(keymapIdentifier, true)
											.then(() => {
												this.telemetryService.publicLog('installedKeymap', {
													from: telemetryFrom,
													extensionId: keymapIdentifier,
													outcome: keymap ? 'enabled' : 'installed',
												});
												return this.windowService.reloadWindow();
											});
									} else {
										this.telemetryService.publicLog('installedKeymap', {
											from: telemetryFrom,
											extensionId: keymapIdentifier,
											outcome: 'not_found',
										});
										this.messageService.show(Severity.Error, localize('welcomePage.keymapNotFound', "The {0} keyboard shortcuts with id {1} could not be found.", keymapName, keymapIdentifier));
										return undefined;
									}
								});
							}).then(null, err => {
								this.telemetryService.publicLog('installedKeymap', {
									from: telemetryFrom,
									extensionId: keymapIdentifier,
									outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
									error: String(err),
								});
								this.messageService.show(Severity.Error, err);
							});
						return TPromise.as(true);
					}),
					new Action('cancel', localize('cancel', "Cancel"), null, true, () => {
						this.telemetryService.publicLog('installedKeymap', {
							from: telemetryFrom,
							extensionId: keymapIdentifier,
							outcome: 'user_canceled',
						});
						return TPromise.as(true);
					})
				]
			});
		}).then<void>(null, err => {
			this.telemetryService.publicLog('installedKeymap', {
				from: telemetryFrom,
				extensionId: keymapIdentifier,
				outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
				error: String(err),
			});
			this.messageService.show(Severity.Error, err);
		});
	}

	private updateInstalledKeymaps(container: HTMLElement, installedKeymaps: TPromise<IKeymapExtension[]>) {
		installedKeymaps.then(extensions => {
			const elements = container.querySelectorAll('.installKeymap, .currentKeymap');
			for (let i = 0; i < elements.length; i++) {
				elements[i].classList.remove('installed');
			}
			extensions.filter(ext => ext.globallyEnabled)
				.map(ext => ext.identifier)
				.forEach(id => {
					const install = container.querySelector(`.installKeymap[data-keymap="${id}"]`);
					if (install) {
						install.classList.add('installed');
					}
					const current = container.querySelector(`.currentKeymap[data-keymap="${id}"]`);
					if (current) {
						current.classList.add('installed');
					}
				});
		}).then(null, onUnexpectedError);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
