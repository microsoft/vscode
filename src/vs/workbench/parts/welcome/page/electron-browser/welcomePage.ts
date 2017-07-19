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
import { getInstalledExtensions, IExtensionStatus, onExtensionChanged, isKeymapExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsUtils';
import { IExtensionEnablementService, IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { used } from 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { tildify } from 'vs/base/common/labels';
import { isLinux } from 'vs/base/common/platform';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor, focusBorder, textLinkForeground, textLinkActiveForeground, foreground, descriptionForeground, contrastBorder, activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { getExtraColor } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughUtils';
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceIdentifier, getWorkspaceLabel, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from "vs/platform/workspaces/common/workspaces";

used();

const configurationKey = 'workbench.startupEditor';
const oldConfigurationKey = 'workbench.welcome.enabled';
const telemetryFrom = 'welcomePage';

export class WelcomePageContribution implements IWorkbenchContribution {

	constructor(
		@IPartService partService: IPartService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IBackupFileService backupFileService: IBackupFileService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService
	) {
		const enabled = isWelcomePageEnabled(configurationService);
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

function isWelcomePageEnabled(configurationService: IConfigurationService) {
	const startupEditor = configurationService.lookup(configurationKey);
	if (!startupEditor.user && !startupEditor.workspace) {
		const welcomeEnabled = configurationService.lookup(oldConfigurationKey);
		if (welcomeEnabled.value !== undefined && welcomeEnabled.value !== null) {
			return welcomeEnabled.value;
		}
	}
	return startupEditor.value === 'welcomePage';
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

interface ExtensionSuggestion {
	name: string;
	id: string;
	isKeymap?: boolean;
}

const extensionPacks: ExtensionSuggestion[] = [
	{ name: localize('welcomePage.javaScript', "JavaScript"), id: 'dbaeumer.vscode-eslint' },
	{ name: localize('welcomePage.typeScript', "TypeScript"), id: 'eg2.tslint' },
	{ name: localize('welcomePage.python', "Python"), id: 'donjayamanne.python' },
	// { name: localize('welcomePage.go', "Go"), id: 'lukehoban.go' },
	{ name: localize('welcomePage.php', "PHP"), id: 'felixfbecker.php-pack' },
	{ name: localize('welcomePage.docker', "Docker"), id: 'PeterJausovec.vscode-docker' },
];

const keymapExtensions: ExtensionSuggestion[] = [
	{ name: localize('welcomePage.vim', "Vim"), id: 'vscodevim.vim', isKeymap: true },
	{ name: localize('welcomePage.sublime', "Sublime"), id: 'ms-vscode.sublime-keybindings', isKeymap: true },
	{ name: localize('welcomePage.atom', "Atom"), id: 'ms-vscode.atom-keybindings', isKeymap: true },
];

interface Strings {
	installEvent: string;
	installedEvent: string;
	detailsEvent: string;

	alreadyInstalled: string;
	reloadAfterInstall: string;
	installing: string;
	extensionNotFound: string;
}

const extensionPackStrings: Strings = {
	installEvent: 'installExtension',
	installedEvent: 'installedExtension',
	detailsEvent: 'detailsExtension',

	alreadyInstalled: localize('welcomePage.extensionPackAlreadyInstalled', "Support for {0} is already installed."),
	reloadAfterInstall: localize('welcomePage.willReloadAfterInstallingExtensionPack', "The window will reload after installing additional support for {0}."),
	installing: localize('welcomePage.installingExtensionPack', "Installing additional support for {0}..."),
	extensionNotFound: localize('welcomePage.extensionPackNotFound', "Support for {0} with id {1} could not be found."),
};

const keymapStrings: Strings = {
	installEvent: 'installKeymap',
	installedEvent: 'installedKeymap',
	detailsEvent: 'detailsKeymap',

	alreadyInstalled: localize('welcomePage.keymapAlreadyInstalled', "The {0} keyboard shortcuts are already installed."),
	reloadAfterInstall: localize('welcomePage.willReloadAfterInstallingKeymap', "The window will reload after installing the {0} keyboard shortcuts."),
	installing: localize('welcomePage.installingKeymap', "Installing the {0} keyboard shortcuts..."),
	extensionNotFound: localize('welcomePage.keymapNotFound', "The {0} keyboard shortcuts with id {1} could not be found."),
};

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
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IThemeService private themeService: IThemeService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));
		this.create();
	}

	private create() {
		const recentlyOpened = this.windowService.getRecentlyOpened();
		const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
		const uri = URI.parse(require.toUrl('./vs_code_welcome_page'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page' })
			});
		const input = this.instantiationService.createInstance(WalkThroughInput, localize('welcome.title', "Welcome"), '', uri, telemetryFrom, container => this.onReady(container, recentlyOpened, installedExtensions));
		this.editorService.openEditor(input, { pinned: true }, Position.ONE)
			.then(null, onUnexpectedError);
	}

	private onReady(container: HTMLElement, recentlyOpened: TPromise<{ files: string[]; workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[]; }>, installedExtensions: TPromise<IExtensionStatus[]>): void {
		const enabled = isWelcomePageEnabled(this.configurationService);
		const showOnStartup = <HTMLInputElement>container.querySelector('#showOnStartup');
		if (enabled) {
			showOnStartup.setAttribute('checked', 'checked');
		}
		showOnStartup.addEventListener('click', e => {
			this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: configurationKey, value: showOnStartup.checked ? 'welcomePage' : 'newUntitledFile' });
		});

		recentlyOpened.then(({ workspaces }) => {
			const context = this.contextService.getWorkspace();
			workspaces = workspaces.filter(workspace => {
				if (this.contextService.hasMultiFolderWorkspace() && typeof workspace !== 'string' && context.id === workspace.id) {
					return false; // do not show current workspace
				}

				if (this.contextService.hasFolderWorkspace() && isSingleFolderWorkspaceIdentifier(workspace) && this.pathEquals(context.roots[0].fsPath, workspace)) {
					return false; // do not show current workspace (single folder case)
				}

				return true;
			});
			if (!workspaces.length) {
				const recent = container.querySelector('.welcomePage') as HTMLElement;
				recent.classList.add('emptyRecent');
				return;
			}
			const ul = container.querySelector('.recent ul');
			const before = ul.firstElementChild;
			workspaces.slice(0, 5).forEach(workspace => {
				let label: string;
				let parent: string;
				let wsPath: string;
				if (isSingleFolderWorkspaceIdentifier(workspace)) {
					label = path.basename(workspace);
					parent = path.dirname(workspace);
					wsPath = workspace;
				} else {
					label = getWorkspaceLabel(workspace, this.environmentService);
					parent = path.dirname(workspace.configPath);
					wsPath = workspace.configPath;
				}

				const li = document.createElement('li');

				const a = document.createElement('a');
				let name = label;
				let parentFolder = parent;
				if (!name && parentFolder) {
					const tmp = name;
					name = parentFolder;
					parentFolder = tmp;
				}
				const tildifiedParentFolder = tildify(parentFolder, this.environmentService.userHome);

				a.innerText = name;
				a.title = label;
				a.setAttribute('aria-label', localize('welcomePage.openFolderWithPath', "Open folder {0} with path {1}", name, tildifiedParentFolder));
				a.href = 'javascript:void(0)';
				a.addEventListener('click', e => {
					this.telemetryService.publicLog('workbenchActionExecuted', {
						id: 'openRecentFolder',
						from: telemetryFrom
					});
					this.windowsService.openWindow([wsPath], { forceNewWindow: e.ctrlKey || e.metaKey });
					e.preventDefault();
					e.stopPropagation();
				});
				li.appendChild(a);

				const span = document.createElement('span');
				span.classList.add('path');
				span.classList.add('detail');
				span.innerText = tildifiedParentFolder;
				span.title = label;
				li.appendChild(span);

				ul.insertBefore(li, before);
			});
		}).then(null, onUnexpectedError);

		this.addExtensionList(container, '.extensionPackList', extensionPacks, extensionPackStrings);
		this.addExtensionList(container, '.keymapList', keymapExtensions, keymapStrings);

		this.updateInstalledExtensions(container, installedExtensions);
		this.disposables.push(this.instantiationService.invokeFunction(onExtensionChanged)(ids => {
			for (const id of ids) {
				if (container.querySelector(`.installExtension[data-extension="${id}"], .enabledExtension[data-extension="${id}"]`)) {
					const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
					this.updateInstalledExtensions(container, installedExtensions);
					break;
				}
			};
		}));
	}

	private addExtensionList(container: HTMLElement, listSelector: string, suggestions: ExtensionSuggestion[], strings: Strings) {
		const list = container.querySelector(listSelector);
		if (list) {
			suggestions.forEach((extension, i) => {
				if (i) {
					list.appendChild(document.createTextNode(localize('welcomePage.extensionListSeparator', ", ")));
				}

				const a = document.createElement('a');
				a.innerText = extension.name;
				a.title = extension.isKeymap ? localize('welcomePage.installKeymap', "Install {0} keymap", extension.name) : localize('welcomePage.installExtensionPack', "Install additional support for {0}", extension.name);
				a.classList.add('installExtension');
				a.setAttribute('data-extension', extension.id);
				a.href = 'javascript:void(0)';
				a.addEventListener('click', e => {
					this.installExtension(extension, strings);
					e.preventDefault();
					e.stopPropagation();
				});
				list.appendChild(a);

				const span = document.createElement('span');
				span.innerText = extension.name;
				span.title = extension.isKeymap ? localize('welcomePage.installedKeymap', "{0} keymap is already installed", extension.name) : localize('welcomePage.installedExtensionPack', "{0} support is already installed", extension.name);
				span.classList.add('enabledExtension');
				span.setAttribute('data-extension', extension.id);
				list.appendChild(span);
			});
		}
	}

	private pathEquals(path1: string, path2: string): boolean {
		if (!isLinux) {
			path1 = path1.toLowerCase();
			path2 = path2.toLowerCase();
		}

		return path1 === path2;
	}

	private installExtension(extensionSuggestion: ExtensionSuggestion, strings: Strings): void {
		this.telemetryService.publicLog(strings.installEvent, {
			from: telemetryFrom,
			extensionId: extensionSuggestion.id,
		});
		this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const installedExtension = arrays.first(extensions, extension => extension.identifier === extensionSuggestion.id);
			if (installedExtension && installedExtension.globallyEnabled) {
				this.telemetryService.publicLog(strings.installedEvent, {
					from: telemetryFrom,
					extensionId: extensionSuggestion.id,
					outcome: 'already_enabled',
				});
				this.messageService.show(Severity.Info, strings.alreadyInstalled.replace('{0}', extensionSuggestion.name));
				return;
			}
			const foundAndInstalled = installedExtension ? TPromise.as(true) : this.extensionGalleryService.query({ names: [extensionSuggestion.id] })
				.then(result => {
					const [extension] = result.firstPage;
					if (!extension) {
						return false;
					}
					return this.extensionManagementService.installFromGallery(extension, false)
						.then(() => {
							// TODO: Do this as part of the install to avoid multiple events.
							return this.extensionEnablementService.setEnablement(extensionSuggestion.id, false);
						}).then(() => {
							return true;
						});
				});
			this.messageService.show(Severity.Info, {
				message: strings.reloadAfterInstall.replace('{0}', extensionSuggestion.name),
				actions: [
					new Action('ok', localize('ok', "OK"), null, true, () => {
						const messageDelay = TPromise.timeout(300);
						messageDelay.then(() => {
							this.messageService.show(Severity.Info, {
								message: strings.installing.replace('{0}', extensionSuggestion.name),
								actions: [CloseAction]
							});
						});
						TPromise.join(extensionSuggestion.isKeymap ? extensions.filter(extension => isKeymapExtension(this.tipsService, extension) && extension.globallyEnabled)
							.map(extension => {
								return this.extensionEnablementService.setEnablement(extension.identifier, false);
							}) : []).then(() => {
								return foundAndInstalled.then(found => {
									messageDelay.cancel();
									if (found) {
										return this.extensionEnablementService.setEnablement(extensionSuggestion.id, true)
											.then(() => {
												this.telemetryService.publicLog(strings.installedEvent, {
													from: telemetryFrom,
													extensionId: extensionSuggestion.id,
													outcome: installedExtension ? 'enabled' : 'installed',
												});
												return this.windowService.reloadWindow();
											});
									} else {
										this.telemetryService.publicLog(strings.installedEvent, {
											from: telemetryFrom,
											extensionId: extensionSuggestion.id,
											outcome: 'not_found',
										});
										this.messageService.show(Severity.Error, strings.extensionNotFound.replace('{0}', extensionSuggestion.name).replace('{1}', extensionSuggestion.id));
										return undefined;
									}
								});
							}).then(null, err => {
								this.telemetryService.publicLog(strings.installedEvent, {
									from: telemetryFrom,
									extensionId: extensionSuggestion.id,
									outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
									error: String(err),
								});
								this.messageService.show(Severity.Error, err);
							});
						return TPromise.as(true);
					}),
					new Action('details', localize('details', "Details"), null, true, () => {
						this.telemetryService.publicLog(strings.detailsEvent, {
							from: telemetryFrom,
							extensionId: extensionSuggestion.id,
						});
						this.extensionsWorkbenchService.queryGallery({ names: [extensionSuggestion.id] })
							.then(result => this.extensionsWorkbenchService.open(result.firstPage[0]))
							.then(null, onUnexpectedError);
						return TPromise.as(false);
					}),
					new Action('cancel', localize('cancel', "Cancel"), null, true, () => {
						this.telemetryService.publicLog(strings.installedEvent, {
							from: telemetryFrom,
							extensionId: extensionSuggestion.id,
							outcome: 'user_canceled',
						});
						return TPromise.as(true);
					})
				]
			});
		}).then<void>(null, err => {
			this.telemetryService.publicLog(strings.installedEvent, {
				from: telemetryFrom,
				extensionId: extensionSuggestion.id,
				outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
				error: String(err),
			});
			this.messageService.show(Severity.Error, err);
		});
	}

	private updateInstalledExtensions(container: HTMLElement, installedExtensions: TPromise<IExtensionStatus[]>) {
		installedExtensions.then(extensions => {
			const elements = container.querySelectorAll('.installExtension, .enabledExtension');
			for (let i = 0; i < elements.length; i++) {
				elements[i].classList.remove('installed');
			}
			extensions.filter(ext => ext.globallyEnabled)
				.map(ext => ext.identifier)
				.forEach(id => {
					const install = container.querySelectorAll(`.installExtension[data-extension="${id}"]`);
					for (let i = 0; i < install.length; i++) {
						install[i].classList.add('installed');
					}
					const enabled = container.querySelectorAll(`.enabledExtension[data-extension="${id}"]`);
					for (let i = 0; i < enabled.length; i++) {
						enabled[i].classList.add('installed');
					}
				});
		}).then(null, onUnexpectedError);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

// theming

const buttonBackground = registerColor('welcomePage.buttonBackground', { dark: null, light: null, hc: null }, localize('welcomePage.buttonBackground', 'Background color for the buttons on the Welcome page.'));
const buttonHoverBackground = registerColor('welcomePage.buttonHoverBackground', { dark: null, light: null, hc: null }, localize('welcomePage.buttonHoverBackground', 'Hover background color for the buttons on the Welcome page.'));

registerThemingParticipant((theme, collector) => {
	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .caption { color: ${foregroundColor}; }`);
	}
	const descriptionColor = theme.getColor(descriptionForeground);
	if (descriptionColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .detail { color: ${descriptionColor}; }`);
	}
	const buttonColor = getExtraColor(theme, buttonBackground, { dark: 'rgba(0, 0, 0, .2)', extra_dark: 'rgba(200, 235, 255, .042)', light: 'rgba(0,0,0,.04)', hc: 'black' });
	if (buttonColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button { background: ${buttonColor}; }`);
	}
	const buttonHoverColor = getExtraColor(theme, buttonHoverBackground, { dark: 'rgba(200, 235, 255, .072)', extra_dark: 'rgba(200, 235, 255, .072)', light: 'rgba(0,0,0,.10)', hc: null });
	if (buttonHoverColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button:hover { background: ${buttonHoverColor}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage a { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage a:hover,
			.monaco-workbench > .part.editor > .content .welcomePage a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage a:focus { outline-color: ${focusColor}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button { border-color: ${border}; }`);
	}
	const activeBorder = theme.getColor(activeContrastBorder);
	if (activeBorder) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button:hover { outline-color: ${activeBorder}; }`);
	}
});
