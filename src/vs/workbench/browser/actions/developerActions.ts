/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/actions.css';

import { localize, localize2 } from '../../../nls.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { DomEmitter } from '../../../base/browser/event.js';
import { Color } from '../../../base/common/color.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { IDisposable, toDisposable, dispose, DisposableStore, setDisposableTracker, DisposableTracker, DisposableInfo } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getDomNodePagePosition, append, $, getActiveDocument, onDidRegisterWindow, getWindows } from '../../../base/browser/dom.js';
import { createCSSRule, createStyleSheet } from '../../../base/browser/domStylesheets.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { Context } from '../../../platform/contextkey/browser/contextKeyService.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { raceTimeout, RunOnceScheduler } from '../../../base/common/async.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { registerAction2, Action2, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { clamp } from '../../../base/common/numbers.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IWorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { IWorkingCopyBackupService } from '../../services/workingCopy/common/workingCopyBackup.js';
import { ResolutionResult, ResultKind } from '../../../platform/keybinding/common/keybindingResolver.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IOutputService } from '../../services/output/common/output.js';
import { windowLogId } from '../../services/log/common/logConstants.js';
import { ByteSize } from '../../../platform/files/common/files.js';
import { IQuickInputService, IQuickPickItem } from '../../../platform/quickinput/common/quickInput.js';
import { IUserDataProfileService } from '../../services/userDataProfile/common/userDataProfile.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import product from '../../../platform/product/common/product.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IDefaultAccountService } from '../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../services/authentication/common/authentication.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { IPolicyService, PolicyValueSource } from '../../../platform/policy/common/policy.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { isVirtualWorkspace } from '../../../platform/workspace/common/virtualWorkspace.js';
import { COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_STRICT_MARKETPLACES_KEY, INativeManagedSettingsService, IFileManagedSettingsService, ManagedSettingsChannel, ManagedSettingsSource, normalizeManagedSettings, projectManagedSettings, pickManagedSettings } from '../../../platform/policy/common/copilotManagedSettings.js';
import { IManagedSettingPolicyDefinition, ManagedSettingsData } from '../../../base/common/policy.js';
import { APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, IAccountPolicyGateService } from '../../services/policies/common/accountPolicyService.js';
import { adaptManagedSettings, appendManagedSettingsClientIdentity, IManagedSettingsResponse } from '../../services/accounts/browser/managedSettings.js';
import { isObject } from '../../../base/common/types.js';
import * as json from '../../../base/common/json.js';
import { getParseErrorMessage } from '../../../base/common/jsonErrorMessages.js';
import { IAgentHostService } from '../../../platform/agentHost/common/agentService.js';
import { IAgentHostEnablementService } from '../../../platform/agentHost/common/agentHostEnablementService.js';
import { IProgressService, ProgressLocation } from '../../../platform/progress/common/progress.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { markdownDetails, markdownJsonBlock, markdownTable, markdownText } from './policyDiagnosticsMarkdown.js';

class InspectContextKeysAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.inspectContextKeys',
			title: localize2('inspect context keys', 'Inspect Context Keys'),
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const contextKeyService = accessor.get(IContextKeyService);

		const disposables = new DisposableStore();

		const stylesheet = createStyleSheet(undefined, undefined, disposables);
		createCSSRule('*', 'cursor: crosshair !important;', stylesheet);

		const hoverFeedback = document.createElement('div');
		const activeDocument = getActiveDocument();
		activeDocument.body.appendChild(hoverFeedback);
		disposables.add(toDisposable(() => hoverFeedback.remove()));

		hoverFeedback.style.position = 'absolute';
		hoverFeedback.style.pointerEvents = 'none';
		hoverFeedback.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
		hoverFeedback.style.zIndex = '1000';

		const onMouseMove = disposables.add(new DomEmitter(activeDocument, 'mousemove', true));
		disposables.add(onMouseMove.event(e => {
			const target = e.target as HTMLElement;
			const position = getDomNodePagePosition(target);

			hoverFeedback.style.top = `${position.top}px`;
			hoverFeedback.style.left = `${position.left}px`;
			hoverFeedback.style.width = `${position.width}px`;
			hoverFeedback.style.height = `${position.height}px`;
		}));

		const onMouseDown = disposables.add(new DomEmitter(activeDocument, 'mousedown', true));
		Event.once(onMouseDown.event)(e => { e.preventDefault(); e.stopPropagation(); }, null, disposables);

		const onMouseUp = disposables.add(new DomEmitter(activeDocument, 'mouseup', true));
		Event.once(onMouseUp.event)(e => {
			e.preventDefault();
			e.stopPropagation();

			const context = contextKeyService.getContext(e.target as HTMLElement) as Context;
			console.log(context.collectAllValues());

			dispose(disposables);
		}, null, disposables);
	}
}

interface IScreencastKeyboardOptions {
	readonly showKeys?: boolean;
	readonly showKeybindings?: boolean;
	readonly showCommands?: boolean;
	readonly showCommandGroups?: boolean;
	readonly showSingleEditorCursorMoves?: boolean;
}

class ToggleScreencastModeAction extends Action2 {

	static disposable: IDisposable | undefined;

