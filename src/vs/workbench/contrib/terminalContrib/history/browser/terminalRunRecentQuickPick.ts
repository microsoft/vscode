/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Toggle } from '../../../../../base/browser/ui/toggle/toggle.js';
import { isMacintosh, OperatingSystem } from '../../../../../base/common/platform.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { collapseTildePath } from '../../../../../platform/terminal/common/terminalEnvironment.js';
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { commandHistoryFuzzySearchIcon, commandHistoryOpenFileIcon, commandHistoryOutputIcon, commandHistoryRemoveIcon } from '../../../terminal/browser/terminalIcons.js';
import { TerminalStorageKeys } from '../../../terminal/common/terminalStorageKeys.js';
import { terminalStrings } from '../../../terminal/common/terminalStrings.js';
import { URI } from '../../../../../base/common/uri.js';
import { fromNow } from '../../../../../base/common/date.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { showWithPinnedItems } from '../../../../../platform/quickinput/browser/quickPickPin.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { AccessibleViewProviderId, IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { getCommandHistory, getDirectoryHistory, getShellFileHistory } from '../common/history.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { extUri, extUriIgnorePathCase } from '../../../../../base/common/resources.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { isObject } from '../../../../../base/common/types.js';

export async function showRunRecentQuickPick(
	accessor: ServicesAccessor,
	instance: ITerminalInstance,
	terminalInRunCommandPicker: IContextKey<boolean>,
	type: 'command' | 'cwd',
	filterMode?: 'fuzzy' | 'contiguous',
	value?: string,
): Promise<void> {
	if (!instance.xterm) {
		return;
	}

	const accessibleViewService = accessor.get(IAccessibleViewService);
	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);
	const quickInputService = accessor.get(IQuickInputService);
	const storageService = accessor.get(IStorageService);
	const pathService = accessor.get(IPathService);

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

	const openResourceButtons: (IQuickInputButton & { resource: URI })[] = [];

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
			for (let i = commands.length - 1; i >= 0; i--) {
				const entry = commands[i];
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
		}
		if (executingCommand) {
			items.unshift({
				label: formatLabel(executingCommand),
				rawLabel: executingCommand,
				description: cmdDetection.cwd
			});
		}
		if (items.length > 0) {
			items.unshift({
				type: 'separator',
				buttons: [], // HACK: Force full sized separators as there's no flag currently
				label: terminalStrings.currentSessionCategory
			});
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
				{
					type: 'separator',
					buttons: [], // HACK: Force full sized separators as there's no flag currently
					label: terminalStrings.previousSessionCategory
				},
				...previousSessionItems,
			);
		}

		// Gather shell file history
		const shellFileHistory = await instantiationService.invokeFunction(getShellFileHistory, instance.shellType);
		if (shellFileHistory !== undefined) {
			const dedupedShellFileItems: (IQuickPickItem & { rawLabel: string })[] = [];
			for (const label of shellFileHistory.commands) {
				if (!commandMap.has(label)) {
					dedupedShellFileItems.unshift({
						label: formatLabel(label),
						rawLabel: label
					});
				}
			}
			if (dedupedShellFileItems.length > 0) {
				const button: IQuickInputButton & { resource: URI } = {
					iconClass: ThemeIcon.asClassName(commandHistoryOpenFileIcon),
					tooltip: localize('openShellHistoryFile', "Open File"),
					alwaysVisible: false,
					resource: shellFileHistory.sourceResource
				};
				openResourceButtons.push(button);
				items.push(
					{
						type: 'separator',
						buttons: [button],
						label: localize('shellFileHistoryCategory', '{0} history', instance.shellType),
						description: shellFileHistory.sourceLabel
					},
					...dedupedShellFileItems,
				);
			}
		}
	} else {
		placeholder = isMacintosh
			? localize('selectRecentDirectoryMac', 'Select a directory to go to (hold Option-key to edit the command)')
			: localize('selectRecentDirectory', 'Select a directory to go to (hold Alt-key to edit the command)');

		// Check path uniqueness following target platform's case sensitivity rules.
		const uriComparer = instance.os === OperatingSystem.Windows ? extUriIgnorePathCase : extUri;
		const uniqueUris = new ResourceSet(o => uriComparer.getComparisonKey(o));

		const cwds = instance.capabilities.get(TerminalCapability.CwdDetection)?.cwds || [];
		if (cwds && cwds.length > 0) {
			for (const label of cwds) {
				const itemUri = URI.file(label);
				if (!uniqueUris.has(itemUri)) {
					uniqueUris.add(itemUri);
					items.push({
						label: await instance.getUriLabelForShell(itemUri),
						rawLabel: label
					});
				}
			}
			items = items.reverse();
			items.unshift({ type: 'separator', label: terminalStrings.currentSessionCategory });
		}

		// Gather previous session history
		const history = instantiationService.invokeFunction(getDirectoryHistory);
		const previousSessionItems: (IQuickPickItem & { rawLabel: string })[] = [];
		// Only add previous session item if it's not in this session and it matches the remote authority
		for (const [label, info] of history.entries) {
			if (info === null || info.remoteAuthority === instance.remoteAuthority) {
				const itemUri = info?.remoteAuthority ? await pathService.fileURI(label) : URI.file(label);
				if (!uniqueUris.has(itemUri)) {
					uniqueUris.add(itemUri);
					previousSessionItems.unshift({
						label: await instance.getUriLabelForShell(itemUri),
						rawLabel: label,
						buttons: [removeFromCommandHistoryButton]
					});
				}
			}
		}
		if (previousSessionItems.length > 0) {
			items.push(
				{ type: 'separator', label: terminalStrings.previousSessionCategory },
				...previousSessionItems,
			);
		}
	}
	if (items.length === 0) {
		return;
	}
	const disposables = new DisposableStore();
	const fuzzySearchToggle = disposables.add(new Toggle({
		title: 'Fuzzy search',
		icon: commandHistoryFuzzySearchIcon,
		isChecked: filterMode === 'fuzzy',
		inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
		inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
		inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
	}));
	disposables.add(fuzzySearchToggle.onChange(() => {
		instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, fuzzySearchToggle.checked ? 'fuzzy' : 'contiguous', quickPick.value);
	}));
	const outputProvider = disposables.add(instantiationService.createInstance(TerminalOutputProvider));
	const quickPick = disposables.add(quickInputService.createQuickPick<Item | IQuickPickItem & { rawLabel: string }>({ useSeparators: true }));
	const originalItems = items;
	quickPick.items = [...originalItems];
	quickPick.sortByLabel = false;
	quickPick.placeholder = placeholder;
	quickPick.matchOnLabelMode = filterMode || 'contiguous';
	quickPick.toggles = [fuzzySearchToggle];
	disposables.add(quickPick.onDidTriggerItemButton(async e => {
		if (e.button === removeFromCommandHistoryButton) {
			if (type === 'command') {
				instantiationService.invokeFunction(getCommandHistory)?.remove(e.item.label);
			} else {
				instantiationService.invokeFunction(getDirectoryHistory)?.remove(e.item.rawLabel);
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
	}));
	disposables.add(quickPick.onDidTriggerSeparatorButton(async e => {
		const resource = openResourceButtons.find(openResourceButton => e.button === openResourceButton)?.resource;
		if (resource) {
			await editorService.openEditor({
				resource
			});
		}
	}));
	disposables.add(quickPick.onDidChangeValue(async value => {
		if (!value) {
			await instantiationService.invokeFunction(showRunRecentQuickPick, instance, terminalInRunCommandPicker, type, filterMode, value);
		}
	}));
	let terminalScrollStateSaved = false;
	function restoreScrollState() {
		terminalScrollStateSaved = false;
		instance.xterm?.markTracker.restoreScrollState();
		instance.xterm?.markTracker.clear();
	}
	disposables.add(quickPick.onDidChangeActive(async () => {
		const xterm = instance.xterm;
		if (!xterm) {
			return;
		}
		const [item] = quickPick.activeItems;
		if (!item) {
			return;
		}
		function isItem(obj: unknown): obj is Item {
			return isObject(obj) && 'rawLabel' in obj;
		}
		if (isItem(item) && item.command && item.command.marker) {
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
	}));
	disposables.add(quickPick.onDidAccept(async () => {
		const result = quickPick.activeItems[0];
		let text: string;
		if (type === 'cwd') {
			text = `cd ${await instance.preparePathForShell(result.rawLabel)}`;
		} else { // command
			text = result.rawLabel;
		}
		quickPick.hide();
		terminalScrollStateSaved = false;
		instance.xterm?.markTracker.clear();
		instance.scrollToBottom();
		instance.runCommand(text, !quickPick.keyMods.alt);
		if (quickPick.keyMods.alt) {
			instance.focus();
		}
	}));
	disposables.add(quickPick.onDidHide(() => restoreScrollState()));
	if (value) {
		quickPick.value = value;
	}
	return new Promise<void>(r => {
		terminalInRunCommandPicker.set(true);
		disposables.add(showWithPinnedItems(storageService, runRecentStorageKey, quickPick, true));
		disposables.add(quickPick.onDidHide(() => {
			terminalInRunCommandPicker.set(false);
			accessibleViewService.showLastProvider(AccessibleViewProviderId.Terminal);
			r();
			disposables.dispose();
		}));
	});
}

class TerminalOutputProvider extends Disposable implements ITextModelContentProvider {
	static scheme = 'TERMINAL_OUTPUT';

	constructor(
		@ITextModelService textModelResolverService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();
		this._register(textModelResolverService.registerTextModelContentProvider(TerminalOutputProvider.scheme, this));
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		return this._modelService.createModel(resource.fragment, null, resource, false);
	}
}
