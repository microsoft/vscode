/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { IMobilePickerSheetHeaderAction, IMobilePickerSheetItem, IMobilePickerSheetSearchSource, MOBILE_PICKER_SHEET_HEADER_ACTION_PREFIX, showMobilePickerSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';
import { localize } from '../../../../../nls.js';
import { IWorkspacePickerItem } from '../sessionWorkspacePicker.js';
import { SubmenuAction, IAction } from '../../../../../base/common/actions.js';
import { isString } from '../../../../../base/common/types.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ISessionWorkspaceBrowseAction } from '../../../../services/sessions/common/session.js';

/** Prefix used for ids of dynamically-loaded folder rows in the sheet. */
const SEARCH_RESULT_ID_PREFIX = 'searchResult:';

/**
 * Plan for translating an action-widget picker entry into mobile sheet
 * rows. Each plan entry pairs the row(s) we'll show in the bottom sheet
 * with the dispatch logic to invoke when the user taps it.
 */
type MobilePickerRow = {
	readonly sheetItem: IMobilePickerSheetItem;
	readonly run: () => void;
};

/**
 * Translates the action-widget items produced by
 * {@link WorkspacePicker._buildItems} (and its subclasses) into rows for
 * the mobile picker sheet. Submenu entries are flattened — each child
 * action is shown as its own row. Separator items become dividers.
 */
export function buildMobileWorkspacePickerRows(
	items: readonly IActionListItem<IWorkspacePickerItem>[],
	dispatch: (item: IWorkspacePickerItem) => void,
): MobilePickerRow[] {
	const rows: MobilePickerRow[] = [];
	let pendingSeparator = false;

	for (const item of items) {
		if (item.kind === ActionListItemKind.Separator) {
			pendingSeparator = rows.length > 0;
			continue;
		}

		const sectionTitle = pendingSeparator ? '' : undefined;
		pendingSeparator = false;

		// Submenu items: flatten the inner actions into individual rows
		// using the parent label as a section header so the user still
		// sees the grouping.
		if (item.submenuActions && item.submenuActions.length > 0) {
			let isFirst = true;
			const childActions = collectSubmenuActions(item.submenuActions);
			if (childActions.length === 0) {
				continue;
			}
			for (const child of childActions) {
				const id = `submenu:${rows.length}`;
				const childIcon = (child as IAction & { icon?: ThemeIcon }).icon ?? item.group?.icon;
				rows.push({
					sheetItem: {
						id,
						label: child.label,
						icon: childIcon,
						disabled: !child.enabled,
						sectionTitle: isFirst ? (sectionTitle ?? item.label ?? '') : undefined,
					},
					run: () => child.run(),
				});
				isFirst = false;
			}
			continue;
		}

		const id = `item:${rows.length}`;
		const data = item.item;
		// Recent-workspace rows inherit the workspace's provider icon
		// (e.g. `Codicon.remote` / `Codicon.cloud`) on the desktop
		// picker. On the mobile sheet the surrounding window is already
		// scoped to a single host via the host picker, so the host
		// indication is redundant — render every workspace as a folder
		// to match the inline folder search results below.
		const isWorkspaceRow = !!data?.selection;
		const icon = isWorkspaceRow ? Codicon.folder : item.group?.icon;
		rows.push({
			sheetItem: {
				id,
				label: item.label ?? '',
				description: descriptionToString(item.description),
				icon,
				checked: !!data?.checked,
				disabled: item.disabled,
				sectionTitle,
			},
			run: () => {
				if (data) {
					dispatch(data);
				}
			},
		});
	}

	return rows;
}

function collectSubmenuActions(actions: readonly IAction[]): IAction[] {
	const out: IAction[] = [];
	for (const a of actions) {
		if (a instanceof SubmenuAction) {
			for (const inner of a.actions) {
				out.push(inner);
			}
		} else {
			out.push(a);
		}
	}
	return out;
}

function descriptionToString(value: IActionListItem<IWorkspacePickerItem>['description']): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (isString(value)) {
		return value;
	}
	return value.value;
}

