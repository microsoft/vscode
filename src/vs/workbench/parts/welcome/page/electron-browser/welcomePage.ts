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
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError, isPromiseCanceledError } from 'vs/base/common/errors';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Schemas } from 'vs/base/common/network';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { getInstalledExtensions, IExtensionStatus, onExtensionChanged, isKeymapExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsUtils';
import { IExtensionEnablementService, IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, EnablementState } from 'vs/platform/extensionManagement/common/extensionManagement';
import { used } from 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page';
import { ILifecycleService, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { tildify, getBaseLabel } from 'vs/base/common/labels';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor, focusBorder, textLinkForeground, textLinkActiveForeground, foreground, descriptionForeground, contrastBorder, activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { getExtraColor } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughUtils';
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceIdentifier, getWorkspaceLabel, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IEditorInputFactory, EditorInput } from 'vs/workbench/common/editor';
import { getIdAndVersionFromLocalExtensionId } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

used();

const configurationKey = 'workbench.startupEditor';
const oldConfigurationKey = 'workbench.welcome.enabled';
const telemetryFrom = 'welcomePage';

export class WelcomePageContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IBackupFileService backupFileService: IBackupFileService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService
	) {
		const enabled = isWelcomePageEnabled(configurationService);
		if (enabled && lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			backupFileService.hasBackups().then(hasBackups => {
				const activeInput = editorService.getActiveEditorInput();
				if (!activeInput && !hasBackups) {
					return instantiationService.createInstance(WelcomePage)
						.openEditor();
				}
				return undefined;
			}).then(null, onUnexpectedError);
		}
	}
}

function isWelcomePageEnabled(configurationService: IConfigurationService) {
	const startupEditor = configurationService.inspect(configurationKey);
	if (!startupEditor.user && !startupEditor.workspace) {
		const welcomeEnabled = configurationService.inspect(oldConfigurationKey);
		if (welcomeEnabled.value !== undefined && welcomeEnabled.value !== null) {
			return welcomeEnabled.value;
		}
	}
	return startupEditor.value === 'welcomePage';
}

export class WelcomePageAction extends Action {

	public static readonly ID = 'workbench.action.showWelcomePage';
	public static readonly LABEL = localize('welcomePage', "Welcome");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		return this.instantiationService.createInstance(WelcomePage)
			.openEditor()
			.then(() => undefined);
	}
}

interface ExtensionSuggestion {
	name: string;
	title?: string;
	id: string;
	isKeymap?: boolean;
	isCommand?: boolean;
}

