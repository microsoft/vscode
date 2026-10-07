/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnchor } from '../../../../base/browser/ui/contextview/contextview.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IAction } from '../../../../base/common/actions.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions, IActionListUpdateOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IMobilePickerSheetItem, showMobilePickerSheet } from '../../../browser/parts/mobile/mobilePickerSheet.js';

/** What the phone needs to know about a shown widget until it closes. */
interface IShownWidget {
	readonly delegate: IActionListDelegate<unknown>;
	readonly dismiss: CancellationTokenSource;
	hidden: boolean;
	setFilter?: (value: string, focusItemId?: string) => void;
}

/**
 * Phone presentation of {@link IActionWidgetService}: every anchored action
 * list — session configuration chips, mode and model pickers, branch and
 * repository pickers — is shown as a bottom sheet instead of a popup anchored
 * to a desktop control.
 *
 * Callers do not change: items, the delegate's `onSelect`/`onHide`/`onFilter`
 * callbacks, and the convention of reading the checked state from the item
 * payload are the same as the desktop list. Headers and separators become
 * sheet sections, the optional filter becomes the sheet's search field, and
 * footer actions become a trailing section of rows. Anchors are ignored: a
 * sheet always comes from the bottom edge.
 */
export class MobileActionWidgetService extends Disposable implements IActionWidgetService {

	declare readonly _serviceBrand: undefined;

	private _shown: IShownWidget | undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
		super();
	}

	get isVisible(): boolean {
		return !!this._shown;
	}

	show<T>(
		_user: string,
		_supportsPreview: boolean,
		items: readonly IActionListItem<T>[],
		delegate: IActionListDelegate<T>,
		_anchor: HTMLElement | StandardMouseEvent | IAnchor,
		_container: HTMLElement | undefined,
		actionBarActions?: readonly IAction[],
		accessibilityProvider?: Partial<IListAccessibilityProvider<IActionListItem<T>>>,
		listOptions?: IActionListOptions,
	): void {
		// One sheet at a time: a new request replaces the open one, like the
		// desktop widget replaces its popup.
		this.hide(true);

		const byId = new Map<string, IActionListItem<T>>();
		const footerById = new Map<string, IAction>();
		const toRows = (source: readonly IActionListItem<T>[]): IMobilePickerSheetItem[] => {
			const rows: IMobilePickerSheetItem[] = [];
			let pendingSection: string | undefined;
			for (const item of source) {
				if (item.kind === ActionListItemKind.Header) {
					pendingSection = item.label ?? item.group?.title ?? '';
					continue;
				}
				if (item.kind === ActionListItemKind.Separator) {
					pendingSection = '';
					continue;
				}
				const payload = item.item as { id?: string; checked?: boolean } | undefined;
				const id = typeof payload?.id === 'string' ? `action-widget-item-${payload.id}` : `action-widget-row-${byId.size}`;
				byId.set(id, item);
				const toggle = item.standaloneToggle ?? item.inlineToggle;
				rows.push({
					id,
					label: item.label ?? toggle?.label ?? '',
					badge: item.badge,
					description: item.detail ?? (typeof item.description === 'string' ? item.description : undefined),
					icon: item.hideIcon ? undefined : item.group?.icon,
					checked: toggle ? toggle.checked : payload?.checked,
					disabled: item.disabled || toggle?.disabled,
					sectionTitle: pendingSection,
				});
				pendingSection = undefined;
			}
			return rows;
		};

		const rows = toRows(items);
		for (const action of actionBarActions ?? []) {
			if (!action.enabled) {
				continue;
			}
			const id = `action-widget-footer-${footerById.size}`;
			footerById.set(id, action);
			rows.push({ id, label: action.label, sectionTitle: footerById.size === 1 ? '' : undefined });
		}
		if (rows.length === 0) {
			delegate.onHide(true);
			return;
		}

		const shown: IShownWidget = { delegate: delegate as IActionListDelegate<unknown>, dismiss: new CancellationTokenSource(), hidden: false };
		this._shown = shown;
		const ariaLabel = accessibilityProvider?.getWidgetAriaLabel?.();
		const title = typeof ariaLabel === 'string' ? ariaLabel : (ariaLabel?.get() ?? localize('mobileActionWidget.title', "Options"));
		const onFilter = delegate.onFilter;
		const search = onFilter && listOptions?.showFilter
			? {
				placeholder: listOptions.filterPlaceholder ?? localize('mobileActionWidget.filter', "Filter"),
				replaceStaticItems: true,
				onDidCreateFilter: (setFilter: (query: string, focusItemId?: string) => void) => {
					shown.setFilter = (query, focusItemId) => setFilter(query, focusItemId ? `action-widget-item-${focusItemId}` : undefined);
					if (listOptions.initialFilterValue || listOptions.initialFocusItemId) {
						shown.setFilter(listOptions.initialFilterValue ?? '', listOptions.initialFocusItemId);
					}
				},
				loadItems: async (query: string, token: CancellationToken) => {
					if (!query.trim()) {
						return toRows(items);
					}
					const filtered = await onFilter(query, token);
					return token.isCancellationRequested ? [] : toRows(filtered);
				},
			}
			: undefined;

		showMobilePickerSheet(this.layoutService.mainContainer, title, rows, {
			doneLabel: localize('mobileActionWidget.cancel', "Cancel"),
			search,
			dismissToken: shown.dismiss.token,
		}).then(pickedId => {
			if (this._shown === shown) {
				this._shown = undefined;
			}
			shown.dismiss.dispose();
			// A programmatic `hide()` already told the delegate; a pick that
			// raced with it must not apply.
			if (shown.hidden) {
				return;
			}
			const picked = pickedId ? byId.get(pickedId) : undefined;
			const footer = pickedId ? footerById.get(pickedId) : undefined;
			if (picked) {
				const toggle = picked.standaloneToggle ?? picked.inlineToggle;
				if (toggle) {
					toggle.onChange(!toggle.checked);
				} else if (picked.item !== undefined) {
					delegate.onSelect(picked.item);
				}
			}
			// The delegate may have hidden the widget itself from `onSelect`.
			if (!shown.hidden) {
				shown.hidden = true;
				delegate.onHide(!picked && !footer);
			}
			if (footer) {
				Promise.resolve(footer.run()).catch(onUnexpectedError);
			}
		}, error => {
			if (this._shown === shown) {
				this._shown = undefined;
			}
			shown.dismiss.dispose();
			if (!shown.hidden) {
				shown.hidden = true;
				delegate.onHide(true);
			}
			onUnexpectedError(error);
		});
	}

	updateItems<T>(_items: readonly IActionListItem<T>[], _focusItemId?: string, _options?: IActionListUpdateOptions): void {
		// The sheet is built once per show; callers that stream updates re-open it.
	}

	getFocusedElement<T>(): IActionListItem<T> | undefined {
		return undefined;
	}

	focusItemById(_itemId: string): void { }

	setFilter(value: string, focusItemId?: string): void {
		this._shown?.setFilter?.(value, focusItemId);
	}

	hide(didCancel?: boolean): void {
		const shown = this._shown;
		if (!shown || shown.hidden) {
			return;
		}
		// The delegate hears about the hide exactly once, and the sheet closes
		// even when the owner hides it programmatically (e.g. session switch).
		shown.hidden = true;
		this._shown = undefined;
		shown.dismiss.cancel();
		shown.delegate.onHide(didCancel);
	}

	override dispose(): void {
		this.hide(true);
		super.dispose();
	}
}