/**
 * Helper for mobile workspace picker subclasses. Routes to the desktop
 * action widget when the viewport isn't classified as phone, and
 * otherwise renders a bottom sheet using the picker's existing item
 * builder and dispatch logic.
 *
 * Browse-action items (e.g. the scoped picker's "Select Folder...")
 * are hoisted out of the sheet's row list and into icon buttons in the
 * sheet's title row — this keeps the row list focused on actual
 * workspaces and commands while keeping the browse shortcut one tap
 * away. Browse actions that implement {@link ISessionWorkspaceBrowseAction.listFolders}
 * are instead rendered as an inline search section: a search input at
 * the top of the sheet and a folder list beneath the recents, refreshed
 * as the user types. When the picker would otherwise produce only
 * browse actions (no workspaces, no commands, no inline search), the
 * first one is invoked directly and the sheet is skipped entirely.
 */
export async function showMobileWorkspacePickerSheet(
	layoutService: IWorkbenchLayoutService,
	triggerElement: HTMLElement,
	items: readonly IActionListItem<IWorkspacePickerItem>[],
	dispatch: (item: IWorkspacePickerItem) => void,
	browseActions: readonly ISessionWorkspaceBrowseAction[],
): Promise<void> {
	const { rowItems, headerBrowseActions } = partitionItems(items, dispatch, browseActions);

	// Restrict inline folder search to browse actions the picker
	// actually chose to surface in its item list — the scoped picker
	// only emits one item (for the currently-selected host), so this
	// keeps the search results to that host's folders rather than
	// every registered provider's folders.
	const surfacedProviderIds = collectSurfacedBrowseProviderIds(items, browseActions);
	const inlineFolderActions = browseActions.filter((b): b is ISessionWorkspaceBrowseAction & Required<Pick<ISessionWorkspaceBrowseAction, 'listFolders'>> =>
		typeof b.listFolders === 'function' && surfacedProviderIds.has(b.providerId)
	);

	// No workspaces / commands, no inline search, and we have a single
	// browse action — invoke it directly rather than opening a sheet
	// that would only contain it.
	if (rowItems.length === 0 && inlineFolderActions.length === 0 && headerBrowseActions.length === 1) {
		headerBrowseActions[0].invoke();
		return;
	}

	// No rows AND no header actions AND no inline search — nothing to show.
	if (rowItems.length === 0 && inlineFolderActions.length === 0 && headerBrowseActions.length === 0) {
		return;
	}

	const rows = buildMobileWorkspacePickerRows(rowItems, dispatch);
	const headerActions: IMobilePickerSheetHeaderAction[] = headerBrowseActions.map((b, i) => ({
		id: String(i),
		label: b.label,
		icon: b.icon,
	}));

	// Build the inline search source and a parallel id→dispatch map so
	// the sheet can resolve folder taps back to a provider selection.
	const folderRunById = new Map<string, () => void>();
	const folderLabelById = new Map<string, string>();
	// Track the current search query so drill-down can append to it.
	let currentSearchQuery = '';
	const search: IMobilePickerSheetSearchSource | undefined = inlineFolderActions.length > 0
		? {
			placeholder: localize('mobileWorkspacePicker.searchFolders', "Search folders…"),
			resultsSectionTitle: localize('mobileWorkspacePicker.foldersSection', "Folders"),
			emptyMessage: localize('mobileWorkspacePicker.noFolders', "No folders match"),
			loadItems: async (query, token) => {
				currentSearchQuery = query;
				folderRunById.clear();
				folderLabelById.clear();
				const results = await Promise.all(
					inlineFolderActions.map(async action => {
						try {
							const folders = await action.listFolders(query, token);
							return folders.map(workspace => ({ workspace, providerId: action.providerId }));
						} catch {
							return [];
						}
					}),
				);
				if (token.isCancellationRequested) {
					return [];
				}
				const flattened = results.flat();
				const sheetItems: IMobilePickerSheetItem[] = [];
				flattened.forEach((entry, idx) => {
					const id = `${SEARCH_RESULT_ID_PREFIX}${idx}`;
					folderRunById.set(id, () => dispatch({ selection: { providerId: entry.providerId, workspace: entry.workspace } }));
					folderLabelById.set(id, entry.workspace.label);
					sheetItems.push({
						id,
						label: entry.workspace.label,
						description: entry.workspace.description,
						icon: entry.workspace.icon,
					});
				});
				return sheetItems;
			},
		}
		: undefined;

	triggerElement.setAttribute('aria-expanded', 'true');

	// Track the last-tapped folder from search results so Done can
	// dispatch it. In `stayOpenOnSelect` mode, row taps don't close
	// the sheet — instead they apply the selection and let the user
	// browse further. The workspace-picker-specific rows (recents)
	// dispatch immediately on tap since those are confirmed choices.
	let lastSearchFolderRun: (() => void) | undefined;

	try {
		await showMobilePickerSheet(
			layoutService.mainContainer,
			localize('mobileWorkspacePicker.title', "Choose Workspace"),
			rows.map(r => r.sheetItem),
			{
				headerActions,
				search,
				caption: localize('mobileWorkspacePicker.caption', "Search to browse folders on the host"),
				stayOpenOnSelect: true,
				onDidSelect: (id) => {
					if (id.startsWith(MOBILE_PICKER_SHEET_HEADER_ACTION_PREFIX)) {
						const idx = Number(id.slice(MOBILE_PICKER_SHEET_HEADER_ACTION_PREFIX.length));
						headerBrowseActions[idx]?.invoke();
						return;
					}
					if (id.startsWith(SEARCH_RESULT_ID_PREFIX)) {
						lastSearchFolderRun = folderRunById.get(id);
						// Drill down: build a path query from the
						// current query prefix + this folder's name,
						// e.g. "projects/" → "projects/subfolder/".
						const folderName = folderLabelById.get(id);
						if (folderName) {
							// Compute the prefix up to (and including)
							// the last `/` in the current query, then
							// append the tapped folder name + `/`.
							const lastSlash = currentSearchQuery.lastIndexOf('/');
							const prefix = lastSlash >= 0 ? currentSearchQuery.slice(0, lastSlash + 1) : '';
							return `${prefix}${folderName}/`;
						}
						return;
					}
					// Recent workspace row — dispatch immediately (it
					// sets the workspace on the session).
					const row = rows.find(r => r.sheetItem.id === id);
					if (row) {
						row.run();
						lastSearchFolderRun = undefined;
					}
					return;
				},
			},
		);

		// Done was tapped — if the last selection was a search folder,
		// dispatch it now. Recent rows were already dispatched on tap.
		lastSearchFolderRun?.();
	} finally {
		triggerElement.setAttribute('aria-expanded', 'false');
		triggerElement.focus();
	}
}