const extensionPacks: ExtensionSuggestion[] = [
	{ name: localize('welcomePage.javaScript', "JavaScript"), id: 'dbaeumer.vscode-eslint' },
	{ name: localize('welcomePage.typeScript', "TypeScript"), id: 'eg2.tslint' },
	{ name: localize('welcomePage.python', "Python"), id: 'ms-python.python' },
	// { name: localize('welcomePage.go', "Go"), id: 'lukehoban.go' },
	{ name: localize('welcomePage.php', "PHP"), id: 'felixfbecker.php-pack' },
	{ name: localize('welcomePage.azure', "Azure"), title: localize('welcomePage.showAzureExtensions', "Show Azure extensions"), id: 'workbench.extensions.action.showAzureExtensions', isCommand: true },
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

/* __GDPR__
	"installExtension" : {
		"${include}": [
			"${WelcomePageInstall-1}"
		]
	}
*/
/* __GDPR__
	"installedExtension" : {
		"${include}": [
			"${WelcomePageInstalled-1}",
			"${WelcomePageInstalled-2}",
			"${WelcomePageInstalled-3}",
			"${WelcomePageInstalled-4}",
			"${WelcomePageInstalled-6}"
		]
	}
*/
/* __GDPR__
	"detailsExtension" : {
		"${include}": [
			"${WelcomePageDetails-1}"
		]
	}
*/
const extensionPackStrings: Strings = {
	installEvent: 'installExtension',
	installedEvent: 'installedExtension',
	detailsEvent: 'detailsExtension',

	alreadyInstalled: localize('welcomePage.extensionPackAlreadyInstalled', "Support for {0} is already installed."),
	reloadAfterInstall: localize('welcomePage.willReloadAfterInstallingExtensionPack', "The window will reload after installing additional support for {0}."),
	installing: localize('welcomePage.installingExtensionPack', "Installing additional support for {0}..."),
	extensionNotFound: localize('welcomePage.extensionPackNotFound', "Support for {0} with id {1} could not be found."),
};

/* __GDPR__
	"installKeymap" : {
		"${include}": [
			"${WelcomePageInstall-1}"
		]
	}
*/
/* __GDPR__
	"installedKeymap" : {
		"${include}": [
			"${WelcomePageInstalled-1}",
			"${WelcomePageInstalled-2}",
			"${WelcomePageInstalled-3}",
			"${WelcomePageInstalled-4}",
			"${WelcomePageInstalled-6}"
		]
	}
*/
/* __GDPR__
	"detailsKeymap" : {
		"${include}": [
			"${WelcomePageDetails-1}"
		]
	}
*/
const keymapStrings: Strings = {
	installEvent: 'installKeymap',
	installedEvent: 'installedKeymap',
	detailsEvent: 'detailsKeymap',

	alreadyInstalled: localize('welcomePage.keymapAlreadyInstalled', "The {0} keyboard shortcuts are already installed."),
	reloadAfterInstall: localize('welcomePage.willReloadAfterInstallingKeymap', "The window will reload after installing the {0} keyboard shortcuts."),
	installing: localize('welcomePage.installingKeymap', "Installing the {0} keyboard shortcuts..."),
	extensionNotFound: localize('welcomePage.keymapNotFound', "The {0} keyboard shortcuts with id {1} could not be found."),
};

const welcomeInputTypeId = 'workbench.editors.welcomePageInput';

class WelcomePage {

	private disposables: IDisposable[] = [];

	readonly editorInput: WalkThroughInput;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@INotificationService private notificationService: INotificationService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));

		const recentlyOpened = this.windowService.getRecentlyOpened();
		const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
		const resource = URI.parse(require.toUrl('./vs_code_welcome_page'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page' })
			});
		this.editorInput = this.instantiationService.createInstance(WalkThroughInput, {
			typeId: welcomeInputTypeId,
			name: localize('welcome.title', "Welcome"),
			resource,
			telemetryFrom,
			onReady: (container: HTMLElement) => this.onReady(container, recentlyOpened, installedExtensions)
		});
	}

	public openEditor() {
		return this.editorService.openEditor(this.editorInput, { pinned: false }, Position.ONE);
	}

	private onReady(container: HTMLElement, recentlyOpened: TPromise<{ files: string[]; workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[]; }>, installedExtensions: TPromise<IExtensionStatus[]>): void {
		const enabled = isWelcomePageEnabled(this.configurationService);
		const showOnStartup = <HTMLInputElement>container.querySelector('#showOnStartup');
		if (enabled) {
			showOnStartup.setAttribute('checked', 'checked');
		}
		showOnStartup.addEventListener('click', e => {
			this.configurationService.updateValue(configurationKey, showOnStartup.checked ? 'welcomePage' : 'newUntitledFile', ConfigurationTarget.USER);
		});

		recentlyOpened.then(({ workspaces }) => {
			// Filter out the current workspace
			workspaces = workspaces.filter(workspace => !this.contextService.isCurrentWorkspace(workspace));
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
					label = getBaseLabel(workspace);
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
					/* __GDPR__
						"workbenchActionExecuted" : {
							"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
							"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
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
				if (container.querySelector(`.installExtension[data-extension="${stripVersion(id.id)}"], .enabledExtension[data-extension="${stripVersion(id.id)}"]`)) {
					const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
					this.updateInstalledExtensions(container, installedExtensions);
					break;
				}
			}
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
				a.title = extension.title || (extension.isKeymap ? localize('welcomePage.installKeymap', "Install {0} keymap", extension.name) : localize('welcomePage.installExtensionPack', "Install additional support for {0}", extension.name));
				if (extension.isCommand) {
					a.href = `command:${extension.id}`;
					list.appendChild(a);
				} else {
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
				}
			});
		}
	}

	private installExtension(extensionSuggestion: ExtensionSuggestion, strings: Strings): void {
		/* __GDPR__FRAGMENT__
			"WelcomePageInstall-1" : {
				"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog(strings.installEvent, {
			from: telemetryFrom,
			extensionId: extensionSuggestion.id,
		});
		this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const installedExtension = arrays.first(extensions, extension => stripVersion(extension.identifier.id) === extensionSuggestion.id);
			if (installedExtension && installedExtension.globallyEnabled) {
				/* __GDPR__FRAGMENT__
					"WelcomePageInstalled-1" : {
						"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog(strings.installedEvent, {
					from: telemetryFrom,
					extensionId: extensionSuggestion.id,
					outcome: 'already_enabled',
				});
				this.notificationService.info(strings.alreadyInstalled.replace('{0}', extensionSuggestion.name));
				return;
			}
			const foundAndInstalled = installedExtension ? TPromise.as(installedExtension.local) : this.extensionGalleryService.query({ names: [extensionSuggestion.id], source: telemetryFrom })
				.then(result => {
					const [extension] = result.firstPage;
					if (!extension) {
						return null;
					}
					return this.extensionManagementService.installFromGallery(extension)
						.then(local => {
							// TODO: Do this as part of the install to avoid multiple events.
							return this.extensionEnablementService.setEnablement(local, EnablementState.Disabled).then(() => local);
						});
				});

			this.notificationService.prompt(
				Severity.Info,
				strings.reloadAfterInstall.replace('{0}', extensionSuggestion.name),
				[{
					label: localize('ok', "OK"),
					run: () => {
						const messageDelay = TPromise.timeout(300);
						messageDelay.then(() => {
							this.notificationService.info(strings.installing.replace('{0}', extensionSuggestion.name));
						});
						TPromise.join(extensionSuggestion.isKeymap ? extensions.filter(extension => isKeymapExtension(this.tipsService, extension) && extension.globallyEnabled)
							.map(extension => {
								return this.extensionEnablementService.setEnablement(extension.local, EnablementState.Disabled);
							}) : []).then(() => {
								return foundAndInstalled.then(foundExtension => {
									messageDelay.cancel();
									if (foundExtension) {
										return this.extensionEnablementService.setEnablement(foundExtension, EnablementState.Enabled)
											.then(() => {
												/* __GDPR__FRAGMENT__
													"WelcomePageInstalled-2" : {
														"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
														"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
														"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
													}
												*/
												this.telemetryService.publicLog(strings.installedEvent, {
													from: telemetryFrom,
													extensionId: extensionSuggestion.id,
													outcome: installedExtension ? 'enabled' : 'installed',
												});
												return this.windowService.reloadWindow();
											});
									} else {
										/* __GDPR__FRAGMENT__
											"WelcomePageInstalled-3" : {
												"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
												"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
												"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
											}
										*/
										this.telemetryService.publicLog(strings.installedEvent, {
											from: telemetryFrom,
											extensionId: extensionSuggestion.id,
											outcome: 'not_found',
										});
										this.notificationService.error(strings.extensionNotFound.replace('{0}', extensionSuggestion.name).replace('{1}', extensionSuggestion.id));
										return undefined;
									}
								});
							}).then(null, err => {
								/* __GDPR__FRAGMENT__
									"WelcomePageInstalled-4" : {
										"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" }
									}
								*/
								this.telemetryService.publicLog(strings.installedEvent, {
									from: telemetryFrom,
									extensionId: extensionSuggestion.id,
									outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
									error: String(err),
								});
								this.notificationService.error(err);
							});
					}
				}, {
					label: localize('details', "Details"),
					run: () => {
						/* __GDPR__FRAGMENT__
							"WelcomePageDetails-1" : {
								"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog(strings.detailsEvent, {
							from: telemetryFrom,
							extensionId: extensionSuggestion.id,
						});
						this.extensionsWorkbenchService.queryGallery({ names: [extensionSuggestion.id] })
							.then(result => this.extensionsWorkbenchService.open(result.firstPage[0]))
							.then(null, onUnexpectedError);
					}
				}]
			);
		}).then(null, err => {
			/* __GDPR__FRAGMENT__
				"WelcomePageInstalled-6" : {
					"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" }
				}
			*/
			this.telemetryService.publicLog(strings.installedEvent, {
				from: telemetryFrom,
				extensionId: extensionSuggestion.id,
				outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
				error: String(err),
			});
			this.notificationService.error(err);
		});
	}

	private updateInstalledExtensions(container: HTMLElement, installedExtensions: TPromise<IExtensionStatus[]>) {
		installedExtensions.then(extensions => {
			const elements = container.querySelectorAll('.installExtension, .enabledExtension');
			for (let i = 0; i < elements.length; i++) {
				elements[i].classList.remove('installed');
			}
			extensions.filter(ext => ext.globallyEnabled)
				.map(ext => stripVersion(ext.identifier.id))
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

function stripVersion(id: string): string {
	return getIdAndVersionFromLocalExtensionId(id).id;
}


export class WelcomeInputFactory implements IEditorInputFactory {

	static readonly ID = welcomeInputTypeId;

	public serialize(editorInput: EditorInput): string {
		return '{}';
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): WalkThroughInput {
		return instantiationService.createInstance(WelcomePage)
			.editorInput;
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
