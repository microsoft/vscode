/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { IExtHostWorkspaceProvider } from 'vs/workbench/api/common/extHostWorkspace';
import { InputBox, InputBoxOptions, InputBoxValidationMessage, QuickInput, QuickInputButton, QuickPick, QuickPickItem, QuickPickItemButtonEvent, QuickPickOptions, WorkspaceFolder, WorkspaceFolderPickOptions } from 'vscode';
import { ExtHostQuickOpenShape, IMainContext, MainContext, TransferQuickInput, TransferQuickInputButton, TransferQuickPickItemOrSeparator } from './extHost.protocol';
import { URI } from 'vs/base/common/uri';
import { ThemeIcon, QuickInputButtons, QuickPickItemKind, InputBoxValidationSeverity } from 'vs/workbench/api/common/extHostTypes';
import { isCancellationError } from 'vs/base/common/errors';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { coalesce } from 'vs/base/common/arrays';
import Severity from 'vs/base/common/severity';
import { ThemeIcon as ThemeIconUtils } from 'vs/base/common/themables';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { MarkdownString } from 'vs/workbench/api/common/extHostTypeConverters';

export type Item = string | QuickPickItem;

export interface ExtHostQuickOpen {
	showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: QuickPickItem[] | Promise<QuickPickItem[]>, options: QuickPickOptions & { canPickMany: true }, token?: CancellationToken): Promise<QuickPickItem[] | undefined>;
	showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: string[] | Promise<string[]>, options?: QuickPickOptions, token?: CancellationToken): Promise<string | undefined>;
	showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: QuickPickItem[] | Promise<QuickPickItem[]>, options?: QuickPickOptions, token?: CancellationToken): Promise<QuickPickItem | undefined>;
	showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: Item[] | Promise<Item[]>, options?: QuickPickOptions, token?: CancellationToken): Promise<Item | Item[] | undefined>;

	showInput(options?: InputBoxOptions, token?: CancellationToken): Promise<string | undefined>;

	showWorkspaceFolderPick(options?: WorkspaceFolderPickOptions, token?: CancellationToken): Promise<WorkspaceFolder | undefined>;

	createQuickPick<T extends QuickPickItem>(extension: IExtensionDescription): QuickPick<T>;

	createInputBox(extension: IExtensionDescription): InputBox;
}

