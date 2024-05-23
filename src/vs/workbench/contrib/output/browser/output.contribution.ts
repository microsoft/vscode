/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { ModesRegistry } from 'vs/editor/common/languages/modesRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { MenuId, registerAction2, Action2, MenuRegistry } from 'vs/platform/actions/common/actions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { OutputService } from 'vs/workbench/contrib/output/browser/outputServices';
import { OUTPUT_MODE_ID, OUTPUT_MIME, OUTPUT_VIEW_ID, IOutputService, CONTEXT_IN_OUTPUT, LOG_MODE_ID, LOG_MIME, CONTEXT_ACTIVE_FILE_OUTPUT, CONTEXT_OUTPUT_SCROLL_LOCK, IOutputChannelDescriptor, IFileOutputChannelDescriptor, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, IOutputChannelRegistry, Extensions, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT } from 'vs/workbench/services/output/common/output';
import { OutputViewPane } from 'vs/workbench/contrib/output/browser/outputView';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from 'vs/workbench/common/views';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IQuickPickItem, IQuickInputService, IQuickPickSeparator, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { AUX_WINDOW_GROUP, AUX_WINDOW_GROUP_TYPE, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { assertIsDefined } from 'vs/base/common/types';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { ILoggerService, LogLevel, LogLevelToLocalizedString, LogLevelToString } from 'vs/platform/log/common/log';
import { IDefaultLogLevelsService } from 'vs/workbench/contrib/logs/common/defaultLogLevels';

// Register Service
registerSingleton(IOutputService, OutputService, InstantiationType.Delayed);

// Register Output Mode
ModesRegistry.registerLanguage({
	id: OUTPUT_MODE_ID,
	extensions: [],
	mimetypes: [OUTPUT_MIME]
});

// Register Log Output Mode
ModesRegistry.registerLanguage({
	id: LOG_MODE_ID,
	extensions: [],
	mimetypes: [LOG_MIME]
});

// register output container
const outputViewIcon = registerIcon('output-view-icon', Codicon.output, nls.localize('outputViewIcon', 'View icon of the output view.'));
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: OUTPUT_VIEW_ID,
	title: nls.localize2('output', "Output"),
	icon: outputViewIcon,
	order: 1,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [OUTPUT_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: OUTPUT_VIEW_ID,
	hideIfEmpty: true,
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: OUTPUT_VIEW_ID,
	name: nls.localize2('output', "Output"),
	containerIcon: outputViewIcon,
	canMoveView: true,
	canToggleVisibility: false,
	ctorDescriptor: new SyncDescriptor(OutputViewPane),
	openCommandActionDescriptor: {
		id: 'workbench.action.output.toggleOutput',
		mnemonicTitle: nls.localize({ key: 'miToggleOutput', comment: ['&& denotes a mnemonic'] }, "&&Output"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyU,
			linux: {
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyH)  // On Ubuntu Ctrl+Shift+U is taken by some global OS command
			}
		},
		order: 1,
	}
}], VIEW_CONTAINER);

class OutputContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IOutputService private readonly outputService: IOutputService,
		@IEditorService private readonly editorService: IEditorService,
		@IFilesConfigurationService private readonly fileConfigurationService: IFilesConfigurationService,
	) {
		super();
		this.registerActions();
	}

	private registerActions(): void {
		this.registerSwitchOutputAction();
		this.registerShowOutputChannelsAction();
		this.registerClearOutputAction();
		this.registerToggleAutoScrollAction();
		this.registerOpenActiveOutputFileAction();
		this.registerOpenActiveOutputFileInAuxWindowAction();
		this.registerShowLogsAction();
		this.registerOpenLogFileAction();
		this.registerConfigureActiveOutputLogLevelAction();
	}

	private registerSwitchOutputAction(): void {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.output.action.switchBetweenOutputs`,
					title: nls.localize('switchBetweenOutputs.label', "Switch Output"),
				});
			}
			async run(accessor: ServicesAccessor, channelId: string): Promise<void> {
				if (channelId) {
					accessor.get(IOutputService).showChannel(channelId, true);
				}
			}
		}));
		const switchOutputMenu = new MenuId('workbench.output.menu.switchOutput');
		this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
			submenu: switchOutputMenu,
			title: nls.localize('switchToOutput.label', "Switch Output"),
			group: 'navigation',
			when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
			order: 1,
			isSelection: true
		}));
		const registeredChannels = new Map<string, IDisposable>();
		this._register(toDisposable(() => dispose(registeredChannels.values())));
		const registerOutputChannels = (channels: IOutputChannelDescriptor[]) => {
			for (const channel of channels) {
				const title = channel.label;
				const group = channel.extensionId ? '0_ext_outputchannels' : '1_core_outputchannels';
				registeredChannels.set(channel.id, registerAction2(class extends Action2 {
					constructor() {
						super({
							id: `workbench.action.output.show.${channel.id}`,
							title,
							toggled: ACTIVE_OUTPUT_CHANNEL_CONTEXT.isEqualTo(channel.id),
							menu: {
								id: switchOutputMenu,
								group,
							}
						});
					}
					async run(accessor: ServicesAccessor): Promise<void> {
						return accessor.get(IOutputService).showChannel(channel.id, true);
					}
				}));
			}
		};
		registerOutputChannels(this.outputService.getChannelDescriptors());
		const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		this._register(outputChannelRegistry.onDidRegisterChannel(e => {
			const channel = this.outputService.getChannelDescriptor(e);
			if (channel) {
				registerOutputChannels([channel]);
			}
		}));
		this._register(outputChannelRegistry.onDidRemoveChannel(e => {
			registeredChannels.get(e)?.dispose();
			registeredChannels.delete(e);
		}));
	}

	private registerShowOutputChannelsAction(): void {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.showOutputChannels',
					title: nls.localize2('showOutputChannels', "Show Output Channels..."),
					category: nls.localize2('output', "Output"),
					f1: true
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const outputService = accessor.get(IOutputService);
				const quickInputService = accessor.get(IQuickInputService);
				const extensionChannels = [], coreChannels = [];
				for (const channel of outputService.getChannelDescriptors()) {
					if (channel.extensionId) {
						extensionChannels.push(channel);
					} else {
						coreChannels.push(channel);
					}
				}
				const entries: ({ id: string; label: string } | IQuickPickSeparator)[] = [];
				for (const { id, label } of extensionChannels) {
					entries.push({ id, label });
				}
				if (extensionChannels.length && coreChannels.length) {
					entries.push({ type: 'separator' });
				}
				for (const { id, label } of coreChannels) {
					entries.push({ id, label });
				}
				const entry = await quickInputService.pick(entries, { placeHolder: nls.localize('selectOutput', "Select Output Channel") });
				if (entry) {
					return outputService.showChannel(entry.id);
				}
			}
		}));
	}

	private registerClearOutputAction(): void {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.output.action.clearOutput`,
					title: nls.localize2('clearOutput.label', "Clear Output"),
					category: Categories.View,
					menu: [{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
						group: 'navigation',
						order: 2
					}, {
						id: MenuId.CommandPalette
					}, {
						id: MenuId.EditorContext,
						when: CONTEXT_IN_OUTPUT
					}],
					icon: Codicon.clearAll
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const outputService = accessor.get(IOutputService);
				const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
				const activeChannel = outputService.getActiveChannel();
				if (activeChannel) {
					activeChannel.clear();
					accessibilitySignalService.playSignal(AccessibilitySignal.clear);
				}
			}
		}));
	}

	private registerToggleAutoScrollAction(): void {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.output.action.toggleAutoScroll`,
					title: nls.localize2('toggleAutoScroll', "Toggle Auto Scrolling"),
					tooltip: nls.localize('outputScrollOff', "Turn Auto Scrolling Off"),
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OUTPUT_VIEW_ID)),
						group: 'navigation',
						order: 3,
					},
					icon: Codicon.lock,
					toggled: {
						condition: CONTEXT_OUTPUT_SCROLL_LOCK,
						icon: Codicon.unlock,
						tooltip: nls.localize('outputScrollOn', "Turn Auto Scrolling On")
					}
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const outputView = accessor.get(IViewsService).getActiveViewWithId<OutputViewPane>(OUTPUT_VIEW_ID)!;
				outputView.scrollLock = !outputView.scrollLock;
			}
		}));
	}

	private registerOpenActiveOutputFileAction(): void {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.action.openActiveLogOutputFile`,
					title: nls.localize2('openActiveOutputFile', "Open Output in Editor"),
					menu: [{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
						group: 'navigation',
						order: 4,
						isHiddenByDefault: true
					}],
					icon: Codicon.goToFile,
					precondition: CONTEXT_ACTIVE_FILE_OUTPUT
				});
			}
			async run(): Promise<void> {
				that.openActiveOutoutFile();
			}
		}));
	}

	private registerOpenActiveOutputFileInAuxWindowAction(): void {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.action.openActiveLogOutputFileInNewWindow`,
					title: nls.localize2('openActiveOutputFileInNewWindow', "Open Output in New Window"),
					menu: [{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
						group: 'navigation',
						order: 5,
						isHiddenByDefault: true
					}],
					icon: Codicon.emptyWindow,
					precondition: CONTEXT_ACTIVE_FILE_OUTPUT
				});
			}
			async run(): Promise<void> {
				that.openActiveOutoutFile(AUX_WINDOW_GROUP);
			}
		}));
	}

	private async openActiveOutoutFile(group?: AUX_WINDOW_GROUP_TYPE): Promise<void> {
		const fileOutputChannelDescriptor = this.getFileOutputChannelDescriptor();
		if (fileOutputChannelDescriptor) {
			await this.fileConfigurationService.updateReadonly(fileOutputChannelDescriptor.file, true);
			await this.editorService.openEditor({
				resource: fileOutputChannelDescriptor.file,
				options: {
					pinned: true,
				},
			}, group);
		}
	}

	private getFileOutputChannelDescriptor(): IFileOutputChannelDescriptor | null {
		const channel = this.outputService.getActiveChannel();
		if (channel) {
			const descriptor = this.outputService.getChannelDescriptors().filter(c => c.id === channel.id)[0];
			if (descriptor?.file) {
				return <IFileOutputChannelDescriptor>descriptor;
			}
		}
		return null;
	}

	private registerConfigureActiveOutputLogLevelAction(): void {
		const that = this;
		const logLevelMenu = new MenuId('workbench.output.menu.logLevel');
		this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
			submenu: logLevelMenu,
			title: nls.localize('logLevel.label', "Set Log Level..."),
			group: 'navigation',
			when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OUTPUT_VIEW_ID), CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE),
			icon: Codicon.gear,
			order: 6
		}));

		let order = 0;
		const registerLogLevel = (logLevel: LogLevel) => {
			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `workbench.action.output.activeOutputLogLevel.${logLevel}`,
						title: LogLevelToLocalizedString(logLevel).value,
						toggled: CONTEXT_ACTIVE_OUTPUT_LEVEL.isEqualTo(LogLevelToString(logLevel)),
						menu: {
							id: logLevelMenu,
							order: order++,
							group: '0_level'
						}
					});
				}
				async run(accessor: ServicesAccessor): Promise<void> {
					const channel = that.outputService.getActiveChannel();
					if (channel) {
						const channelDescriptor = that.outputService.getChannelDescriptor(channel.id);
						if (channelDescriptor?.log && channelDescriptor.file) {
							return accessor.get(ILoggerService).setLogLevel(channelDescriptor.file, logLevel);
						}
					}
				}
			}));
		};

		registerLogLevel(LogLevel.Trace);
		registerLogLevel(LogLevel.Debug);
		registerLogLevel(LogLevel.Info);
		registerLogLevel(LogLevel.Warning);
		registerLogLevel(LogLevel.Error);
		registerLogLevel(LogLevel.Off);

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.action.output.activeOutputLogLevelDefault`,
					title: nls.localize('logLevelDefault.label', "Set As Default"),
					menu: {
						id: logLevelMenu,
						order,
						group: '1_default'
					},
					precondition: CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT.negate()
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const channel = that.outputService.getActiveChannel();
				if (channel) {
					const channelDescriptor = that.outputService.getChannelDescriptor(channel.id);
					if (channelDescriptor?.log && channelDescriptor.file) {
						const logLevel = accessor.get(ILoggerService).getLogLevel(channelDescriptor.file);
						return await accessor.get(IDefaultLogLevelsService).setDefaultLogLevel(logLevel, channelDescriptor.extensionId);
					}
				}
			}
		}));
	}

	private registerShowLogsAction(): void {
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.showLogs',
					title: nls.localize2('showLogs', "Show Logs..."),
					category: Categories.Developer,
					menu: {
						id: MenuId.CommandPalette,
					},
				});
			}
			async run(accessor: ServicesAccessor): Promise<void> {
				const outputService = accessor.get(IOutputService);
				const quickInputService = accessor.get(IQuickInputService);
				const extensionLogs = [], logs = [];
				for (const channel of outputService.getChannelDescriptors()) {
					if (channel.log) {
						if (channel.extensionId) {
							extensionLogs.push(channel);
						} else {
							logs.push(channel);
						}
					}
				}
				const entries: ({ id: string; label: string } | IQuickPickSeparator)[] = [];
				for (const { id, label } of logs) {
					entries.push({ id, label });
				}
				if (extensionLogs.length && logs.length) {
					entries.push({ type: 'separator', label: nls.localize('extensionLogs', "Extension Logs") });
				}
				for (const { id, label } of extensionLogs) {
					entries.push({ id, label });
				}
				const entry = await quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Select Log") });
				if (entry) {
					return outputService.showChannel(entry.id);
				}
			}
		}));
	}

	private registerOpenLogFileAction(): void {
		interface IOutputChannelQuickPickItem extends IQuickPickItem {
			channel: IOutputChannelDescriptor;
		}
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.openLogFile',
					title: nls.localize2('openLogFile', "Open Log File..."),
					category: Categories.Developer,
					menu: {
						id: MenuId.CommandPalette,
					},
					metadata: {
						description: 'workbench.action.openLogFile',
						args: [{
							name: 'logFile',
							schema: {
								markdownDescription: nls.localize('logFile', "The id of the log file to open, for example `\"window\"`. Currently the best way to get this is to get the ID by checking the `workbench.action.output.show.<id>` commands"),
								type: 'string'
							}
						}]
					},
				});
			}
			async run(accessor: ServicesAccessor, args?: unknown): Promise<void> {
				const outputService = accessor.get(IOutputService);
				const quickInputService = accessor.get(IQuickInputService);
				const editorService = accessor.get(IEditorService);
				const fileConfigurationService = accessor.get(IFilesConfigurationService);

				let entry: IOutputChannelQuickPickItem | undefined;
				const argName = args && typeof args === 'string' ? args : undefined;
				const extensionChannels: IOutputChannelQuickPickItem[] = [];
				const coreChannels: IOutputChannelQuickPickItem[] = [];
				for (const c of outputService.getChannelDescriptors()) {
					if (c.file && c.log) {
						const e = { id: c.id, label: c.label, channel: c };
						if (c.extensionId) {
							extensionChannels.push(e);
						} else {
							coreChannels.push(e);
						}
						if (e.id === argName) {
							entry = e;
						}
					}
				}
				if (!entry) {
					const entries: QuickPickInput[] = [...extensionChannels.sort((a, b) => a.label.localeCompare(b.label))];
					if (entries.length && coreChannels.length) {
						entries.push({ type: 'separator' });
						entries.push(...coreChannels.sort((a, b) => a.label.localeCompare(b.label)));
					}
					entry = <IOutputChannelQuickPickItem | undefined>await quickInputService.pick(entries, { placeHolder: nls.localize('selectlogFile', "Select Log File") });
				}
				if (entry) {
					const resource = assertIsDefined(entry.channel.file);
					await fileConfigurationService.updateReadonly(resource, true);
					await editorService.openEditor({
						resource,
						options: {
							pinned: true,
						}
					});
				}
			}
		}));
	}

}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(OutputContribution, LifecyclePhase.Restored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'output',
	order: 30,
	title: nls.localize('output', "Output"),
	type: 'object',
	properties: {
		'output.smartScroll.enabled': {
			type: 'boolean',
			description: nls.localize('output.smartScroll.enabled', "Enable/disable the ability of smart scrolling in the output view. Smart scrolling allows you to lock scrolling automatically when you click in the output view and unlocks when you click in the last line."),
			default: true,
			scope: ConfigurationScope.WINDOW,
			tags: ['output']
		}
	}
});
