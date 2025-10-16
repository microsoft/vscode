/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPickOptions, IInputOptions, IQuickInputService, IQuickInput, IQuickPick, IQuickPickItem, QuickInputButtonLocation } from '../../../platform/quickinput/common/quickInput.js';
import { ExtHostContext, MainThreadQuickOpenShape, ExtHostQuickOpenShape, TransferQuickPickItem, MainContext, TransferQuickInput, TransferQuickInputButton, IInputBoxOptions, TransferQuickPickItemOrSeparator } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { URI } from '../../../base/common/uri.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Toggle } from '../../../base/browser/ui/toggle/toggle.js';
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from '../../../platform/theme/common/colorRegistry.js';
import { ThemeIcon } from '../common/extHostTypes.js';
import { basenameOrAuthority, dirname } from '../../../base/common/resources.js';
import { Lazy } from '../../../base/common/lazy.js';
import { getIconClasses } from '../../../editor/common/services/getIconClasses.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ICustomEditorLabelService } from '../../services/editor/common/customEditorLabelService.js';

interface QuickInputSession {
	input: IQuickInput;
	handlesToItems: Map<number, TransferQuickPickItem>;
	handlesToToggles: Map<number, Toggle>;
	store: DisposableStore;
}

function reviveIconPathUris(iconPath: { dark: URI; light?: URI | undefined }) {
	iconPath.dark = URI.revive(iconPath.dark);
	if (iconPath.light) {
		iconPath.light = URI.revive(iconPath.light);
	}
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
			this._items[instance].resolve(items.map(item => this.processResourceUri(item)));
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
					const items = params.items?.map((item: TransferQuickPickItemOrSeparator) => {
						if (item.type === 'separator') {
							return item;
						}

						if (item.buttons) {
							item.buttons = item.buttons.map((button: TransferQuickInputButton) => {
								if (button.iconPath) {
									reviveIconPathUris(button.iconPath);
								}

								return button;
							});
						}

						handlesToItems.set(item.handle, item);
						return this.processResourceUri(item);
					});
					quickPick.items = items;
					break;
				}

				case 'activeItems':
					quickPick.activeItems = params.activeItems!.map((handle: number) => handlesToItems.get(handle));
					break;

				case 'selectedItems':
					quickPick.selectedItems = params.selectedItems!.map((handle: number) => handlesToItems.get(handle));
					break;

				case 'buttons': {
					const buttons = [], toggles = [];
					for (const button of params.buttons!) {
						if (button.handle === -1) {
							buttons.push(this._quickInputService.backButton);
							continue;
						}

						if (button.iconPath) {
							reviveIconPathUris(button.iconPath);
						}

						// Currently buttons are only supported outside of the input box
						// and toggles only inside. When/if that changes, this will need to be updated.
						if (button.location === QuickInputButtonLocation.Input) {
							toggles.push(button);
						} else {
							buttons.push(button);
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
	private processResourceUri(item: TransferQuickPickItemOrSeparator): TransferQuickPickItemOrSeparator {
		if (item.type === 'separator' || !item.resourceUri) {
			return item;
		}

		const resourceUri = URI.from(item.resourceUri);
		let label = item.label;
		let hasCustomLabel = true;
		if (!label) {
			label = this.customEditorLabelService.getName(resourceUri) || '';
			if (!label) {
				label = basenameOrAuthority(resourceUri);
				hasCustomLabel = false;
			}
		}

		const description = item.description || this.labelService.getUriLabel(
			hasCustomLabel ? resourceUri : dirname(resourceUri), { relative: true });

		// Replace iconClass with iconClasses if iconClass is the default file icon and no iconPath is provided.
		let iconClass = item.iconClass;
		let iconClasses: Lazy<string[] | undefined> | undefined;
		if ((iconClass === 'codicon codicon-file' || iconClass === 'codicon codicon-folder') && !item.iconPath) {
			iconClass = undefined;
			iconClasses = new Lazy(() => getIconClasses(this.modelService, this.languageService, resourceUri));
		}

		return {
			...item,
			iconClass,
			label,
			description,
			get iconClasses() { return iconClasses?.value; }
		};
	}

	/**
	 * Updates the toggles for a given quick input session by creating new {@link Toggle}-s
	 * from buttons, updating existing toggles props and removing old ones.
	 */
	private updateToggles(sessionId: number, session: QuickInputSession, buttons: TransferQuickInputButton[]) {
		const { input, handlesToToggles, store } = session;

		// Add new or update existing toggles.
		const toggles = [];
		for (const { handle, tooltip, checked } of buttons) {
			let toggle = handlesToToggles.get(handle);
			if (toggle) {
				// Toggle already exists, update its props.
				toggle.setTitle(tooltip || '');
				//toggle.setIcon(iconPath);
				toggle.checked = !!checked;
			} else {
				// Create a new toggle from the button.
				toggle = store.add(new Toggle({
					title: tooltip || '',
					icon: ThemeIcon.File, // iconPath,
					isChecked: !!checked,
					inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
					inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
					inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
				}));
				store.add(toggle.onChange(() => {
					this._proxy.$onDidTriggerButton(sessionId, handle);
				}));
				session.handlesToToggles.set(handle, toggle);
			}
			toggles.push(toggle);
		}

		// Remove toggles that are no longer present from the session map.
		for (const handle of handlesToToggles.keys()) {
			if (!buttons.some(o => o.handle === handle)) {
				handlesToToggles.delete(handle);
			}
		}

		// Update toggle interfaces on the input widget.
		input.toggles = toggles;
	}
}
