/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Toggle } from '../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Lazy } from '../../../base/common/lazy.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { basenameOrAuthority, dirname } from '../../../base/common/resources.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isUriComponents, URI } from '../../../base/common/uri.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { IInputOptions, IPickOptions, IQuickInput, IQuickInputService, IQuickPick, IQuickPickItem, QuickInputButtonLocation } from '../../../platform/quickinput/common/quickInput.js';
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from '../../../platform/theme/common/colorRegistry.js';
import { ICustomEditorLabelService } from '../../services/editor/common/customEditorLabelService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostQuickOpenShape, IInputBoxOptions, MainContext, MainThreadQuickOpenShape, TransferQuickInput, TransferQuickInputButton, TransferQuickPickItem, TransferQuickPickItemOrSeparator } from '../common/extHost.protocol.js';

interface QuickInputSession {
	input: IQuickInput;
	handlesToItems: Map<number, TransferQuickPickItem>;
	handlesToToggles: Map<number, { toggle: Toggle; listener: IDisposable }>;
	store: DisposableStore;
}

@extHostNamedCustomer(MainContext.MainThreadQuickOpen)
export class MainThreadQuickOpen implements MainThreadQuickOpenShape {

	private readonly _proxy: ExtHostQuickOpenShape;
	private readonly _quickInputService: IQuickInputService;
	private readonly _items: Record<number, {
		resolve(items: TransferQuickPickItemOrSeparator[]): void;
		reject(error: Error): void;
	}> = {};