interface IPartitionedItems {
	readonly rowItems: IActionListItem<IWorkspacePickerItem>[];
	readonly headerBrowseActions: IBrowseHeaderAction[];
}

/**
 * Browse action lifted into the sheet's header. Either dispatches via
 * the shared workspace-picker dispatch (when the source item carries
 * picker data) or invokes a captured submenu action directly.
 */
interface IBrowseHeaderAction {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly invoke: () => void;
}

/**
 * Splits picker items into row items (workspaces, commands) and browse
 * actions that should be hoisted to the sheet's header. Browse actions
 * are recognized as items whose data carries a `browseActionIndex`.
 *
 * Submenu-grouped browse actions are flattened into individual header
 * actions, one per child action. Browse actions whose underlying
 * provider implements `listFolders` are dropped from both the row list
 * and the header — they are surfaced via the inline search section
 * instead, so we don't show two ways to do the same thing.
 */
function partitionItems(
	items: readonly IActionListItem<IWorkspacePickerItem>[],
	dispatch: (item: IWorkspacePickerItem) => void,
	browseActions: readonly ISessionWorkspaceBrowseAction[],
): IPartitionedItems {
	const rowItems: IActionListItem<IWorkspacePickerItem>[] = [];
	const headerBrowseActions: IBrowseHeaderAction[] = [];

	const hasInlineSearch = (index: number | undefined) => index !== undefined && typeof browseActions[index]?.listFolders === 'function';

	for (const item of items) {
		if (item.kind === ActionListItemKind.Separator) {
			rowItems.push(item);
			continue;
		}

		// Submenu of browse actions — promote each child to a header action.
		if (item.submenuActions?.length) {
			let promoted = false;
			for (const child of collectSubmenuActions(item.submenuActions)) {
				if (!child.enabled) {
					continue;
				}
				headerBrowseActions.push({
					label: child.label || item.label || '',
					icon: (child as IAction & { icon?: ThemeIcon }).icon ?? item.group?.icon ?? Codicon.folderOpened,
					invoke: () => child.run(),
				});
				promoted = true;
			}
			if (!promoted) {
				rowItems.push(item);
			}
			continue;
		}

		if (item.item?.browseActionIndex !== undefined && !item.disabled) {
			if (hasInlineSearch(item.item.browseActionIndex)) {
				// Inline search owns this browse action — don't duplicate
				// it as a header icon.
				continue;
			}
			const data = item.item;
			headerBrowseActions.push({
				label: item.label ?? '',
				icon: item.group?.icon ?? Codicon.folderOpened,
				invoke: () => dispatch(data),
			});
			continue;
		}

		rowItems.push(item);
	}

	// Trim leading/trailing separators that were left dangling after
	// filtering — the picker often emits a separator between recents and
	// browse actions, which becomes a top-level dangling separator once
	// the browse rows are removed.
	while (rowItems.length && rowItems[0].kind === ActionListItemKind.Separator) {
		rowItems.shift();
	}
	while (rowItems.length && rowItems[rowItems.length - 1].kind === ActionListItemKind.Separator) {
		rowItems.pop();
	}

	return { rowItems, headerBrowseActions };
}