export function createExtHostQuickOpen(mainContext: IMainContext, workspace: IExtHostWorkspaceProvider, commands: ExtHostCommands): ExtHostQuickOpenShape & ExtHostQuickOpen {
	const proxy = mainContext.getProxy(MainContext.MainThreadQuickOpen);

	class ExtHostQuickOpenImpl implements ExtHostQuickOpenShape {

		private _workspace: IExtHostWorkspaceProvider;
		private _commands: ExtHostCommands;

		private _onDidSelectItem?: (handle: number) => void;
		private _validateInput?: (input: string) => string | InputBoxValidationMessage | undefined | null | Thenable<string | InputBoxValidationMessage | undefined | null>;

		private _sessions = new Map<number, ExtHostQuickInput>();

		private _instances = 0;

		constructor(workspace: IExtHostWorkspaceProvider, commands: ExtHostCommands) {
			this._workspace = workspace;
			this._commands = commands;
		}

		showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: QuickPickItem[] | Promise<QuickPickItem[]>, options: QuickPickOptions & { canPickMany: true }, token?: CancellationToken): Promise<QuickPickItem[] | undefined>;
		showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: string[] | Promise<string[]>, options?: QuickPickOptions, token?: CancellationToken): Promise<string | undefined>;
		showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: QuickPickItem[] | Promise<QuickPickItem[]>, options?: QuickPickOptions, token?: CancellationToken): Promise<QuickPickItem | undefined>;
		showQuickPick(extension: IExtensionDescription, itemsOrItemsPromise: Item[] | Promise<Item[]>, options?: QuickPickOptions, token: CancellationToken = CancellationToken.None): Promise<Item | Item[] | undefined> {
			// clear state from last invocation
			this._onDidSelectItem = undefined;

			const itemsPromise = <Promise<Item[]>>Promise.resolve(itemsOrItemsPromise);

			const instance = ++this._instances;

			const quickPickWidget = proxy.$show(instance, {
				title: options?.title,
				placeHolder: options?.placeHolder,
				matchOnDescription: options?.matchOnDescription,
				matchOnDetail: options?.matchOnDetail,
				ignoreFocusLost: options?.ignoreFocusOut,
				canPickMany: options?.canPickMany,
			}, token);

			const widgetClosedMarker = {};
			const widgetClosedPromise = quickPickWidget.then(() => widgetClosedMarker);

			return Promise.race([widgetClosedPromise, itemsPromise]).then(result => {
				if (result === widgetClosedMarker) {
					return undefined;
				}

				const allowedTooltips = isProposedApiEnabled(extension, 'quickPickItemTooltip');

				return itemsPromise.then(items => {

					const pickItems: TransferQuickPickItemOrSeparator[] = [];
					for (let handle = 0; handle < items.length; handle++) {
						const item = items[handle];
						if (typeof item === 'string') {
							pickItems.push({ label: item, handle });
						} else if (item.kind === QuickPickItemKind.Separator) {
							pickItems.push({ type: 'separator', label: item.label });
						} else {
							if (item.tooltip && !allowedTooltips) {
								console.warn(`Extension '${extension.identifier.value}' uses a tooltip which is proposed API that is only available when running out of dev or with the following command line switch: --enable-proposed-api ${extension.identifier.value}`);
							}

							const icon = (item.iconPath) ? getIconPathOrClass(item.iconPath) : undefined;
							pickItems.push({
								label: item.label,
								iconPath: icon?.iconPath,
								iconClass: icon?.iconClass,
								description: item.description,
								detail: item.detail,
								picked: item.picked,
								alwaysShow: item.alwaysShow,
								tooltip: allowedTooltips ? MarkdownString.fromStrict(item.tooltip) : undefined,
								handle
							});
						}
					}

					// handle selection changes
					if (options && typeof options.onDidSelectItem === 'function') {
						this._onDidSelectItem = (handle) => {
							options.onDidSelectItem!(items[handle]);
						};
					}

					// show items
					proxy.$setItems(instance, pickItems);

					return quickPickWidget.then(handle => {
						if (typeof handle === 'number') {
							return items[handle];
						} else if (Array.isArray(handle)) {
							return handle.map(h => items[h]);
						}
						return undefined;
					});
				});
			}).then(undefined, err => {
				if (isCancellationError(err)) {
					return undefined;
				}

				proxy.$setError(instance, err);

				return Promise.reject(err);
			});
		}

		$onItemSelected(handle: number): void {
			this._onDidSelectItem?.(handle);
		}

		// ---- input

		showInput(options?: InputBoxOptions, token: CancellationToken = CancellationToken.None): Promise<string | undefined> {

			// global validate fn used in callback below
			this._validateInput = options?.validateInput;

			return proxy.$input(options, typeof this._validateInput === 'function', token)
				.then(undefined, err => {
					if (isCancellationError(err)) {
						return undefined;
					}

					return Promise.reject(err);
				});
		}

		async $validateInput(input: string): Promise<string | { content: string; severity: Severity } | null | undefined> {
			if (!this._validateInput) {
				return;
			}

			const result = await this._validateInput(input);
			if (!result || typeof result === 'string') {
				return result;
			}

			let severity: Severity;
			switch (result.severity) {
				case InputBoxValidationSeverity.Info:
					severity = Severity.Info;
					break;
				case InputBoxValidationSeverity.Warning:
					severity = Severity.Warning;
					break;
				case InputBoxValidationSeverity.Error:
					severity = Severity.Error;
					break;
				default:
					severity = result.message ? Severity.Error : Severity.Ignore;
					break;
			}

			return {
				content: result.message,
				severity
			};
		}

		// ---- workspace folder picker

		async showWorkspaceFolderPick(options?: WorkspaceFolderPickOptions, token = CancellationToken.None): Promise<WorkspaceFolder | undefined> {
			const selectedFolder = await this._commands.executeCommand<WorkspaceFolder>('_workbench.pickWorkspaceFolder', [options]);
			if (!selectedFolder) {
				return undefined;
			}
			const workspaceFolders = await this._workspace.getWorkspaceFolders2();
			if (!workspaceFolders) {
				return undefined;
			}
			return workspaceFolders.find(folder => folder.uri.toString() === selectedFolder.uri.toString());
		}

		// ---- QuickInput

		createQuickPick<T extends QuickPickItem>(extension: IExtensionDescription): QuickPick<T> {
			const session: ExtHostQuickPick<T> = new ExtHostQuickPick(extension, () => this._sessions.delete(session._id));
			this._sessions.set(session._id, session);
			return session;
		}

		createInputBox(extension: IExtensionDescription): InputBox {
			const session: ExtHostInputBox = new ExtHostInputBox(extension, () => this._sessions.delete(session._id));
			this._sessions.set(session._id, session);
			return session;
		}

		$onDidChangeValue(sessionId: number, value: string): void {
			const session = this._sessions.get(sessionId);
			session?._fireDidChangeValue(value);
		}

		$onDidAccept(sessionId: number): void {
			const session = this._sessions.get(sessionId);
			session?._fireDidAccept();
		}

		$onDidChangeActive(sessionId: number, handles: number[]): void {
			const session = this._sessions.get(sessionId);
			if (session instanceof ExtHostQuickPick) {
				session._fireDidChangeActive(handles);
			}
		}

		$onDidChangeSelection(sessionId: number, handles: number[]): void {
			const session = this._sessions.get(sessionId);
			if (session instanceof ExtHostQuickPick) {
				session._fireDidChangeSelection(handles);
			}
		}

		$onDidTriggerButton(sessionId: number, handle: number): void {
			const session = this._sessions.get(sessionId);
			session?._fireDidTriggerButton(handle);
		}

		$onDidTriggerItemButton(sessionId: number, itemHandle: number, buttonHandle: number): void {
			const session = this._sessions.get(sessionId);
			if (session instanceof ExtHostQuickPick) {
				session._fireDidTriggerItemButton(itemHandle, buttonHandle);
			}
		}

		$onDidHide(sessionId: number): void {
			const session = this._sessions.get(sessionId);
			session?._fireDidHide();
		}
	}

	class ExtHostQuickInput implements QuickInput {

		private static _nextId = 1;
		_id = ExtHostQuickPick._nextId++;

		private _title: string | undefined;
		private _steps: number | undefined;
		private _totalSteps: number | undefined;
		private _visible = false;
		private _expectingHide = false;
		private _enabled = true;
		private _busy = false;
		private _ignoreFocusOut = true;
		private _value = '';
		private _placeholder: string | undefined;
		private _buttons: QuickInputButton[] = [];
		private _handlesToButtons = new Map<number, QuickInputButton>();
		private readonly _onDidAcceptEmitter = new Emitter<void>();
		private readonly _onDidChangeValueEmitter = new Emitter<string>();
		private readonly _onDidTriggerButtonEmitter = new Emitter<QuickInputButton>();
		private readonly _onDidHideEmitter = new Emitter<void>();
		private _updateTimeout: any;
		private _pendingUpdate: TransferQuickInput = { id: this._id };

		private _disposed = false;
		protected _disposables: IDisposable[] = [
			this._onDidTriggerButtonEmitter,
			this._onDidHideEmitter,
			this._onDidAcceptEmitter,
			this._onDidChangeValueEmitter
		];

		constructor(protected _extensionId: ExtensionIdentifier, private _onDidDispose: () => void) {
		}

		get title() {
			return this._title;
		}

		set title(title: string | undefined) {
			this._title = title;
			this.update({ title });
		}

		get step() {
			return this._steps;
		}

		set step(step: number | undefined) {
			this._steps = step;
			this.update({ step });
		}

		get totalSteps() {
			return this._totalSteps;
		}

		set totalSteps(totalSteps: number | undefined) {
			this._totalSteps = totalSteps;
			this.update({ totalSteps });
		}

		get enabled() {
			return this._enabled;
		}

		set enabled(enabled: boolean) {
			this._enabled = enabled;
			this.update({ enabled });
		}

		get busy() {
			return this._busy;
		}

		set busy(busy: boolean) {
			this._busy = busy;
			this.update({ busy });
		}

		get ignoreFocusOut() {
			return this._ignoreFocusOut;
		}

		set ignoreFocusOut(ignoreFocusOut: boolean) {
			this._ignoreFocusOut = ignoreFocusOut;
			this.update({ ignoreFocusOut });
		}

		get value() {
			return this._value;
		}

		set value(value: string) {
			this._value = value;
			this.update({ value });
		}

		get placeholder() {
			return this._placeholder;
		}

		set placeholder(placeholder: string | undefined) {
			this._placeholder = placeholder;
			this.update({ placeholder });
		}

		onDidChangeValue = this._onDidChangeValueEmitter.event;

		onDidAccept = this._onDidAcceptEmitter.event;

		get buttons() {
			return this._buttons;
		}

		set buttons(buttons: QuickInputButton[]) {
			this._buttons = buttons.slice();
			this._handlesToButtons.clear();
			buttons.forEach((button, i) => {
				const handle = button === QuickInputButtons.Back ? -1 : i;
				this._handlesToButtons.set(handle, button);
			});
			this.update({
				buttons: buttons.map<TransferQuickInputButton>((button, i) => {
					return {
						...getIconPathOrClass(button.iconPath),
						tooltip: button.tooltip,
						handle: button === QuickInputButtons.Back ? -1 : i,
					};
				})
			});
		}

		onDidTriggerButton = this._onDidTriggerButtonEmitter.event;

		show(): void {
			this._visible = true;
			this._expectingHide = true;
			this.update({ visible: true });
		}

		hide(): void {
			this._visible = false;
			this.update({ visible: false });
		}

		onDidHide = this._onDidHideEmitter.event;

		_fireDidAccept() {
			this._onDidAcceptEmitter.fire();
		}

		_fireDidChangeValue(value: string) {
			this._value = value;
			this._onDidChangeValueEmitter.fire(value);
		}

		_fireDidTriggerButton(handle: number) {
			const button = this._handlesToButtons.get(handle);
			if (button) {
				this._onDidTriggerButtonEmitter.fire(button);
			}
		}

		_fireDidHide() {
			if (this._expectingHide) {
				// if this._visible is true, it means that .show() was called between
				// .hide() and .onDidHide. To ensure the correct number of onDidHide events
				// are emitted, we set this._expectingHide to this value so that
				// the next time .hide() is called, we can emit the event again.
				// Example:
				// .show() -> .hide() -> .show() -> .hide() should emit 2 onDidHide events.
				// .show() -> .hide() -> .hide() should emit 1 onDidHide event.
				// Fixes #135747
				this._expectingHide = this._visible;
				this._onDidHideEmitter.fire();
			}
		}

		dispose(): void {
			if (this._disposed) {
				return;
			}
			this._disposed = true;
			this._fireDidHide();
			this._disposables = dispose(this._disposables);
			if (this._updateTimeout) {
				clearTimeout(this._updateTimeout);
				this._updateTimeout = undefined;
			}
			this._onDidDispose();
			proxy.$dispose(this._id);
		}

		protected update(properties: Record<string, any>): void {
			if (this._disposed) {
				return;
			}
			for (const key of Object.keys(properties)) {
				const value = properties[key];
				this._pendingUpdate[key] = value === undefined ? null : value;
			}

			if ('visible' in this._pendingUpdate) {
				if (this._updateTimeout) {
					clearTimeout(this._updateTimeout);
					this._updateTimeout = undefined;
				}
				this.dispatchUpdate();
			} else if (this._visible && !this._updateTimeout) {
				// Defer the update so that multiple changes to setters dont cause a redraw each
				this._updateTimeout = setTimeout(() => {
					this._updateTimeout = undefined;
					this.dispatchUpdate();
				}, 0);
			}
		}

		private dispatchUpdate() {
			proxy.$createOrUpdate(this._pendingUpdate);
			this._pendingUpdate = { id: this._id };
		}
	}

	function getIconUris(iconPath: QuickInputButton['iconPath']): { dark: URI; light?: URI } | { id: string } {
		if (iconPath instanceof ThemeIcon) {
			return { id: iconPath.id };
		}
		const dark = getDarkIconUri(iconPath as URI | { light: URI; dark: URI });
		const light = getLightIconUri(iconPath as URI | { light: URI; dark: URI });
		// Tolerate strings: https://github.com/microsoft/vscode/issues/110432#issuecomment-726144556
		return {
			dark: typeof dark === 'string' ? URI.file(dark) : dark,
			light: typeof light === 'string' ? URI.file(light) : light
		};
	}

	function getLightIconUri(iconPath: URI | { light: URI; dark: URI }) {
		return typeof iconPath === 'object' && 'light' in iconPath ? iconPath.light : iconPath;
	}

	function getDarkIconUri(iconPath: URI | { light: URI; dark: URI }) {
		return typeof iconPath === 'object' && 'dark' in iconPath ? iconPath.dark : iconPath;
	}

	function getIconPathOrClass(icon: QuickInputButton['iconPath']) {
		const iconPathOrIconClass = getIconUris(icon);
		let iconPath: { dark: URI; light?: URI | undefined } | undefined;
		let iconClass: string | undefined;
		if ('id' in iconPathOrIconClass) {
			iconClass = ThemeIconUtils.asClassName(iconPathOrIconClass);
		} else {
			iconPath = iconPathOrIconClass;
		}

		return {
			iconPath,
			iconClass
		};
	}

	class ExtHostQuickPick<T extends QuickPickItem> extends ExtHostQuickInput implements QuickPick<T> {

		private _items: T[] = [];
		private _handlesToItems = new Map<number, T>();
		private _itemsToHandles = new Map<T, number>();
		private _canSelectMany = false;
		private _matchOnDescription = true;
		private _matchOnDetail = true;
		private _sortByLabel = true;
		private _keepScrollPosition = false;
		private _activeItems: T[] = [];
		private readonly _onDidChangeActiveEmitter = new Emitter<T[]>();
		private _selectedItems: T[] = [];
		private readonly _onDidChangeSelectionEmitter = new Emitter<T[]>();
		private readonly _onDidTriggerItemButtonEmitter = new Emitter<QuickPickItemButtonEvent<T>>();

		constructor(private extension: IExtensionDescription, onDispose: () => void) {
			super(extension.identifier, onDispose);
			this._disposables.push(
				this._onDidChangeActiveEmitter,
				this._onDidChangeSelectionEmitter,
				this._onDidTriggerItemButtonEmitter
			);
			this.update({ type: 'quickPick' });
		}

		get items() {
			return this._items;
		}

		set items(items: T[]) {
			this._items = items.slice();
			this._handlesToItems.clear();
			this._itemsToHandles.clear();
			items.forEach((item, i) => {
				this._handlesToItems.set(i, item);
				this._itemsToHandles.set(item, i);
			});

			const allowedTooltips = isProposedApiEnabled(this.extension, 'quickPickItemTooltip');

			const pickItems: TransferQuickPickItemOrSeparator[] = [];
			for (let handle = 0; handle < items.length; handle++) {
				const item = items[handle];
				if (item.kind === QuickPickItemKind.Separator) {
					pickItems.push({ type: 'separator', label: item.label });
				} else {
					if (item.tooltip && !allowedTooltips) {
						console.warn(`Extension '${this.extension.identifier.value}' uses a tooltip which is proposed API that is only available when running out of dev or with the following command line switch: --enable-proposed-api ${this.extension.identifier.value}`);
					}

					const icon = (item.iconPath) ? getIconPathOrClass(item.iconPath) : undefined;
					pickItems.push({
						handle,
						label: item.label,
						iconPath: icon?.iconPath,
						iconClass: icon?.iconClass,
						description: item.description,
						detail: item.detail,
						picked: item.picked,
						alwaysShow: item.alwaysShow,
						tooltip: allowedTooltips ? MarkdownString.fromStrict(item.tooltip) : undefined,
						buttons: item.buttons?.map<TransferQuickInputButton>((button, i) => {
							return {
								...getIconPathOrClass(button.iconPath),
								tooltip: button.tooltip,
								handle: i
							};
						}),
					});
				}
			}

			this.update({
				items: pickItems,
			});
		}

		get canSelectMany() {
			return this._canSelectMany;
		}

		set canSelectMany(canSelectMany: boolean) {
			this._canSelectMany = canSelectMany;
			this.update({ canSelectMany });
		}

		get matchOnDescription() {
			return this._matchOnDescription;
		}

		set matchOnDescription(matchOnDescription: boolean) {
			this._matchOnDescription = matchOnDescription;
			this.update({ matchOnDescription });
		}

		get matchOnDetail() {
			return this._matchOnDetail;
		}

		set matchOnDetail(matchOnDetail: boolean) {
			this._matchOnDetail = matchOnDetail;
			this.update({ matchOnDetail });
		}

		get sortByLabel() {
			return this._sortByLabel;
		}

		set sortByLabel(sortByLabel: boolean) {
			this._sortByLabel = sortByLabel;
			this.update({ sortByLabel });
		}

		get keepScrollPosition() {
			return this._keepScrollPosition;
		}

		set keepScrollPosition(keepScrollPosition: boolean) {
			this._keepScrollPosition = keepScrollPosition;
			this.update({ keepScrollPosition });
		}

		get activeItems() {
			return this._activeItems;
		}

		set activeItems(activeItems: T[]) {
			this._activeItems = activeItems.filter(item => this._itemsToHandles.has(item));
			this.update({ activeItems: this._activeItems.map(item => this._itemsToHandles.get(item)) });
		}

		onDidChangeActive = this._onDidChangeActiveEmitter.event;

		get selectedItems() {
			return this._selectedItems;
		}

		set selectedItems(selectedItems: T[]) {
			this._selectedItems = selectedItems.filter(item => this._itemsToHandles.has(item));
			this.update({ selectedItems: this._selectedItems.map(item => this._itemsToHandles.get(item)) });
		}

		onDidChangeSelection = this._onDidChangeSelectionEmitter.event;

		_fireDidChangeActive(handles: number[]) {
			const items = coalesce(handles.map(handle => this._handlesToItems.get(handle)));
			this._activeItems = items;
			this._onDidChangeActiveEmitter.fire(items);
		}

		_fireDidChangeSelection(handles: number[]) {
			const items = coalesce(handles.map(handle => this._handlesToItems.get(handle)));
			this._selectedItems = items;
			this._onDidChangeSelectionEmitter.fire(items);
		}

		onDidTriggerItemButton = this._onDidTriggerItemButtonEmitter.event;

		_fireDidTriggerItemButton(itemHandle: number, buttonHandle: number) {
			const item = this._handlesToItems.get(itemHandle)!;
			if (!item || !item.buttons || !item.buttons.length) {
				return;
			}
			const button = item.buttons[buttonHandle];
			if (button) {
				this._onDidTriggerItemButtonEmitter.fire({
					button,
					item
				});
			}
		}
	}

	class ExtHostInputBox extends ExtHostQuickInput implements InputBox {

		private _password = false;
		private _prompt: string | undefined;
		private _valueSelection: readonly [number, number] | undefined;
		private _validationMessage: string | InputBoxValidationMessage | undefined;

		constructor(extension: IExtensionDescription, onDispose: () => void) {
			super(extension.identifier, onDispose);
			this.update({ type: 'inputBox' });
		}

		get password() {
			return this._password;
		}

		set password(password: boolean) {
			this._password = password;
			this.update({ password });
		}

		get prompt() {
			return this._prompt;
		}

		set prompt(prompt: string | undefined) {
			this._prompt = prompt;
			this.update({ prompt });
		}

		get valueSelection() {
			return this._valueSelection;
		}

		set valueSelection(valueSelection: readonly [number, number] | undefined) {
			this._valueSelection = valueSelection;
			this.update({ valueSelection });
		}

		get validationMessage() {
			return this._validationMessage;
		}

		set validationMessage(validationMessage: string | InputBoxValidationMessage | undefined) {
			this._validationMessage = validationMessage;
			if (!validationMessage) {
				this.update({ validationMessage: undefined, severity: Severity.Ignore });
			} else if (typeof validationMessage === 'string') {
				this.update({ validationMessage, severity: Severity.Error });
			} else {
				this.update({ validationMessage: validationMessage.message, severity: validationMessage.severity ?? Severity.Error });
			}
		}
	}

	return new ExtHostQuickOpenImpl(workspace, commands);
}
