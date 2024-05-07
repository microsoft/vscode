/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { isMacintosh, OperatingSystem } from 'vs/base/common/platform';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { collapseTildePath } from 'vs/platform/terminal/common/terminalEnvironment';
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from 'vs/platform/theme/common/colorRegistry';
import { ThemeIcon } from 'vs/base/common/themables';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { commandHistoryFuzzySearchIcon, commandHistoryOutputIcon, commandHistoryRemoveIcon } from 'vs/workbench/contrib/terminal/browser/terminalIcons';
import { getCommandHistory, getDirectoryHistory, getShellFileHistory } from 'vs/workbench/contrib/terminal/common/history';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { URI } from 'vs/base/common/uri';
import { fromNow } from 'vs/base/common/date';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { showWithPinnedItems } from 'vs/platform/quickinput/browser/quickPickPin';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { AccessibleViewProviderId, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';

export async function showRunRecentQuickPick(
	accessor: ServicesAccessor,
	instance: ITerminalInstance,
	terminalInRunCommandPicker: IContextKey<boolean>,
	type: 'command' | 'cwd',
	filterMode?: 'fuzzy' | 'contiguous',
	value?: string
): Promise<void> {
	if (!instance.xterm) {
		return;
	}

	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);
	const quickInputService = accessor.get(IQuickInputService);
	const storageService = accessor.get(IStorageService);
	const accessibleViewService = accessor.get(IAccessibleViewService);

	const runRecentStorageKey = `${TerminalStorageKeys.PinnedRecentCommandsPrefix}.${instance.shellType}`;
	let placeholder: string;
	type Item = IQuickPickItem & { command?: ITerminalCommand; rawLabel: string };
	let items: (Item | IQuickPickItem & { rawLabel: string } | IQuickPickSeparator)[] = [];
	const commandMap: Set<string> = new Set();

	const removeFromCommandHistoryButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(commandHistoryRemoveIcon),
		tooltip: localize('removeCommand', "Remove from Command History")
	};

	const commandOutputButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(commandHistoryOutputIcon),
		tooltip: localize('viewCommandOutput', "View Command Output"),
		alwaysVisible: false
	};

	if (type === 'command') {
		placeholder = isMacintosh ? localize('selectRecentCommandMac', 'Select a command to run (hold Option-key to edit the command)') : localize('selectRecentCommand', 'Select a command to run (hold Alt-key to edit the command)');
		const cmdDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const commands = cmdDetection?.commands;
		// Current session history
		const executingCommand = cmdDetection?.executingCommand;
		if (executingCommand) {
			commandMap.add(executingCommand);
		}
		function formatLabel(label: string) {
			return label
				// Replace new lines with "enter" symbol
				.replace(/\r?\n/g, '\u23CE')
				// Replace 3 or more spaces with midline horizontal ellipsis which looks similar
				// to whitespace in the editor
				.replace(/\s\s\s+/g, '\u22EF');
		}
		if (commands && commands.length > 0) {
			for (const entry of commands) {
				// Trim off any whitespace and/or line endings, replace new lines with the
				// Downwards Arrow with Corner Leftwards symbol
				const label = entry.command.trim();
				if (label.length === 0 || commandMap.has(label)) {
					continue;
				}
				let description = collapseTildePath(entry.cwd, instance.userHome, instance.os === OperatingSystem.Windows ? '\\' : '/');
				if (entry.exitCode) {
					// Since you cannot get the last command's exit code on pwsh, just whether it failed
					// or not, -1 is treated specially as simply failed
					if (entry.exitCode === -1) {
						description += ' failed';
					} else {
						description += ` exitCode: ${entry.exitCode}`;
					}
				}
				description = description.trim();
				const buttons: IQuickInputButton[] = [commandOutputButton];
				// Merge consecutive commands
				const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
				if (lastItem?.type !== 'separator' && lastItem?.label === label) {
					lastItem.id = entry.timestamp.toString();
					lastItem.description = description;
					continue;
				}
				items.push({
					label: formatLabel(label),
					rawLabel: label,
					description,
					id: entry.timestamp.toString(),
					command: entry,
					buttons: entry.hasOutput() ? buttons : undefined
				});
				commandMap.add(label);
			}
			items = items.reverse();
		}
		if (executingCommand) {
			items.unshift({
				label: formatLabel(executingCommand),
				rawLabel: executingCommand,
				description: cmdDetection.cwd
			});
		}
		if (items.length > 0) {
			items.unshift({ type: 'separator', label: terminalStrings.currentSessionCategory });
		}

		// Gather previous session history
		const history = instantiationService.invokeFunction(getCommandHistory);
		const previousSessionItems: (IQuickPickItem & { rawLabel: string })[] = [];
		for (const [label, info] of history.entries) {
			// Only add previous session item if it's not in this session
			if (!commandMap.has(label) && info.shellType === instance.shellType) {
				previousSessionItems.unshift({
					label: formatLabel(label),
					rawLabel: label,
					buttons: [removeFromCommandHistoryButton]
				});
				commandMap.add(label);
			}
		}

		if (previousSessionItems.length > 0) {
			items.push(
				{ type: 'separator', label: terminalStrings.previousSessionCategory },
				...previousSessionItems
			);
		}

		// Gather shell file history
		const shellFileHistory = await instantiationService.invokeFunction(getShellFileHistory, instance.shellType);
		const dedupedShellFileItems: (IQuickPickItem & { rawLabel: string })[] = [];
		for (const label of shellFileHistory) {
			if (!commandMap.has(label)) {
				dedupedShellFileItems.unshift({
					label: formatLabel(label),
					rawLabel: label
				});
			}
		}
		if (dedupedShellFileItems.length > 0) {
			items.push(
				{ type: 'separator', label: localize('shellFileHistoryCategory', '{0} history', instance.shellType) },
				...dedupedShellFileItems
			);
		}
	} else {
		placeholder = isMacintosh
			? localize('selectRecentDirectoryMac', 'Select a directory to go to (hold Option-key to edit the command)')
			: localize('selectRecentDirectory', 'Select a directory to go to (hold Alt-key to edit the command)');
		const cwds = instance.capabilities.get(TerminalCapability.CwdDetection)?.cwds || [];
		if (cwds && cwds.length > 0) {
			for (const label of cwds) {
				items.push({ label, rawLabel: label });
			}
			items = items.reverse();
			items.unshift({ type: 'separator', label: terminalStrings.currentSessionCategory });
		}

		// Gather previous session history
		const history = instantiationService.invokeFunction(getDirectoryHistory);
		const previousSessionItems: (IQuickPickItem & { rawLabel: string })[] = [];
		// Only add previous session item if it's not in this session and it matches the remote authority
		for (const [label, info] of history.entries) {
			if ((info === null || info.remoteAuthority === instance.remoteAuthority) && !cwds.includes(label)) {
				previousSessionItems.unshift({
					label,
					rawLabel: label,
					buttons: [removeFromCommandHistoryButton]
				});
			}
		}
		if (previousSessionItems.length > 0) {
			items.push(
				{ type: 'separator', label: terminalStrings.previousSessionCategory },
				...previousSessionItems
			);
		}
	}
	if (items.length === 0) {
		return;
	}
	const fuzzySearchToggle = new Toggle({
		title: 'Fuzzy search',
		icon: commandHistoryFuzzySearchIcon,
		isChecked: filterMode === 'fuzzy',
		inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
		inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
		inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
	});
	fuzzySearchToggle.onChange(() => {
		instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, fuzzySearchToggle.checked ? 'fuzzy' : 'contiguous', quickPick.value);
	});
	const outputProvider = instantiationService.createInstance(TerminalOutputProvider);
	const quickPick = quickInputService.createQuickPick<Item | IQuickPickItem & { rawLabel: string }>();
	const originalItems = items;
	quickPick.items = [...originalItems];
	quickPick.sortByLabel = false;
	quickPick.placeholder = placeholder;
	quickPick.matchOnLabelMode = filterMode || 'contiguous';
	quickPick.toggles = [fuzzySearchToggle];
	quickPick.onDidTriggerItemButton(async e => {
		if (e.button === removeFromCommandHistoryButton) {
			if (type === 'command') {
				instantiationService.invokeFunction(getCommandHistory)?.remove(e.item.label);
			} else {
				instantiationService.invokeFunction(getDirectoryHistory)?.remove(e.item.label);
			}
		} else if (e.button === commandOutputButton) {
			const selectedCommand = (e.item as Item).command;
			const output = selectedCommand?.getOutput();
			if (output && selectedCommand?.command) {
				const textContent = await outputProvider.provideTextContent(URI.from(
					{
						scheme: TerminalOutputProvider.scheme,
						path: `${selectedCommand.command}... ${fromNow(selectedCommand.timestamp, true)}`,
						fragment: output,
						query: `terminal-output-${selectedCommand.timestamp}-${instance.instanceId}`
					}));
				if (textContent) {
					await editorService.openEditor({
						resource: textContent.uri
					});
				}
			}
		}
		await instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, filterMode, value);
	}
	);
	quickPick.onDidChangeValue(async value => {
		if (!value) {
			await instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, filterMode, value);
		}
	});
	let terminalScrollStateSaved = false;
	function restoreScrollState() {
		terminalScrollStateSaved = false;
		instance.xterm?.markTracker.restoreScrollState();
		instance.xterm?.markTracker.clear();
	}
	quickPick.onDidChangeActive(async () => {
		const xterm = instance.xterm;
		if (!xterm) {
			return;
		}
		const [item] = quickPick.activeItems;
		if ('command' in item && item.command && item.command.marker) {
			if (!terminalScrollStateSaved) {
				xterm.markTracker.saveScrollState();
				terminalScrollStateSaved = true;
			}
			const promptRowCount = item.command.getPromptRowCount();
			const commandRowCount = item.command.getCommandRowCount();
			xterm.markTracker.revealRange({
				start: {
					x: 1,
					y: item.command.marker.line - (promptRowCount - 1) + 1
				},
				end: {
					x: instance.cols,
					y: item.command.marker.line + (commandRowCount - 1) + 1
				}
			});
		} else {
			restoreScrollState();
		}
	});
	quickPick.onDidAccept(async () => {
		const result = quickPick.activeItems[0];
		let text: string;
		if (type === 'cwd') {
			text = `cd ${await instance.preparePathForShell(result.rawLabel)}`;
		} else { // command
			text = result.rawLabel;
		}
		quickPick.hide();
		instance.runCommand(text, !quickPick.keyMods.alt);
		if (quickPick.keyMods.alt) {
			instance.focus();
		}
		restoreScrollState();
	});
	quickPick.onDidHide(() => restoreScrollState());
	if (value) {
		quickPick.value = value;
	}
	return new Promise<void>(r => {
		terminalInRunCommandPicker.set(true);
		showWithPinnedItems(storageService, runRecentStorageKey, quickPick, true);
		quickPick.onDidHide(() => {
			terminalInRunCommandPicker.set(false);
			accessibleViewService.showLastProvider(AccessibleViewProviderId.Terminal);
			r();
		});
	});
}

class TerminalOutputProvider implements ITextModelContentProvider {
	static scheme = 'TERMINAL_OUTPUT';

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IModelService private readonly _modelService: IModelService
	) {
		textModelResolverService.registerTextModelContentProvider(TerminalOutputProvider.scheme, this);
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		return this._modelService.createModel(resource.fragment, null, resource, false);
	}
}
