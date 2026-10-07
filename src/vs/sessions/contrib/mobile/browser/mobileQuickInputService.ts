/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileQuickInput.css';
import * as dom from '../../../../base/browser/dom.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IInputOptions, IPickOptions, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { QuickInputService } from '../../../../workbench/services/quickinput/browser/quickInputService.js';
import { IMobilePickerSheetItem, showMobileContentSheet, showMobilePickerSheet } from '../../../browser/parts/mobile/mobilePickerSheet.js';

const $ = dom.$;

/**
 * Phone presentation of the quick input.
 *
 * The one-shot `pick` and `input` calls that features use for simple choices
 * and prompts render as bottom sheets. Everything else — quick access (the
 * command palette, `#` and `@` pickers), multi-step pickers created through
 * `createQuickPick`, and anything multi-select — keeps the shared controller,
 * which the phone styles as a full-width panel. The service contract and the
 * results callers receive are unchanged.
 */
export class MobileQuickInputService extends QuickInputService {

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@ILayoutService layoutService: ILayoutService,
	) {
		super(configurationService, instantiationService, keybindingService, contextKeyService, themeService, layoutService);
	}

	override async pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: O, token: CancellationToken = CancellationToken.None): Promise<(O extends { canPickMany: true } ? T[] : T) | undefined> {
		if (options?.canPickMany || options?.quickNavigate || options?.contextKey) {
			return super.pick(picks, options, token);
		}

		const resolved = await raceCancellation(Promise.all([picks, options?.activeItem]), token);
		if (!resolved || token.isCancellationRequested) {
			return undefined;
		}
		const [resolvedPicks, activeItem] = resolved;
		// Per-item buttons (remove from recents, configure, …) have no row
		// affordance in the sheet; those pickers keep the shared controller.
		if (resolvedPicks.some(pick => pick.type !== 'separator' && pick.buttons?.length)) {
			return super.pick(picks, options, token);
		}

		const byId = new Map<string, T>();
		const items: IMobilePickerSheetItem[] = [];
		let pendingSection: string | undefined;
		for (const pick of resolvedPicks) {
			if (pick.type === 'separator') {
				pendingSection = pick.label ?? '';
				continue;
			}
			const id = `quick-pick-${byId.size}`;
			byId.set(id, pick);
			items.push({
				id,
				label: stripIconSyntax(pick.label),
				description: pick.detail ?? pick.description,
				// Single-select pickers mark the current value either way.
				checked: pick.picked || pick === activeItem || undefined,
				disabled: pick.disabled,
				sectionTitle: pendingSection,
			});
			pendingSection = undefined;
		}

		if (items.length === 0) {
			return super.pick(picks, options, token);
		}

		const title = options?.title ?? options?.placeHolder ?? localize('mobileQuickInput.pickTitle', "Choose");
		const pickedId = await showMobilePickerSheet(this.layoutService.mainContainer, title, items, {
			dismissToken: token,
			caption: options?.title ? options.placeHolder : undefined,
			doneLabel: localize('mobileQuickInput.cancel', "Cancel"),
			search: items.length > 8
				? {
					placeholder: localize('mobileQuickInput.search', "Search"),
					loadItems: async query => {
						const q = query.toLowerCase();
						return items.filter(item => item.label.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q));
					},
				}
				: undefined,
		});
		if (token.isCancellationRequested || !pickedId) {
			return undefined;
		}
		const picked = byId.get(pickedId);
		return picked as (O extends { canPickMany: true } ? T[] : T) | undefined;
	}

	override async input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): Promise<string | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		let result: string | undefined;
		const title = options.title ?? options.prompt ?? localize('mobileQuickInput.inputTitle', "Enter a value");
		await showMobileContentSheet(this.layoutService.mainContainer, title, (body, api) => {
			const store = new DisposableStore();
			if (options.title && options.prompt) {
				const prompt = dom.append(body, $('p.mobile-quick-input-prompt'));
				prompt.textContent = options.prompt;
			}
			const input = dom.append(body, $('input.mobile-quick-input-field', {
				type: options.password ? 'password' : 'text',
				autocomplete: 'off',
				autocapitalize: 'off',
				autocorrect: 'off',
				spellcheck: 'false',
			})) as HTMLInputElement;
			input.placeholder = options.placeHolder ?? '';
			input.value = options.value ?? '';
			if (options.valueSelection) {
				input.setSelectionRange(options.valueSelection[0], options.valueSelection[1]);
			}
			const validation = dom.append(body, $('p.mobile-quick-input-validation'));
			const submit = dom.append(body, $('button.mobile-quick-input-submit', { type: 'button' })) as HTMLButtonElement;
			submit.textContent = localize('mobileQuickInput.ok', "OK");

			const validate = async (): Promise<boolean> => {
				if (!options.validateInput) {
					return true;
				}
				const message = await options.validateInput(input.value);
				if (store.isDisposed || token.isCancellationRequested) {
					return false;
				}
				const text = typeof message === 'string' ? message : message?.content;
				validation.textContent = text ?? '';
				validation.classList.toggle('visible', !!text);
				// Info and warning messages are shown but do not block accepting.
				return !text || (typeof message === 'object' && message !== null && message.severity < Severity.Error);
			};
			store.add(dom.addDisposableListener(input, dom.EventType.INPUT, () => void validate().catch(onUnexpectedError)));

			const accept = async () => {
				if (await validate() && !store.isDisposed && !token.isCancellationRequested) {
					result = input.value;
					api.close();
				}
			};
			store.add(dom.addDisposableListener(submit, dom.EventType.CLICK, () => void accept().catch(onUnexpectedError)));
			store.add(dom.addStandardDisposableListener(input, dom.EventType.KEY_DOWN, e => {
				if (e.keyCode === KeyCode.Enter) {
					e.preventDefault();
					void accept().catch(onUnexpectedError);
				}
			}));
			api.setBodyFocusTargets([input, submit]);
			const window = dom.getWindow(input);
			const focusTimer = window.setTimeout(() => input.focus(), 50);
			store.add(toDisposable(() => window.clearTimeout(focusTimer)));
			store.add(token.onCancellationRequested(() => api.close()));
			return store;
		}, { doneLabel: localize('mobileQuickInput.cancel', "Cancel"), trapFocus: true });
		return token.isCancellationRequested ? undefined : result;
	}
}

function stripIconSyntax(label: string): string {
	return label.replace(/\$\([a-z0-9-]+(~[a-z]+)?\)\s*/gi, '').trim();
}