	constructor(
		extHostContext: IExtHostContext,
		@IQuickInputService quickInputService: IQuickInputService,
		@ILabelService private readonly labelService: ILabelService,
		@ICustomEditorLabelService private readonly customEditorLabelService: ICustomEditorLabelService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickOpen);
		this._quickInputService = quickInputService;
	}

	public dispose(): void {
		for (const [_id, session] of this.sessions) {
			session.store.dispose();
		}
	}

	$show(instance: number, options: IPickOptions<TransferQuickPickItem>, token: CancellationToken): Promise<number | number[] | undefined> {
		const contents = new Promise<TransferQuickPickItemOrSeparator[]>((resolve, reject) => {
			this._items[instance] = { resolve, reject };
		});

		options = {
			...options,
			onDidFocus: el => {
				if (el) {
					this._proxy.$onItemSelected((<TransferQuickPickItem>el).handle);
				}
			}
		};

		if (options.canPickMany) {
			return this._quickInputService.pick(contents, options as { canPickMany: true }, token).then(items => {
				if (items) {
					return items.map(item => item.handle);
				}
				return undefined;
			});
		} else {
			return this._quickInputService.pick(contents, options, token).then(item => {
				if (item) {
					return item.handle;
				}
				return undefined;
			});
		}
	}

	$setItems(instance: number, items: TransferQuickPickItemOrSeparator[]): Promise<void> {
		if (this._items[instance]) {
			items.forEach(item => this.expandItemProps(item));
			this._items[instance].resolve(items);
			delete this._items[instance];
		}
		return Promise.resolve();
	}

	$setError(instance: number, error: Error): Promise<void> {
		if (this._items[instance]) {
			this._items[instance].reject(error);
			delete this._items[instance];
		}
		return Promise.resolve();
	}

	// ---- input

	$input(options: IInputBoxOptions | undefined, validateInput: boolean, token: CancellationToken): Promise<string | undefined> {
		const inputOptions: IInputOptions = Object.create(null);

		if (options) {
			inputOptions.title = options.title;
			inputOptions.password = options.password;
			inputOptions.placeHolder = options.placeHolder;
			inputOptions.valueSelection = options.valueSelection;
			inputOptions.prompt = options.prompt;
			inputOptions.value = options.value;
			inputOptions.ignoreFocusLost = options.ignoreFocusOut;
		}

		if (validateInput) {
			inputOptions.validateInput = (value) => {
				return this._proxy.$validateInput(value);
			};
		}

		return this._quickInputService.input(inputOptions, token);
	}

	// ---- QuickInput

	private sessions = new Map<number, QuickInputSession>();

	$createOrUpdate(params: TransferQuickInput): Promise<void> {
		const sessionId = params.id;
		let session = this.sessions.get(sessionId);
		if (!session) {
			const store = new DisposableStore();
			const input = params.type === 'quickPick' ? this._quickInputService.createQuickPick() : this._quickInputService.createInputBox();
			store.add(input);
			store.add(input.onDidAccept(() => {
				this._proxy.$onDidAccept(sessionId);
			}));
			store.add(input.onDidTriggerButton(button => {
				this._proxy.$onDidTriggerButton(sessionId, (button as TransferQuickInputButton).handle);
			}));
			store.add(input.onDidChangeValue(value => {
				this._proxy.$onDidChangeValue(sessionId, value);
			}));
			store.add(input.onDidHide(() => {
				this._proxy.$onDidHide(sessionId);
			}));

			if (params.type === 'quickPick') {
				// Add extra events specific for quickpick
				const quickpick = input as IQuickPick<IQuickPickItem>;
				store.add(quickpick.onDidChangeActive(items => {
					this._proxy.$onDidChangeActive(sessionId, items.map(item => (item as TransferQuickPickItem).handle));
				}));
				store.add(quickpick.onDidChangeSelection(items => {
					this._proxy.$onDidChangeSelection(sessionId, items.map(item => (item as TransferQuickPickItem).handle));
				}));
				store.add(quickpick.onDidTriggerItemButton((e) => {
					this._proxy.$onDidTriggerItemButton(sessionId, (e.item as TransferQuickPickItem).handle, (e.button as TransferQuickInputButton).handle);
				}));
			}

			session = {
				input,
				handlesToItems: new Map(),
				handlesToToggles: new Map(),
				store
			};
			this.sessions.set(sessionId, session);
		}

		const { input, handlesToItems } = session;
		const quickPick = input as IQuickPick<IQuickPickItem>;
		for (const param in params) {
			switch (param) {
				case 'id':
				case 'type':
					continue;

				case 'visible':
					if (params.visible) {
						input.show();
					} else {
						input.hide();
					}
					break;

				case 'items': {
					handlesToItems.clear();
					params.items?.forEach((item: TransferQuickPickItemOrSeparator) => {
						this.expandItemProps(item);
						if (item.type !== 'separator') {
							item.buttons?.forEach(button => this.expandIconPath(button));
							handlesToItems.set(item.handle, item);
						}
					});
					quickPick.items = params.items;
					break;
				}

				case 'activeItems':
					quickPick.activeItems = params.activeItems
						?.map((handle: number) => handlesToItems.get(handle))
						.filter(Boolean);
					break;

				case 'selectedItems':
					quickPick.selectedItems = params.selectedItems
						?.map((handle: number) => handlesToItems.get(handle))
						.filter(Boolean);
					break;

				case 'buttons': {
					const buttons = [], toggles = [];
					for (const button of params.buttons!) {
						if (button.handle === -1) {
							buttons.push(this._quickInputService.backButton);
						} else {
							this.expandIconPath(button);

							// Currently buttons are only supported outside of the input box
							// and toggles only inside. When/if that changes, this will need to be updated.
							if (button.location === QuickInputButtonLocation.Input) {
								toggles.push(button);
							} else {
								buttons.push(button);
							}
						}
					}
					input.buttons = buttons;
					this.updateToggles(sessionId, session, toggles);
					break;
				}

				default:
					// eslint-disable-next-line local/code-no-any-casts
					(input as any)[param] = params[param];
					break;
			}
		}
		return Promise.resolve(undefined);
	}

	$dispose(sessionId: number): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.store.dispose();
			this.sessions.delete(sessionId);
		}
		return Promise.resolve(undefined);
	}

	/**
	* Derives icon, label and description for Quick Pick items that represent a resource URI.
	*/
	private expandItemProps(item: TransferQuickPickItemOrSeparator) {
		if (item.type === 'separator') {
			return;
		}

		if (!item.resourceUri) {
			this.expandIconPath(item);
			return;
		}

		// Derive missing label and description from resourceUri.
		const resourceUri = URI.from(item.resourceUri);
		item.label ??= this.customEditorLabelService.getName(resourceUri) || '';
		if (item.label) {
			item.description ??= this.labelService.getUriLabel(resourceUri, { relative: true });
		} else {
			item.label = basenameOrAuthority(resourceUri);
			item.description ??= this.labelService.getUriLabel(dirname(resourceUri), { relative: true });
		}

		// Derive icon props from resourceUri if icon is set to ThemeIcon.File or ThemeIcon.Folder.
		const icon = item.iconPathDto;
		if (ThemeIcon.isThemeIcon(icon) && (ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon))) {
			const iconClasses = new Lazy(() => getIconClasses(this.modelService, this.languageService, resourceUri));
			Object.defineProperty(item, 'iconClasses', { get: () => iconClasses.value });
		} else {
			this.expandIconPath(item);
		}
	}

	/**
	* Converts IconPath DTO into iconPath/iconClass properties.
	*/
	private expandIconPath(target: Pick<TransferQuickPickItem, 'iconPathDto' | 'iconPath' | 'iconClass'>) {
		const icon = target.iconPathDto;
		if (!icon) {
			return;
		} else if (ThemeIcon.isThemeIcon(icon)) {
			// TODO: Since IQuickPickItem and IQuickInputButton do not support ThemeIcon directly, the color ID is lost here.
			// We should consider changing changing iconPath/iconClass to IconPath in both interfaces.
			// Request for color support: https://github.com/microsoft/vscode/issues/185356..
			target.iconClass = ThemeIcon.asClassName(icon);
		} else if (isUriComponents(icon)) {
			const uri = URI.from(icon);
			target.iconPath = { dark: uri, light: uri };
		} else {
			const { dark, light } = icon;
			target.iconPath = { dark: URI.from(dark), light: URI.from(light) };
		}
	}

	/**
	* Updates the toggles for a given quick input session by creating new {@link Toggle}-s
	* from buttons, updating existing toggles props and removing old ones.
	*/
	private updateToggles(sessionId: number, session: QuickInputSession, buttons: TransferQuickInputButton[]) {
		const { input, handlesToToggles, store } = session;

		// Add new or update existing toggles.
		const toggles = [];
		for (const button of buttons) {
			const title = button.tooltip || '';
			const isChecked = !!button.checked;

			// TODO: Toggle class only supports ThemeIcon at the moment, but not other formats of IconPath.
			// We should consider adding support for the full IconPath to Toggle, in this code should be updated.
			const icon = ThemeIcon.isThemeIcon(button.iconPathDto) ? button.iconPathDto : undefined;

			let { toggle } = handlesToToggles.get(button.handle) || {};
			if (toggle) {
				// Toggle already exists, update its props.
				toggle.setTitle(title);
				toggle.setIcon(icon);
				toggle.checked = isChecked;
			} else {
				// Create a new toggle from the button.
				toggle = store.add(new Toggle({
					title,
					icon,
					isChecked,
					inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
					inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
					inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
				}));

				const listener = store.add(toggle.onChange(() => {
					this._proxy.$onDidTriggerButton(sessionId, button.handle, toggle!.checked);
				}));

				handlesToToggles.set(button.handle, { toggle, listener });
			}
			toggles.push(toggle);
		}

		// Remove toggles that are no longer present from the session map.
		for (const [handle, { toggle, listener }] of handlesToToggles) {
			if (!buttons.some(button => button.handle === handle)) {
				handlesToToggles.delete(handle);
				store.delete(toggle);
				store.delete(listener);
			}
		}

		// Update toggle interfaces on the input widget.
		input.toggles = toggles;
	}
}