	constructor() {
		super({
			id: 'workbench.action.toggleScreencastMode',
			title: localize2('toggle screencast mode', 'Toggle Screencast Mode'),
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		if (ToggleScreencastModeAction.disposable) {
			ToggleScreencastModeAction.disposable.dispose();
			ToggleScreencastModeAction.disposable = undefined;
			return;
		}

		const layoutService = accessor.get(ILayoutService);
		const configurationService = accessor.get(IConfigurationService);
		const keybindingService = accessor.get(IKeybindingService);

		const disposables = new DisposableStore();

		const container = layoutService.activeContainer;

		const mouseMarker = append(container, $('.screencast-mouse'));
		disposables.add(toDisposable(() => mouseMarker.remove()));

		const keyboardMarker = append(container, $('.screencast-keyboard'));
		disposables.add(toDisposable(() => keyboardMarker.remove()));

		const onMouseDown = disposables.add(new Emitter<MouseEvent>());
		const onMouseUp = disposables.add(new Emitter<MouseEvent>());
		const onMouseMove = disposables.add(new Emitter<MouseEvent>());

		function registerContainerListeners(container: HTMLElement, windowDisposables: DisposableStore): void {
			const listeners = new DisposableStore();

			listeners.add(listeners.add(new DomEmitter(container, 'mousedown', true)).event(e => onMouseDown.fire(e)));
			listeners.add(listeners.add(new DomEmitter(container, 'mouseup', true)).event(e => onMouseUp.fire(e)));
			listeners.add(listeners.add(new DomEmitter(container, 'mousemove', true)).event(e => onMouseMove.fire(e)));

			windowDisposables.add(listeners);
			disposables.add(toDisposable(() => windowDisposables.delete(listeners)));

			disposables.add(listeners);
		}

		for (const { window, disposables } of getWindows()) {
			registerContainerListeners(layoutService.getContainer(window), disposables);
		}

		disposables.add(onDidRegisterWindow(({ window, disposables }) => registerContainerListeners(layoutService.getContainer(window), disposables)));

		disposables.add(layoutService.onDidChangeActiveContainer(() => {
			layoutService.activeContainer.appendChild(mouseMarker);
			layoutService.activeContainer.appendChild(keyboardMarker);
		}));

		const updateMouseIndicatorColor = () => {
			mouseMarker.style.borderColor = Color.fromHex(configurationService.getValue<string>('screencastMode.mouseIndicatorColor')).toString();
		};

		let mouseIndicatorSize: number;
		const updateMouseIndicatorSize = () => {
			mouseIndicatorSize = clamp(configurationService.getValue<number>('screencastMode.mouseIndicatorSize') || 20, 20, 100);

			mouseMarker.style.height = `${mouseIndicatorSize}px`;
			mouseMarker.style.width = `${mouseIndicatorSize}px`;
		};

		updateMouseIndicatorColor();
		updateMouseIndicatorSize();

		disposables.add(onMouseDown.event(e => {
			mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
			mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
			mouseMarker.style.display = 'block';
			mouseMarker.style.transform = `scale(${1})`;
			mouseMarker.style.transition = 'transform 0.1s';

			const mouseMoveListener = onMouseMove.event(e => {
				mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
				mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
				mouseMarker.style.transform = `scale(${.8})`;
			});

			Event.once(onMouseUp.event)(() => {
				mouseMarker.style.display = 'none';
				mouseMoveListener.dispose();
			});
		}));

		const updateKeyboardFontSize = () => {
			keyboardMarker.style.fontSize = `${clamp(configurationService.getValue<number>('screencastMode.fontSize') || 56, 20, 100)}px`;
		};

		const updateKeyboardMarker = () => {
			keyboardMarker.style.bottom = `${clamp(configurationService.getValue<number>('screencastMode.verticalOffset') || 0, 0, 90)}%`;
		};

		let keyboardMarkerTimeout!: number;
		const updateKeyboardMarkerTimeout = () => {
			keyboardMarkerTimeout = clamp(configurationService.getValue<number>('screencastMode.keyboardOverlayTimeout') || 800, 500, 5000);
		};

		updateKeyboardFontSize();
		updateKeyboardMarker();
		updateKeyboardMarkerTimeout();

		disposables.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('screencastMode.verticalOffset')) {
				updateKeyboardMarker();
			}

			if (e.affectsConfiguration('screencastMode.fontSize')) {
				updateKeyboardFontSize();
			}

			if (e.affectsConfiguration('screencastMode.keyboardOverlayTimeout')) {
				updateKeyboardMarkerTimeout();
			}

			if (e.affectsConfiguration('screencastMode.mouseIndicatorColor')) {
				updateMouseIndicatorColor();
			}

			if (e.affectsConfiguration('screencastMode.mouseIndicatorSize')) {
				updateMouseIndicatorSize();
			}
		}));

		const onKeyDown = disposables.add(new Emitter<KeyboardEvent>());
		const onCompositionStart = disposables.add(new Emitter<CompositionEvent>());
		const onCompositionUpdate = disposables.add(new Emitter<CompositionEvent>());
		const onCompositionEnd = disposables.add(new Emitter<CompositionEvent>());

		function registerWindowListeners(window: Window, windowDisposables: DisposableStore): void {
			const listeners = new DisposableStore();

			listeners.add(listeners.add(new DomEmitter(window, 'keydown', true)).event(e => onKeyDown.fire(e)));
			listeners.add(listeners.add(new DomEmitter(window, 'compositionstart', true)).event(e => onCompositionStart.fire(e)));
			listeners.add(listeners.add(new DomEmitter(window, 'compositionupdate', true)).event(e => onCompositionUpdate.fire(e)));
			listeners.add(listeners.add(new DomEmitter(window, 'compositionend', true)).event(e => onCompositionEnd.fire(e)));

			windowDisposables.add(listeners);
			disposables.add(toDisposable(() => windowDisposables.delete(listeners)));

			disposables.add(listeners);
		}

		for (const { window, disposables } of getWindows()) {
			registerWindowListeners(window, disposables);
		}

		disposables.add(onDidRegisterWindow(({ window, disposables }) => registerWindowListeners(window, disposables)));

		let length = 0;
		let composing: Element | undefined = undefined;
		let imeBackSpace = false;

		const clearKeyboardScheduler = disposables.add(new RunOnceScheduler(() => {
			keyboardMarker.textContent = '';
			composing = undefined;
			length = 0;
		}, keyboardMarkerTimeout));

		disposables.add(onCompositionStart.event(e => {
			imeBackSpace = true;
		}));

		disposables.add(onCompositionUpdate.event(e => {
			if (e.data && imeBackSpace) {
				if (length > 20) {
					keyboardMarker.innerText = '';
					length = 0;
				}
				composing = composing ?? append(keyboardMarker, $('span.key'));
				composing.textContent = e.data;
			} else if (imeBackSpace) {
				keyboardMarker.innerText = '';
				append(keyboardMarker, $('span.key', {}, `Backspace`));
			}
			clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
		}));

		disposables.add(onCompositionEnd.event(e => {
			composing = undefined;
			length++;
		}));

		disposables.add(onKeyDown.event(e => {
			if (e.key === 'Process' || /[\uac00-\ud787\u3131-\u314e\u314f-\u3163\u3041-\u3094\u30a1-\u30f4\u30fc\u3005\u3006\u3024\u4e00-\u9fa5]/u.test(e.key)) {
				if (e.code === 'Backspace') {
					imeBackSpace = true;
				} else if (!e.code.includes('Key')) {
					composing = undefined;
					imeBackSpace = false;
				} else {
					imeBackSpace = true;
				}
				clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
				return;
			}

			if (e.isComposing) {
				return;
			}

			const options = configurationService.getValue<IScreencastKeyboardOptions>('screencastMode.keyboardOptions');
			const event = new StandardKeyboardEvent(e);
			const shortcut = keybindingService.softDispatch(event, event.target);

			// Hide the single arrow key pressed
			if (shortcut.kind === ResultKind.KbFound && shortcut.commandId && !(options.showSingleEditorCursorMoves ?? true) && (
				['cursorLeft', 'cursorRight', 'cursorUp', 'cursorDown'].includes(shortcut.commandId))
			) {
				return;
			}

			if (
				event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
				|| length > 20
				|| event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Escape
				|| event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.DownArrow
				|| event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.RightArrow
			) {
				keyboardMarker.innerText = '';
				length = 0;
			}

			const keybinding = keybindingService.resolveKeyboardEvent(event);
			const commandDetails = (this._isKbFound(shortcut) && shortcut.commandId) ? this.getCommandDetails(shortcut.commandId) : undefined;

			let commandAndGroupLabel = commandDetails?.title;
			let keyLabel: string | undefined | null = keybinding.getLabel();

			if (commandDetails) {
				if ((options.showCommandGroups ?? false) && commandDetails.category) {
					commandAndGroupLabel = `${commandDetails.category}: ${commandAndGroupLabel} `;
				}

				if (this._isKbFound(shortcut) && shortcut.commandId) {
					const keybindings = keybindingService.lookupKeybindings(shortcut.commandId)
						.filter(k => k.getLabel()?.endsWith(keyLabel ?? ''));

					if (keybindings.length > 0) {
						keyLabel = keybindings[keybindings.length - 1].getLabel();
					}
				}
			}

			if ((options.showCommands ?? true) && commandAndGroupLabel) {
				append(keyboardMarker, $('span.title', {}, `${commandAndGroupLabel} `));
			}

			if ((options.showKeys ?? true) || ((options.showKeybindings ?? true) && this._isKbFound(shortcut))) {
				// Fix label for arrow keys
				keyLabel = keyLabel?.replace('UpArrow', '↑')
					?.replace('DownArrow', '↓')
					?.replace('LeftArrow', '←')
					?.replace('RightArrow', '→');

				append(keyboardMarker, $('span.key', {}, keyLabel ?? ''));
			}

			length++;
			clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
		}));

		ToggleScreencastModeAction.disposable = disposables;
	}

	private _isKbFound(resolutionResult: ResolutionResult): resolutionResult is { kind: ResultKind.KbFound; commandId: string | null; commandArgs: unknown; isBubble: boolean } {
		return resolutionResult.kind === ResultKind.KbFound;
	}

	private getCommandDetails(commandId: string): { title: string; category?: string } | undefined {
		const fromMenuRegistry = MenuRegistry.getCommand(commandId);

		if (fromMenuRegistry) {
			return {
				title: typeof fromMenuRegistry.title === 'string' ? fromMenuRegistry.title : fromMenuRegistry.title.value,
				category: fromMenuRegistry.category ? (typeof fromMenuRegistry.category === 'string' ? fromMenuRegistry.category : fromMenuRegistry.category.value) : undefined
			};
		}

		const fromCommandsRegistry = CommandsRegistry.getCommand(commandId);

		if (fromCommandsRegistry?.metadata?.description) {
			return { title: typeof fromCommandsRegistry.metadata.description === 'string' ? fromCommandsRegistry.metadata.description : fromCommandsRegistry.metadata.description.value };
		}

		return undefined;
	}
}

class LogStorageAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.logStorage',
			title: localize2({ key: 'logStorage', comment: ['A developer only action to log the contents of the storage for the current window.'] }, "Log Storage Database Contents"),
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		const dialogService = accessor.get(IDialogService);

		storageService.log();

		dialogService.info(localize('storageLogDialogMessage', "The storage database contents have been logged to the developer tools."), localize('storageLogDialogDetails', "Open developer tools from the menu and select the Console tab."));
	}
}

class LogWorkingCopiesAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.logWorkingCopies',
			title: localize2({ key: 'logWorkingCopies', comment: ['A developer only action to log the working copies that exist.'] }, "Log Working Copies"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workingCopyService = accessor.get(IWorkingCopyService);
		const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
		const logService = accessor.get(ILogService);
		const outputService = accessor.get(IOutputService);

		const backups = await workingCopyBackupService.getBackups();

		const msg = [
			``,
			`[Working Copies]`,
			...(workingCopyService.workingCopies.length > 0) ?
				workingCopyService.workingCopies.map(workingCopy => `${workingCopy.isDirty() ? '● ' : ''}${workingCopy.resource.toString(true)} (typeId: ${workingCopy.typeId || '<no typeId>'})`) :
				['<none>'],
			``,
			`[Backups]`,
			...(backups.length > 0) ?
				backups.map(backup => `${backup.resource.toString(true)} (typeId: ${backup.typeId || '<no typeId>'})`) :
				['<none>'],
		];

		logService.info(msg.join('\n'));

		outputService.showChannel(windowLogId, true);
	}
}

class RemoveLargeStorageEntriesAction extends Action2 {

	private static SIZE_THRESHOLD = 1024 * 16; // 16kb

	constructor() {
		super({
			id: 'workbench.action.removeLargeStorageDatabaseEntries',
			title: localize2('removeLargeStorageDatabaseEntries', 'Remove Large Storage Database Entries...'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const quickInputService = accessor.get(IQuickInputService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const dialogService = accessor.get(IDialogService);
		const environmentService = accessor.get(IEnvironmentService);

		interface IStorageItem extends IQuickPickItem {
			readonly key: string;
			readonly scope: StorageScope;
			readonly target: StorageTarget;
			readonly size: number;
		}

		const items: IStorageItem[] = [];

		for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
			if (scope === StorageScope.PROFILE && userDataProfileService.currentProfile.isDefault) {
				continue; // avoid duplicates
			}

			for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
				for (const key of storageService.keys(scope, target)) {
					const value = storageService.get(key, scope);
					if (value && (!environmentService.isBuilt /* show all keys in dev */ || value.length > RemoveLargeStorageEntriesAction.SIZE_THRESHOLD)) {
						items.push({
							key,
							scope,
							target,
							size: value.length,
							label: key,
							description: ByteSize.formatSize(value.length),
							detail: localize('largeStorageItemDetail', "Scope: {0}, Target: {1}", scope === StorageScope.APPLICATION ? localize('global', "Global") : scope === StorageScope.PROFILE ? localize('profile', "Profile") : localize('workspace', "Workspace"), target === StorageTarget.MACHINE ? localize('machine', "Machine") : localize('user', "User")),
						});
					}
				}
			}
		}

		items.sort((itemA, itemB) => itemB.size - itemA.size);

		const selectedItems = await new Promise<readonly IStorageItem[]>(resolve => {
			const disposables = new DisposableStore();

			const picker = disposables.add(quickInputService.createQuickPick<IStorageItem>());
			picker.items = items;
			picker.canSelectMany = true;
			picker.ok = false;
			picker.customButton = true;
			picker.hideCheckAll = true;
			picker.customLabel = localize('removeLargeStorageEntriesPickerButton', "Remove");
			picker.placeholder = localize('removeLargeStorageEntriesPickerPlaceholder', "Select large entries to remove from storage");

			if (items.length === 0) {
				picker.description = localize('removeLargeStorageEntriesPickerDescriptionNoEntries', "There are no large storage entries to remove.");
			}

			picker.show();

			disposables.add(picker.onDidCustom(() => {
				resolve(picker.selectedItems);
				picker.hide();
			}));

			disposables.add(picker.onDidHide(() => disposables.dispose()));
		});

		if (selectedItems.length === 0) {
			return;
		}

		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('removeLargeStorageEntriesConfirmRemove', "Do you want to remove the selected storage entries from the database?"),
			detail: localize('removeLargeStorageEntriesConfirmRemoveDetail', "{0}\n\nThis action is irreversible and may result in data loss!", selectedItems.map(item => item.label).join('\n')),
			primaryButton: localize({ key: 'removeLargeStorageEntriesButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Remove")
		});

		if (!confirmed) {
			return;
		}

		const scopesToOptimize = new Set<StorageScope>();
		for (const item of selectedItems) {
			storageService.remove(item.key, item.scope);
			scopesToOptimize.add(item.scope);
		}

		for (const scope of scopesToOptimize) {
			await storageService.optimize(scope);
		}
	}
}

let tracker: DisposableTracker | undefined = undefined;
let trackedDisposables = new Set<IDisposable>();

const DisposablesSnapshotStateContext = new RawContextKey<'started' | 'pending' | 'stopped'>('dirtyWorkingCopies', 'stopped');

class StartTrackDisposables extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.startTrackDisposables',
			title: localize2('startTrackDisposables', 'Start Tracking Disposables'),
			category: Categories.Developer,
			f1: true,
			precondition: ContextKeyExpr.and(DisposablesSnapshotStateContext.isEqualTo('pending').negate(), DisposablesSnapshotStateContext.isEqualTo('started').negate())
		});
	}

	run(accessor: ServicesAccessor): void {
		const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
		disposablesSnapshotStateContext.set('started');

		trackedDisposables.clear();

		tracker = new DisposableTracker();
		setDisposableTracker(tracker);
	}
}