/**
 * Returns true when the workspace picker should render its options as a
 * mobile bottom sheet rather than the desktop action-widget popup. Used
 * by mobile picker subclasses at click time so rotation across the
 * phone breakpoint behaves correctly.
 */
export function shouldUseMobileWorkspacePickerSheet(layoutService: IWorkbenchLayoutService): boolean {
	return isPhoneLayout(layoutService);
}

/**
 * Collects the provider ids of every browse action the picker chose to
 * surface in its items list. The scoped picker only emits a single
 * browse-action item (for the currently-selected host), so this set
 * naturally restricts the inline folder search to that host. When the
 * picker emits no browse-action items (e.g. scoped provider is
 * unavailable), the returned set is empty and inline search is
 * suppressed — we'd rather show nothing than leak folders from a host
 * the user isn't currently scoped to.
 */
function collectSurfacedBrowseProviderIds(
	items: readonly IActionListItem<IWorkspacePickerItem>[],
	browseActions: readonly ISessionWorkspaceBrowseAction[],
): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const item of items) {
		if (item.kind === ActionListItemKind.Separator) {
			continue;
		}
		const idx = item.item?.browseActionIndex;
		if (idx !== undefined) {
			const action = browseActions[idx];
			if (action) {
				ids.add(action.providerId);
			}
			continue;
		}
		// Multi-provider case: the desktop picker groups browse actions
		// into a submenu item. The submenu children don't carry
		// `browseActionIndex`, so we fall back to including all browse-
		// action providers when a submenu is present — the picker has
		// already scoped the items to visible providers.
		if (item.submenuActions?.length) {
			for (const ba of browseActions) {
				ids.add(ba.providerId);
			}
		}
	}
	return ids;
}