class SnapshotTrackedDisposables extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.snapshotTrackedDisposables',
			title: localize2('snapshotTrackedDisposables', 'Snapshot Tracked Disposables'),
			category: Categories.Developer,
			f1: true,
			precondition: DisposablesSnapshotStateContext.isEqualTo('started')
		});
	}

	run(accessor: ServicesAccessor): void {
		const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
		disposablesSnapshotStateContext.set('pending');

		trackedDisposables = new Set(tracker?.computeLeakingDisposables(1000)?.leaks.map(disposable => disposable.value));
	}
}

class StopTrackDisposables extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.stopTrackDisposables',
			title: localize2('stopTrackDisposables', 'Stop Tracking Disposables'),
			category: Categories.Developer,
			f1: true,
			precondition: DisposablesSnapshotStateContext.isEqualTo('pending')
		});
	}

	run(accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);

		const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
		disposablesSnapshotStateContext.set('stopped');

		if (tracker) {
			const disposableLeaks = new Set<DisposableInfo>();

			for (const disposable of new Set(tracker.computeLeakingDisposables(1000)?.leaks) ?? []) {
				if (trackedDisposables.has(disposable.value)) {
					disposableLeaks.add(disposable);
				}
			}

			const leaks = tracker.computeLeakingDisposables(1000, Array.from(disposableLeaks));
			if (leaks) {
				editorService.openEditor({ resource: undefined, contents: leaks.details });
			}
		}

		setDisposableTracker(null);
		tracker = undefined;
		trackedDisposables.clear();
	}
}

/** Human-readable label for a managed-settings {@link ManagedSettingsSource} in the diagnostics report. */
function managedSettingsSourceLabel(source: ManagedSettingsSource): string {
	switch (source) {
		case 'server': return 'GitHub Server API';
		case 'nativeMdm': return 'Native MDM';
		case 'file': return 'File (managed-settings.json)';
		case 'none': return 'None (no managed settings active)';
	}
}

/** Compact label for the "Policy Source" column, where the adjacent "Managed Settings" column already lists the key. */
function managedSettingsSourceShortLabel(source: ManagedSettingsSource): string {
	switch (source) {
		case 'server': return 'Server';
		case 'nativeMdm': return 'Native MDM';
		case 'file': return 'File';
		case 'none': return 'None';
	}
}

function policyValueSourceLabel(source: PolicyValueSource | undefined): string {
	switch (source) {
		case PolicyValueSource.Device: return 'Device';
		case PolicyValueSource.NativeMdm: return 'Managed Settings: Native MDM';
		case PolicyValueSource.ServerManagedSettings: return 'Managed Settings: Server';
		case PolicyValueSource.FileManagedSettings: return 'Managed Settings: File';
		case PolicyValueSource.MixedManagedSettings: return 'Managed Settings: Mixed';
		case PolicyValueSource.Account: return 'Account';
		case PolicyValueSource.AccountGate: return 'Account Policy Gate';
		case undefined: return 'Unknown';
	}
}

function managedSettingsPipeline(rawLabel: string, raw: unknown | undefined, normalized: ManagedSettingsData, projected: ManagedSettingsData, rawUnavailableMessage?: string): string {
	let content = `**${markdownText(rawLabel)}**\n\n`;
	content += raw === undefined ? `*${markdownText(rawUnavailableMessage ?? 'Unavailable')}*\n\n` : markdownJsonBlock(raw);
	content += '**Normalized bag**\n\n';
	content += markdownJsonBlock(normalized);
	content += '**VS Code policy projection**\n\n';
	content += markdownJsonBlock(projected);
	return markdownDetails('Source, normalized, and VS Code projection', content);
}

function formatDiagnosticValue(value: unknown): string {
	return JSON.stringify(value) ?? String(value);
}

const AGENT_RUNTIME_DIAGNOSTICS_TIMEOUT = 6000;

interface IPolicyDiagnosticsSummary {
	accountPolicyGate: string;
	managedSettingsSources: string;
	effectiveManagedSettings: string;
	managedSettingsIssues: string;
	agentRuntime: string;
	chatHarnessEnforcement: string;
	policyControlledSettings: string;
}

interface IPolicyDiagnosticsServices {
	editorService: IEditorService;
	commandService: ICommandService;
	notificationService: INotificationService;
	configurationService: IConfigurationService;
	productService: IProductService;
	defaultAccountService: IDefaultAccountService;
	authenticationService: IAuthenticationService;
	authenticationAccessService: IAuthenticationAccessService;
	policyService: IPolicyService;
	accountPolicyGateService: IAccountPolicyGateService;
	agentHostService: IAgentHostService;
	agentHostEnablementService: IAgentHostEnablementService;
	workspaceContextService: IWorkspaceContextService;
	nativeManagedSettingsService: INativeManagedSettingsService | undefined;
	fileManagedSettingsService: IFileManagedSettingsService | undefined;
}

class PolicyDiagnosticsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.showPolicyDiagnostics',
			title: localize2('policyDiagnostics', 'Policy Diagnostics'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);
		const configurationService = accessor.get(IConfigurationService);
		const productService = accessor.get(IProductService);
		const defaultAccountService = accessor.get(IDefaultAccountService);
		const authenticationService = accessor.get(IAuthenticationService);
		const authenticationAccessService = accessor.get(IAuthenticationAccessService);
		const policyService = accessor.get(IPolicyService);
		const accountPolicyGateService = accessor.get(IAccountPolicyGateService);
		const agentHostService = accessor.get(IAgentHostService);
		const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const progressService = accessor.get(IProgressService);
		// Native MDM is a desktop-only channel, registered in the renderer service collection on
		// desktop and Agents windows but absent in web. Resolve it now, synchronously, because the
		// accessor is only valid before the first `await` below.
		let nativeManagedSettingsService: INativeManagedSettingsService | undefined;
		try {
			nativeManagedSettingsService = accessor.get(INativeManagedSettingsService);
		} catch {
			// no native MDM channel in this window (e.g. web)
		}
		// File-based managed settings is likewise a desktop-only channel registered in the renderer
		// service collection on desktop and Agents windows, absent in web.
		let fileManagedSettingsService: IFileManagedSettingsService | undefined;
		try {
			fileManagedSettingsService = accessor.get(IFileManagedSettingsService);
		} catch {
			// no file channel in this window (e.g. web)
		}

		return progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('policyDiagnostics.progress', "Generating policy diagnostics..."),
			type: 'loading',
		}, () => this.openPolicyDiagnostics({
			editorService,
			commandService,
			notificationService,
			configurationService,
			productService,
			defaultAccountService,
			authenticationService,
			authenticationAccessService,
			policyService,
			accountPolicyGateService,
			agentHostService,
			agentHostEnablementService,
			workspaceContextService,
			nativeManagedSettingsService,
			fileManagedSettingsService,
		}));
	}

	private async openPolicyDiagnostics(services: IPolicyDiagnosticsServices): Promise<void> {
		const {
			editorService,
			commandService,
			notificationService,
			configurationService,
			productService,
			defaultAccountService,
			authenticationService,
			authenticationAccessService,
			policyService,
			accountPolicyGateService,
			agentHostService,
			agentHostEnablementService,
			workspaceContextService,
			nativeManagedSettingsService,
			fileManagedSettingsService,
		} = services;
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

		const summary: IPolicyDiagnosticsSummary = {
			accountPolicyGate: 'Unavailable',
			managedSettingsSources: 'Unavailable',
			effectiveManagedSettings: 'Unavailable',
			managedSettingsIssues: 'Unavailable',
			agentRuntime: 'Unavailable',
			chatHarnessEnforcement: 'Unavailable',
			policyControlledSettings: 'Unavailable'
		};

		let content = '';
		content += '## System Information\n\n';
		content += markdownTable(
			['Property', 'Value'],
			[
				['Generated', new Date().toISOString()],
				['Product', `${productService.nameLong} ${productService.version}`],
				['Commit', productService.commit || 'n/a']
			]
		);

		// Account information
		content += '## Account Information\n\n';
		try {
			const account = await defaultAccountService.getDefaultAccount();
			const sensitiveKeys = ['sessionId', 'analytics_tracking_id'];
			if (account) {
				// Try to get username/display info from the authentication session
				let username = 'Unknown';
				let accountLabel = 'Unknown';
				try {
					const providerIds = authenticationService.getProviderIds();
					for (const providerId of providerIds) {
						const sessions = await authenticationService.getSessions(providerId);
						const matchingSession = sessions.find(session => session.id === account.sessionId);
						if (matchingSession) {
							username = matchingSession.account.id;
							accountLabel = matchingSession.account.label;
							break;
						}
					}
				} catch (error) {
					// Fallback to just session info
				}

				content += '### Default Account Summary\n\n';
				content += markdownTable(
					['Property', 'Value'],
					[
						['Account ID/Username', username],
						['Account Label', accountLabel]
					]
				);

				const accountPropertyRows: string[][] = [];
				for (const [key, value] of Object.entries(account)) {
					if (value !== undefined && value !== null) {
						const displayValue = sensitiveKeys.includes(key)
							? '***'
							: typeof value === 'object' ? formatDiagnosticValue(value) : String(value);
						accountPropertyRows.push([key, displayValue]);
					}
				}
				const policyData = defaultAccountService.policyData;
				accountPropertyRows.push(['policyData', policyData ? formatDiagnosticValue(policyData) : 'No Policy Data']);
				content += markdownDetails(
					'Detailed account properties',
					markdownTable(['Property', 'Value'], accountPropertyRows)
				);
			} else {
				content += '*No default account configured*\n\n';
			}
		} catch (error) {
			content += `*Error retrieving account information: ${markdownText(getErrorMessage(error))}*\n\n`;
		}

		// Account Policy Gate (forces AI features off until an admin-approved
		// GitHub account is signed in AND its account-side policy data has resolved).
		content += '## Account Policy Gate\n\n';
		try {
			const gateInfo = accountPolicyGateService.gateInfo;
			const approvedOrgsRaw = policyService.getPolicyValue(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME);
			summary.accountPolicyGate = gateInfo.reason ? `${gateInfo.state} (${gateInfo.reason})` : gateInfo.state;
			content += markdownTable(
				['Property', 'Value'],
				[
					['State', gateInfo.state],
					['Reason', gateInfo.reason ?? 'n/a'],
					[APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, approvedOrgsRaw !== undefined ? String(approvedOrgsRaw) : 'not set']
				]
			);
			content += '**Legend**\n\n';
			content += '- `inactive`: gate disabled (no approved orgs configured) — policies behave as account data dictates.\n';
			content += '- `satisfied`: gate active and approved — account policy values flow normally.\n';
			content += '- `restricted`: gate active and not satisfied — opted-in policies forced to their restricted value.\n';
			content += '  - `noAccount`: no default account signed in.\n';
			content += '  - `wrongProvider`: signed in with a non-GitHub provider.\n';
			content += '  - `orgNotApproved`: signed in but account is not a member of any approved organization.\n';
			content += '  - `policyNotResolved`: signed in to an approved org but account-side policy data has not yet been fetched.\n\n';
		} catch (error) {
			content += `*Error retrieving account policy gate info: ${markdownText(getErrorMessage(error))}*\n\n`;
		}

		content += '## Managed Settings\n\n';
		try {
			const policyData = defaultAccountService.policyData;
			const serverManagedSettings = policyData?.managedSettings ?? {};
			const nativeManagedSettings = nativeManagedSettingsService?.managedSettings ?? {};
			const fileManagedSettings = fileManagedSettingsService?.managedSettings ?? {};
			const fileRawManagedSettings = fileManagedSettingsService?.rawManagedSettings;

			const declaredDefinitions: Record<string, IManagedSettingPolicyDefinition> = {};
			for (const property of [...Object.values(configurationRegistry.getConfigurationProperties()), ...Object.values(configurationRegistry.getExcludedConfigurationProperties())]) {
				const declared = property.policy?.managedSettings;
				if (declared) {
					Object.assign(declaredDefinitions, declared);
				}
			}

			const pick = pickManagedSettings(nativeManagedSettings, serverManagedSettings, fileManagedSettings);
			const parseErrors: { stage: string; message: string }[] = [];
			const projectChannel = (channel: ManagedSettingsChannel, values: ManagedSettingsData): ManagedSettingsData => projectManagedSettings(
				values,
				declaredDefinitions,
				message => parseErrors.push({ stage: `${channel}: project`, message })
			);
			const channelContributes = (channel: ManagedSettingsChannel) => pick.activeSources.includes(channel);
			const nativeProjected = projectChannel('nativeMdm', nativeManagedSettings);
			const serverProjected = projectChannel('server', serverManagedSettings);
			const fileProjected = projectChannel('file', fileManagedSettings);
			const effective = projectManagedSettings(pick.values, declaredDefinitions, message => parseErrors.push({ stage: 'effective: project', message }));

			const rawResponse = defaultAccountService.managedSettingsRawResponse;
			if (isObject(rawResponse)) {
				adaptManagedSettings(rawResponse as IManagedSettingsResponse, message => parseErrors.push({ stage: 'adapt', message }));
			}
			if (fileRawManagedSettings) {
				normalizeManagedSettings(fileRawManagedSettings, message => parseErrors.push({ stage: 'file: normalize', message }));
			}

			for (const key of [COPILOT_ENABLED_PLUGINS_KEY, COPILOT_STRICT_MARKETPLACES_KEY, COPILOT_EXTRA_MARKETPLACES_KEY]) {
				const value = effective[key];
				if (typeof value !== 'string') {
					continue;
				}
				const jsonErrors: json.ParseError[] = [];
				json.parse(value, jsonErrors);
				for (const error of jsonErrors) {
					parseErrors.push({ stage: 'parse', message: `${key} @ offset ${error.offset}: ${getParseErrorMessage(error.error)}` });
				}
			}

			const activeSources = pick.activeSources.length > 0
				? pick.activeSources.map(managedSettingsSourceLabel).join(', ')
				: managedSettingsSourceLabel('none');
			const effectiveKeyCount = Object.keys(effective).length;
			summary.managedSettingsSources = activeSources;
			summary.effectiveManagedSettings = `${effectiveKeyCount} ${effectiveKeyCount === 1 ? 'key' : 'keys'}`;
			summary.managedSettingsIssues = `${parseErrors.length} ${parseErrors.length === 1 ? 'issue' : 'issues'}`;

			content += markdownTable(
				['Property', 'Value'],
				[
					['Active sources (precedence order)', activeSources],
					['Supplied keys', String(pick.resolutions.size)],
					['Effective VS Code policy keys', String(effectiveKeyCount)]
				]
			);
			content += '*Precedence is resolved per key: native MDM wins over the server endpoint, which wins over the file on disk. A key left unset by a higher channel is still filled in by a lower one.*\n\n';

			content += '### Effective Resolution\n\n';
			if (pick.resolutions.size > 0) {
				const resolutions = [...pick.resolutions.entries()].sort(([first], [second]) => first.localeCompare(second));
				content += markdownTable(
					['Key', 'Effective Value', 'Winning Source'],
					resolutions.map(([key, resolution]) => [
						key,
						formatDiagnosticValue(resolution.value),
						managedSettingsSourceShortLabel(resolution.source)
					])
				);

				const contributionRows = resolutions.flatMap(([key, resolution]) => resolution.contributions.map(contribution => [
					key,
					managedSettingsSourceShortLabel(contribution.channel),
					formatDiagnosticValue(contribution.value),
					contribution.channel === resolution.source ? 'Effective' : 'Overridden'
				]));
				content += markdownDetails(
					'Per-channel contributions',
					markdownTable(['Key', 'Source', 'Value', 'Status'], contributionRows)
				);
			} else {
				content += '*No managed-settings keys are supplied by any channel.*\n\n';
			}
			content += markdownDetails('Merged normalized bag', markdownJsonBlock(pick.values));
			content += markdownDetails('Effective VS Code policy bag', markdownJsonBlock(effective));

			content += `### Normalization and Parse Issues (${parseErrors.length})\n\n`;
			if (parseErrors.length > 0) {
				content += markdownTable(
					['Stage', 'Message'],
					parseErrors.map(({ stage, message }) => [stage, message])
				);
			} else {
				content += '*None.*\n\n';
			}

			content += '### Delivery Channel Details\n\n';
			content += '#### Native MDM\n\n';
			content += markdownTable(
				['Property', 'Value'],
				[
					['Available', nativeManagedSettingsService ? 'yes' : 'no'],
					['Contributes winning keys', channelContributes('nativeMdm') ? 'yes' : 'no']
				]
			);
			if (nativeManagedSettingsService) {
				content += '*The native policy watcher exposes only declared scalar keys, so its source values are already definition-scoped and canonical.*\n\n';
				content += managedSettingsPipeline('Source values (definition-scoped)', nativeManagedSettings, nativeManagedSettings, nativeProjected);
			}

			const fetchStatus = defaultAccountService.managedSettingsFetchStatus;
			const fetchedAt = defaultAccountService.managedSettingsFetchedAt;
			const clientIdentity = appendManagedSettingsClientIdentity('https://api.github.com/copilot_internal/managed_settings', productService);
			const compatibilityError = defaultAccountService.managedSettingsCompatibilityError;
			content += '#### GitHub Server API\n\n';
			content += markdownTable(
				['Property', 'Value'],
				[
					['Endpoint', '/copilot_internal/managed_settings'],
					['Last fetch', fetchStatus === null ? 'never' : `${fetchStatus}${fetchedAt ? ` at ${new Date(fetchedAt).toLocaleString()}` : ''}`],
					['Client identity', new URL(clientIdentity).search.replace(/^\?/, '')],
					['Compatibility', compatibilityError ? `update required (${compatibilityError.clientVersion ?? '?'} → ${compatibilityError.minimumClientVersion ?? '?'})` : 'compatible or not evaluated'],
					['Contributes winning keys', channelContributes('server') ? 'yes' : 'no']
				]
			);
			content += managedSettingsPipeline(
				'Raw response (last successful fetch)',
				isObject(rawResponse) ? rawResponse : undefined,
				serverManagedSettings,
				serverProjected,
				'No successful managed-settings response has been captured.'
			);

			content += '#### File (managed-settings.json)\n\n';
			content += markdownTable(
				['Property', 'Value'],
				[
					['Available', fileManagedSettingsService ? 'yes' : 'no'],
					['Contributes winning keys', channelContributes('file') ? 'yes' : 'no']
				]
			);
			if (fileManagedSettingsService) {
				content += managedSettingsPipeline('Raw parsed file', fileRawManagedSettings, fileManagedSettings, fileProjected);
			}

			content += markdownDetails(
				'VS Code managed-settings schema',
				'*Only keys declared here can reach VS Code policy callbacks. Runtime-owned keys may still be enforced by the Copilot runtime even when absent from the projections above.*\n\n' +
				markdownJsonBlock(declaredDefinitions)
			);

			content += '### Agent Runtime Resolution\n\n';
			content += '*Resolved independently by each provider through its own SDK/runtime. This may include runtime-owned keys that VS Code does not declare as configuration policies.*\n\n';
			if (!agentHostEnablementService.enabled.get()) {
				summary.agentRuntime = 'Agent Host disabled';
				content += '*Agent Host is disabled; runtime managed-settings diagnostics were not queried.*\n\n';
			} else {
				try {
					const runtimeDiagnostics = await raceTimeout(agentHostService.getManagedSettingsDiagnostics(), AGENT_RUNTIME_DIAGNOSTICS_TIMEOUT);
					if (!runtimeDiagnostics) {
						summary.agentRuntime = 'Timed out';
						content += '*The Agent Host did not return provider diagnostics within 6 seconds. The report continued without a runtime snapshot; check the Agent Host log for a stalled provider.*\n\n';
					} else if (runtimeDiagnostics.length === 0) {
						summary.agentRuntime = 'No provider diagnostics';
						content += '*No agent provider exposes managed-settings diagnostics.*\n\n';
					} else {
						const failedProviderCount = runtimeDiagnostics.filter(diagnostic => diagnostic.error).length;
						summary.agentRuntime = `${runtimeDiagnostics.length} ${runtimeDiagnostics.length === 1 ? 'provider' : 'providers'}, ${failedProviderCount} failed`;
						for (const diagnostic of runtimeDiagnostics) {
							content += `#### ${markdownText(diagnostic.provider)}\n\n`;
							if (diagnostic.error) {
								content += `*Probe failed: ${markdownText(diagnostic.error)}*\n\n`;
							} else {
								content += markdownDetails('Resolved settings snapshot', markdownJsonBlock(diagnostic.snapshot));
							}
						}
					}
				} catch (error) {
					const message = getErrorMessage(error);
					summary.agentRuntime = `Unavailable (${message})`;
					content += `*Agent runtime diagnostics unavailable: ${markdownText(message)}*\n\n`;
				}
			}
		} catch (error) {
			content += `*Error rendering managed settings diagnostics: ${markdownText(getErrorMessage(error))}*\n\n`;
		}

		content += '## Policy-Controlled Settings\n\n';

		const policyConfigurations = configurationRegistry.getPolicyConfigurations();
		const policyReferenceConfigurations = configurationRegistry.getPolicyReferenceConfigurations();
		const configurationProperties = configurationRegistry.getConfigurationProperties();
		const excludedProperties = configurationRegistry.getExcludedConfigurationProperties();

		if (policyConfigurations.size > 0 || policyReferenceConfigurations.size > 0) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const appliedPolicy: Array<{ name: string; key: string; property: any; inspection: any }> = [];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const notAppliedPolicy: Array<{ name: string; key: string; property: any; inspection: any }> = [];

			const collectPolicySetting = (policyName: string, settingKey: string) => {
				const property = configurationProperties[settingKey] ?? excludedProperties[settingKey];
				if (property) {
					const inspectValue = configurationService.inspect(settingKey);
					const settingInfo = {
						name: policyName,
						key: settingKey,
						property,
						inspection: inspectValue
					};

					if (inspectValue.policyValue !== undefined) {
						appliedPolicy.push(settingInfo);
					} else {
						notAppliedPolicy.push(settingInfo);
					}
				}
			};

			for (const [policyName, settingKey] of policyConfigurations) {
				collectPolicySetting(policyName, settingKey);
			}
			for (const [policyName, settingKeys] of policyReferenceConfigurations) {
				for (const settingKey of settingKeys) {
					collectPolicySetting(policyName, settingKey);
				}
			}

			const getPolicySource = (policyName: string): string => policyValueSourceLabel(policyService.getPolicyValueSource(policyName));

			content += '### Applied Policy\n\n';
			appliedPolicy.sort((a, b) => getPolicySource(a.name).localeCompare(getPolicySource(b.name)) || a.name.localeCompare(b.name));
			notAppliedPolicy.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
			summary.policyControlledSettings = `${appliedPolicy.length} applied, ${notAppliedPolicy.length} not applied`;
			if (appliedPolicy.length > 0) {
				content += markdownTable(
					['Setting Key', 'Policy Name', 'Policy Source'],
					appliedPolicy.map(setting => [
						setting.key,
						setting.name,
						getPolicySource(setting.name)
					])
				);

				let policyDetails = '';
				for (const setting of appliedPolicy) {
					const managedSettingsKeys = setting.property.policy?.managedSettings ? Object.keys(setting.property.policy.managedSettings).join(', ') : '';
					policyDetails += `**${markdownText(setting.key)}**\n\n`;
					policyDetails += markdownTable(
						['Property', 'Value'],
						[
							['Policy name', setting.name],
							['Policy source', getPolicySource(setting.name)],
							['Managed settings', managedSettingsKeys || 'n/a'],
							['Default value', formatDiagnosticValue(setting.property.default)],
							['Current value', formatDiagnosticValue(setting.inspection.value)],
							['Policy value', formatDiagnosticValue(setting.inspection.policyValue)]
						]
					);
				}
				content += markdownDetails('Applied policy values and configuration details', policyDetails);
			} else {
				content += '*No settings are currently controlled by policies*\n\n';
			}

			content += '### Non-applied Policy\n\n';
			if (notAppliedPolicy.length > 0) {
				content += markdownTable(
					['Setting Key', 'Policy Name'],
					notAppliedPolicy.map(setting => [setting.key, setting.name])
				);
			} else {
				content += '*All policy-controllable settings are currently being enforced*\n\n';
			}
		} else {
			summary.policyControlledSettings = 'No policy-controlled settings found';
			content += '*No policy-controlled settings found*\n\n';
		}

		content += '## Chat Harness Enforcement\n\n';
		try {
			const sandboxEnforced = agentHostEnablementService.managedSandboxEnforced.get();
			const virtualWorkspace = isVirtualWorkspace(workspaceContextService.getWorkspace());
			const agentHostEnabled = agentHostEnablementService.enabled.get();

			if (!sandboxEnforced) {
				summary.chatHarnessEnforcement = 'Not enforced';
			} else if (virtualWorkspace) {
				summary.chatHarnessEnforcement = 'Mandated, not applied (virtual workspace)';
			} else if (!agentHostEnabled) {
				summary.chatHarnessEnforcement = 'Mandated, not applied (Agent Host disabled)';
			} else {
				summary.chatHarnessEnforcement = 'Local harness hidden, new chats use the Agent Host Copilot SDK';
			}

			content += `**Effective decision:** ${summary.chatHarnessEnforcement}.\n\n`;
		} catch (error) {
			const message = getErrorMessage(error);
			summary.chatHarnessEnforcement = `Unavailable (${message})`;
			content += `*Error resolving chat harness enforcement: ${markdownText(message)}*\n\n`;
		}

		// Authentication diagnostics
		content += '## Authentication Information\n\n';
		try {
			const providerIds = authenticationService.getProviderIds();

			if (providerIds.length > 0) {
				content += '### Authentication Providers\n\n';
				const providerRows: string[][] = [];
				let sessionDetails = '';
				for (const providerId of providerIds) {
					try {
						const sessions = await authenticationService.getSessions(providerId);
						const accounts = sessions.map(session => session.account);
						const uniqueAccounts = Array.from(new Set(accounts.map(account => account.label)));
						providerRows.push([providerId, String(sessions.length), uniqueAccounts.join(', ') || 'None']);
						if (sessions.length > 0) {
							sessionDetails += `**${markdownText(providerId)}**\n\n`;
							const sessionRows: string[][] = [];
							for (const session of sessions) {
								const accountName = session.account.label;
								const scopes = session.scopes.join(', ') || 'Default';
								try {
									const allowedExtensions = authenticationAccessService.readAllowedExtensions(providerId, accountName);
									const extensionNames = allowedExtensions
										.filter(ext => ext.allowed !== false)
										.map(ext => `${ext.name}${ext.trusted ? ' (trusted)' : ''}`)
										.join(', ') || 'None';

									sessionRows.push([accountName, scopes, extensionNames]);
								} catch (error) {
									sessionRows.push([accountName, scopes, `Error: ${getErrorMessage(error)}`]);
								}
							}
							sessionDetails += markdownTable(['Account', 'Scopes', 'Extensions with Access'], sessionRows);
						}
					} catch (error) {
						const message = getErrorMessage(error);
						providerRows.push([providerId, 'Error', message]);
						sessionDetails += `**${markdownText(providerId)}**\n\n*Error retrieving sessions: ${markdownText(message)}*\n\n`;
					}
				}
				content += markdownTable(['Provider ID', 'Sessions', 'Accounts'], providerRows);
				if (sessionDetails) {
					content += markdownDetails('Detailed session information', sessionDetails);
				}
			} else {
				content += '*No authentication providers found*\n\n';
			}
		} catch (error) {
			content += `*Error retrieving authentication information: ${markdownText(getErrorMessage(error))}*\n\n`;
		}

		const report = '# VS Code Policy Diagnostics\n\n' +
			'*WARNING: This file may contain sensitive information.*\n\n' +
			'## Summary\n\n' +
			markdownTable(
				['Diagnostic', 'Result'],
				[
					['Account policy gate', summary.accountPolicyGate],
					['Managed-settings sources', summary.managedSettingsSources],
					['Effective managed settings', summary.effectiveManagedSettings],
					['Managed-settings issues', summary.managedSettingsIssues],
					['Agent Runtime', summary.agentRuntime],
					['Chat harness enforcement', summary.chatHarnessEnforcement],
					['Policy-controlled settings', summary.policyControlledSettings]
				]
			) +
			content;

		const resource = URI.from({
			scheme: Schemas.untitled,
			path: localize('policyDiagnostics.editorTitle', "Policy Diagnostics"),
			query: generateUuid()
		});
		const editorPane = await editorService.openEditor({
			resource,
			contents: report,
			languageId: 'markdown',
			options: { pinned: true }
		});
		if (!editorPane) {
			notificationService.warn(localize(
				'policyDiagnostics.previewMissingResource',
				"Policy diagnostics opened as Markdown source because the rendered preview could not be initialized."
			));
			return;
		}

		try {
			await commandService.executeCommand('markdown.reopenAsPreview');
		} catch (error) {
			notificationService.warn(localize(
				'policyDiagnostics.previewError',
				"Policy diagnostics opened as Markdown source because the rendered preview could not be opened: {0}",
				getErrorMessage(error)
			));
		}
	}
}

class SyncAccountPolicyAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.syncAccountPolicy',
			title: localize2('syncAccountPolicy', 'Sync Account Policy'),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const defaultAccountService = accessor.get(IDefaultAccountService);
		const dialogService = accessor.get(IDialogService);
		const logService = accessor.get(ILogService);

		try {
			logService.info('[DefaultAccount] Manually syncing account policy');
			await defaultAccountService.refresh({ forceRefresh: true });
			await dialogService.info(localize('syncAccountPolicy.success', "Account policy has been synced."));
		} catch (error) {
			logService.error('[DefaultAccount] Failed to sync account policy', error);
			await dialogService.error(
				localize('syncAccountPolicy.error', "Failed to sync account policy."),
				error instanceof Error ? error.message : String(error)
			);
		}
	}
}

// --- Actions Registration
registerAction2(InspectContextKeysAction);
registerAction2(ToggleScreencastModeAction);
registerAction2(LogStorageAction);
registerAction2(LogWorkingCopiesAction);
registerAction2(RemoveLargeStorageEntriesAction);
registerAction2(PolicyDiagnosticsAction);
registerAction2(SyncAccountPolicyAction);
if (!product.commit) {
	registerAction2(StartTrackDisposables);
	registerAction2(SnapshotTrackedDisposables);
	registerAction2(StopTrackDisposables);
}

// --- Configuration

// Screen Cast Mode
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'screencastMode',
	order: 9,
	title: localize('screencastModeConfigurationTitle', "Screencast Mode"),
	type: 'object',
	properties: {
		'screencastMode.verticalOffset': {
			type: 'number',
			default: 20,
			minimum: 0,
			maximum: 90,
			description: localize('screencastMode.location.verticalPosition', "Controls the vertical offset of the screencast mode overlay from the bottom as a percentage of the workbench height.")
		},
		'screencastMode.fontSize': {
			type: 'number',
			default: 56,
			minimum: 20,
			maximum: 100,
			description: localize('screencastMode.fontSize', "Controls the font size (in pixels) of the screencast mode keyboard.")
		},
		'screencastMode.keyboardOptions': {
			type: 'object',
			description: localize('screencastMode.keyboardOptions.description', "Options for customizing the keyboard overlay in screencast mode."),
			properties: {
				'showKeys': {
					type: 'boolean',
					default: true,
					description: localize('screencastMode.keyboardOptions.showKeys', "Show raw keys.")
				},
				'showKeybindings': {
					type: 'boolean',
					default: true,
					description: localize('screencastMode.keyboardOptions.showKeybindings', "Show keyboard shortcuts.")
				},
				'showCommands': {
					type: 'boolean',
					default: true,
					description: localize('screencastMode.keyboardOptions.showCommands', "Show command names.")
				},
				'showCommandGroups': {
					type: 'boolean',
					default: false,
					description: localize('screencastMode.keyboardOptions.showCommandGroups', "Show command group names, when commands are also shown.")
				},
				'showSingleEditorCursorMoves': {
					type: 'boolean',
					default: true,
					description: localize('screencastMode.keyboardOptions.showSingleEditorCursorMoves', "Show single editor cursor move commands.")
				}
			},
			default: {
				'showKeys': true,
				'showKeybindings': true,
				'showCommands': true,
				'showCommandGroups': false,
				'showSingleEditorCursorMoves': true
			},
			additionalProperties: false
		},
		'screencastMode.keyboardOverlayTimeout': {
			type: 'number',
			default: 800,
			minimum: 500,
			maximum: 5000,
			description: localize('screencastMode.keyboardOverlayTimeout', "Controls how long (in milliseconds) the keyboard overlay is shown in screencast mode.")
		},
		'screencastMode.mouseIndicatorColor': {
			type: 'string',
			format: 'color-hex',
			default: '#FF0000',
			description: localize('screencastMode.mouseIndicatorColor', "Controls the color in hex (#RGB, #RGBA, #RRGGBB or #RRGGBBAA) of the mouse indicator in screencast mode.")
		},
		'screencastMode.mouseIndicatorSize': {
			type: 'number',
			default: 20,
			minimum: 20,
			maximum: 100,
			description: localize('screencastMode.mouseIndicatorSize', "Controls the size (in pixels) of the mouse indicator in screencast mode.")
		},
	}
});
