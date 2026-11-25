/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableResizeObserver, runWhenWindowIdle, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { AnchorPosition } from '../../../../base/common/layout.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IFolderLocation, IFolderLocationGroup, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../onboarding/common/onboardingScenarioService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';

const FOLDER_LOCATION_INTRODUCTION_ID = 'workbench.folderLocation.introduction';
const FOLDER_LOCATION_INTRODUCTION_TARGET_ID = 'workbench.folderLocation.statusEntry';
const FOLDER_LOCATION_STATUS_ENTRY_ID = 'status.workspace.folderLocation';

/** Coarse fallback for state without a change event (the onboarding service has none for "shown"). */
const FOLDER_LOCATION_INTRODUCTION_POLL_INTERVAL = 2000;

/** Just above the SCM entries (left priority 10000) and below the remote indicator (Number.MAX_VALUE). */
const FOLDER_LOCATION_STATUS_ENTRY_PRIORITY = 10000.1;

interface ILocationEntry {
	readonly uri: URI;
	readonly label: string;
	readonly description?: string;
	readonly icon: ThemeIcon;
}

/** The action widget item data: the widget starts on the `checked` item. */
interface IActionWidgetLocation extends ILocationEntry {
	readonly id: string;
	readonly checked: boolean;
	/** The label of the group whose row this is, the location it selects being what its submenu picks. */
	readonly groupLabel?: string;
}

/** The locations of one provider, under its label where it has one ({@link IFolderLocationGroup}). */
interface ILocationGroup {
	/** Its provider, which identifies its row: providers may share a label. */
	readonly providerId: string;
	readonly label: string | undefined;
	readonly entries: readonly ILocationEntry[];
}

/** The id prefix of the row of a group of locations, which its provider's id follows. */
const GROUP_ID_PREFIX = 'group:';

interface ILocationQuickPickItem extends IQuickPickItem {
	readonly uri: URI;
}

export const RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID = 'workbench.action.returnToPrimaryFolderLocation';
export const SWITCH_FOLDER_LOCATION_COMMAND_ID = 'workbench.action.switchFolderLocation';

/**
 * Shows the location of the workspace folder in the status bar while the folder is at an alternate location, and the folder
 * itself while it is at its own location and has alternate locations, such as worktrees, to switch to.
 */
export class FolderLocationStatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationStatusBar';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly introductionReady = observableValue<boolean>(this, false);
	private readonly introductionObservation = this._register(new MutableDisposable<DisposableStore>());
	/** Whether the folder at `primary` has alternate locations, as last looked up. */
	private alternates: { readonly primary: URI; readonly any: boolean } | undefined;
	private readonly alternatesLookup = this._register(new MutableDisposable());

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOnboardingScenarioService private readonly onboardingService: IOnboardingScenarioService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		this.registerIntroduction();

		this._register(this.folderLocationService.onDidChangeLocation(() => this.update()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => {
			this.update();
			this.lookUpAlternates();
		}));
		this._register(this.folderLocationService.onDidChangeLocations(() => this.lookUpAlternates()));
		this._register(this.folderLocationService.onDidChangeProviders(() => this.lookUpAlternates()));
		this._register(this.folderLocationService.onDidChangeCanSetLocation(() => this.lookUpAlternates()));
		this.update();
		// Looking up the alternate locations can run Git: not while the window starts
		this.alternatesLookup.value = runWhenWindowIdle(mainWindow, () => this.lookUpAlternates());
	}

	/** Looks up whether the folder has alternate locations, for the entry that shows while it is at its own location. */
	private lookUpAlternates(): void {
		const workspace = this.contextService.getWorkspace();
		const folder = workspace.folders[0];
		const primary = workspace.uri;
		if (!folder || !primary || !this.folderLocationService.canSetLocation(folder)) {
			this.alternatesLookup.clear();
			this.alternates = undefined;
			this.update();
			return;
		}
		const cts = new CancellationTokenSource();
		this.alternatesLookup.value = toDisposable(() => cts.dispose(true));
		this.folderLocationService.getLocations(primary, cts.token).then(locations => {
			if (!cts.token.isCancellationRequested) {
				this.alternates = { primary, any: locations.length > 0 };
				this.update();
			}
		}, error => {
			if (!cts.token.isCancellationRequested && !isCancellationError(error)) {
				onUnexpectedError(error);
			}
		});
	}

	/**
	 * Introduces the status bar entry the first time the folder is at an alternate location,
	 * with a spotlight anchored on the entry. The onboarding engine shows it once, announces it and
	 * dismisses it with Escape.
	 */
	private registerIntroduction(): void {
		this._register(registerOnboardingTargetProvider(FOLDER_LOCATION_INTRODUCTION_TARGET_ID, scope => {
			// The status bar names each item element after its entry id, but does not expose the element otherwise.
			// eslint-disable-next-line eslint-js/no-restricted-syntax -- see above
			const element = scope === undefined ? mainWindow.document.getElementById(FOLDER_LOCATION_STATUS_ENTRY_ID) : null;
			return element ? { element } : undefined;
		}));

		const scenario: IOnboardingScenario<ISpotlightPayload> = {
			id: FOLDER_LOCATION_INTRODUCTION_ID,
			trigger: { kind: 'observable', signal: this.introductionReady },
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [],
					resolveSteps: async () => [this.createIntroductionStep()]
				}
			}
		};
		this._register(onboardingScenarioRegistry.register(scenario));
	}

	private createIntroductionStep(): ISpotlightStep {
		const folder = this.contextService.getWorkspace().folders[0];
		const locationText = (folder && this.labelService.getFolderLocationLabel(folder.uri)) ?? '';
		return {
			id: 'folderLocation',
			targetId: FOLDER_LOCATION_INTRODUCTION_TARGET_ID,
			title: localize('folderLocationIntroductionTitle', "Folder Location"),
			description: localize('folderLocationSwitched', "The folder is now at the location '{0}'. Files, search, terminals and extensions use this location.", locationText),
			endTourLabel: localize('gotIt', "Got It"),
			focusEndTour: true,
			hideNext: true,
			placement: 'above',
			missingTarget: { kind: 'abort' }
		};
	}

	private update(): void {
		const workspace = this.contextService.getWorkspace();
		const folder = workspace.folders[0];
		const location = folder ? this.folderLocationService.getLocation(folder) : undefined;
		const identity = workspace.uri;
		// As the file system tells folders apart, such as by case on Windows
		const atPrimaryWithAlternates = !location && !!identity && !!this.alternates?.any && this.uriIdentityService.extUri.isEqual(this.alternates.primary, identity);
		if (!folder || !identity || (!location && !atPrimaryWithAlternates)) {
			this.entry.clear();
			this.introductionReady.set(false, undefined);
			this.introductionObservation.clear();
			return;
		}

		const primaryName = basename(identity);
		const command = { id: SWITCH_FOLDER_LOCATION_COMMAND_ID, title: localize('folderLocation', "Folder Location"), arguments: [FOLDER_LOCATION_STATUS_ENTRY_ID] };
		const props = location ? {
			name: localize('folderLocation', "Folder Location"),
			text: `$(${location.icon?.id ?? Codicon.gitBranchCheckout.id}) ${location.label}`,
			ariaLabel: localize('folderLocationAria', "Folder Location, {0}", this.labelService.getFolderLocationLabel(folder.uri)),
			tooltip: localize('folderLocationTooltip', "{0} (alternate location of '{1}')", this.labelService.getFolderLocationLabel(folder.uri), primaryName),
			command,
			kind: 'prominent' as const
		} : {
			// The folder itself, as the picker names it, to switch to one of its alternate locations
			name: localize('folderLocation', "Folder Location"),
			text: `$(${Codicon.folder.id}) ${primaryName}`,
			ariaLabel: localize('folderLocationAria', "Folder Location, {0}", primaryName),
			tooltip: localize('folderLocationPrimaryTooltip', "{0} (Switch Folder Location)", primaryName),
			command
		};

		if (this.entry.value) {
			this.entry.value.update(props);
		} else {
			this.entry.value = this.statusbarService.addEntry(props, FOLDER_LOCATION_STATUS_ENTRY_ID, StatusbarAlignment.LEFT, FOLDER_LOCATION_STATUS_ENTRY_PRIORITY);
		}
		// The introduction is about the folder being at an alternate location
		if (!location) {
			this.introductionReady.set(false, undefined);
			this.introductionObservation.clear();
		} else if (!this.introductionObservation.value && !this.onboardingService.hasBeenShown(FOLDER_LOCATION_INTRODUCTION_ID)) {
			this.observeIntroductionTarget();
		}
	}

	/**
	 * The introduction is ready only while the entry is rendered and visible, because
	 * the onboarding engine marks a scenario as seen before it resolves its target.
	 * Readiness is re-evaluated, once per frame, when something that can change it happens (the
	 * status bar resizes or changes visibility, the entry hides or shows) until the introduction
	 * is shown or consumed. The onboarding service has no event for that, so a coarse timer,
	 * paused while the window is hidden, notices it. Nothing runs while idle.
	 */
	private observeIntroductionTarget(): void {
		const store = new DisposableStore();
		const frame = store.add(new MutableDisposable());
		const check = () => {
			if (this.onboardingService.hasBeenShown(FOLDER_LOCATION_INTRODUCTION_ID)) {
				this.introductionObservation.clear();
				return;
			}
			this.introductionReady.set(!!resolveOnboardingTarget(mainWindow, FOLDER_LOCATION_INTRODUCTION_TARGET_ID), undefined);
		};
		const scheduleCheck = () => {
			if (!frame.value) {
				frame.value = scheduleAtNextAnimationFrame(mainWindow, () => {
					frame.clear();
					check();
				});
			}
		};

		const container = this.layoutService.getContainer(mainWindow, Parts.STATUSBAR_PART);
		if (container) {
			const resizeObserver = store.add(new DisposableResizeObserver('folderLocationIntroduction', scheduleCheck));
			store.add(resizeObserver.observe(container));
		}
		store.add(this.statusbarService.onDidChangeEntryVisibility(e => e.id === FOLDER_LOCATION_STATUS_ENTRY_ID && scheduleCheck()));
		store.add(this.layoutService.onDidChangePartVisibility(e => e.partId === Parts.STATUSBAR_PART && scheduleCheck()));
		store.add(new IntervalTimer()).cancelAndSet(() => {
			if (!mainWindow.document.hidden) {
				scheduleCheck();
			}
		}, FOLDER_LOCATION_INTRODUCTION_POLL_INTERVAL);

		scheduleCheck();
		this.introductionObservation.value = store;
	}
}

registerAction2(class ReturnToPrimaryFolderLocationAction extends Action2 {

	constructor() {
		super({
			id: RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID,
			title: localize2('returnToPrimaryFolderLocation', "Return to Primary Location"),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
		const identity = workspace.uri;
		if (identity && workspace.folders[0] && accessor.get(IWorkspaceFolderLocationService).isAtAlternateLocation(workspace.folders[0])) {
			await accessor.get(IWorkspaceEditingService).setFolderLocation(identity, { reason: 'user' });
		}
	}
});

registerAction2(class SwitchFolderLocationAction extends Action2 {

	constructor() {
		super({
			id: SWITCH_FOLDER_LOCATION_COMMAND_ID,
			title: localize2('switchFolderLocation', "Switch Folder Location..."),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, anchorElementId?: string): Promise<void> {
		const contextService = accessor.get(IWorkspaceContextService);
		const workspace = contextService.getWorkspace();
		const folder = workspace.folders[0];
		const primary = workspace.uri;
		if (!folder || !primary) {
			return;
		}
		const folderLocationService = accessor.get(IWorkspaceFolderLocationService);

		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const uriIdentityService = accessor.get(IUriIdentityService);

		// The status bar names each item element after its entry id, but does not expose the element otherwise.
		// eslint-disable-next-line eslint-js/no-restricted-syntax -- see above
		const anchor = anchorElementId ? mainWindow.document.getElementById(anchorElementId) : null;

		const isCurrentUri = (uri: URI) => uriIdentityService.extUri.isEqual(uri, folder.uri);
		const currentLocation = folderLocationService.getLocation(folder);
		// The folder itself: its name, as the window names it
		const primaryEntry: ILocationEntry = { uri: primary, label: basename(primary), icon: Codicon.folder };
		const toEntry = (location: IFolderLocation): ILocationEntry => ({ uri: location.uri, label: location.label, description: location.description, icon: location.icon ?? Codicon.gitBranchCheckout });
		// Seed the current location, in the group of its provider, so that accepting before the lookup resolves keeps it
		const seedGroups: ILocationGroup[] = currentLocation ? [{ providerId: currentLocation.providerId, label: currentLocation.group, entries: [{ ...toEntry(currentLocation), uri: folder.uri }] }] : [];
		const toGroups = (groups: readonly IFolderLocationGroup[]): ILocationGroup[] => groups.map(group => ({ providerId: group.providerId, label: group.label, entries: group.locations.map(toEntry) }));
		// The quick pick lists the folder and its locations as one list
		const toEntries = (groups: readonly ILocationGroup[]) => [primaryEntry, ...groups.flatMap(group => group.entries)];
		// What a location that is the current one says it is, also to screen readers
		const describe = (entry: ILocationEntry, current: boolean) => current ? (entry.description ? localize('currentLocationWithDescription', "{0} (Current)", entry.description) : localize('currentLocation', "Current")) : entry.description;

		const store = new DisposableStore();
		const cts = store.add(new CancellationTokenSource());
		// Show the picker right away: resolving the locations can take a while
		const loadLocations = (onResolved: (groups: ILocationGroup[]) => void, onDone: () => void) => {
			folderLocationService.getLocationGroups(primary, cts.token).then(groups => {
				if (!cts.token.isCancellationRequested) {
					onResolved(toGroups(groups));
				}
			}, error => {
				if (!cts.token.isCancellationRequested && !isCancellationError(error)) {
					onUnexpectedError(error);
				}
			}).finally(() => {
				if (!cts.token.isCancellationRequested) {
					onDone();
				}
			});
		};

		let picked: ILocationEntry | undefined;
		if (anchor) {
			const actionWidgetService = accessor.get(IActionWidgetService);
			const toLocationItem = (entry: ILocationEntry): IActionListItem<IActionWidgetLocation> => {
				const checked = isCurrentUri(entry.uri);
				return {
					kind: ActionListItemKind.Action,
					item: { ...entry, id: uriIdentityService.extUri.getComparisonKey(entry.uri), checked },
					label: entry.label,
					labelIcon: entry.icon,
					group: { title: '', icon: checked ? Codicon.check : Codicon.blank },
				};
			};
			// The locations of each provider, in a submenu under its label, or as rows of their own without one, then the folder.
			// Only the current location is checked: in its submenu, not the row of its group.
			const toActionItems = (groups: readonly ILocationGroup[]): IActionListItem<IActionWidgetLocation>[] => [
				...groups.flatMap((group): IActionListItem<IActionWidgetLocation>[] => {
					if (!group.label) {
						return group.entries.map(toLocationItem);
					}
					const shown = group.entries.find(entry => isCurrentUri(entry.uri)) ?? group.entries[0];
					// The row selects what its submenu picks
					const groupItem: { -readonly [K in keyof IActionWidgetLocation]: IActionWidgetLocation[K] } = { ...shown, description: undefined, id: `${GROUP_ID_PREFIX}${group.providerId}`, checked: false, groupLabel: group.label };
					return [{
						kind: ActionListItemKind.Action,
						item: groupItem,
						label: group.label,
						labelIcon: shown.icon,
						group: { title: '', icon: Codicon.blank },
						submenuActions: group.entries.map(entry => toAction({
							id: uriIdentityService.extUri.getComparisonKey(entry.uri),
							label: entry.label,
							tooltip: describe(entry, isCurrentUri(entry.uri)),
							checked: isCurrentUri(entry.uri),
							run: () => {
								groupItem.uri = entry.uri;
								groupItem.label = entry.label;
							}
						})),
						openSubmenuOnClick: true
					}];
				}),
				toLocationItem(primaryEntry),
			];
			picked = await new Promise<ILocationEntry | undefined>(resolve => {
				// It starts on the checked row, else the first, with no submenu open
				actionWidgetService.show<IActionWidgetLocation>(
					'folderLocationPicker',
					false,
					toActionItems(seedGroups),
					{
						onSelect: entry => {
							// Resolve first: hiding runs onHide synchronously, which would report a cancellation
							resolve(entry);
							actionWidgetService.hide();
						},
						onHide: () => {
							// The status bar item wrapper is not focusable, its label is
							const label = Array.from(anchor.children).find(child => child.classList.contains('statusbar-item-label')) as HTMLElement | undefined;
							(label ?? anchor).focus();
							resolve(undefined);
						}
					},
					anchor,
					undefined,
					[],
					{
						getAriaLabel: listItem => {
							const entry = listItem.item;
							if (!entry) {
								return '';
							}
							// The row of a group is named after it, not after the location it selects
							if (entry.groupLabel) {
								return entry.groupLabel;
							}
							const text = entry.description ? localize('folderLocationItemAria', "{0}, {1}", entry.label, entry.description) : entry.label;
							return entry.checked ? localize('folderLocationCurrentItemAria', "{0}, Current", text) : text;
						},
						getWidgetAriaLabel: () => localize('folderLocationPickerAria', "Folder Location")
					},
					// The status bar sits at the bottom, so size the list for the space above it. The label keeps its width, the description gives way
					{ preferredAnchorPosition: AnchorPosition.ABOVE, inlineDescription: true }
				);
				// An open submenu shows the resolved locations too
				loadLocations(groups => actionWidgetService.updateItems(toActionItems(groups), undefined, { preserveHover: true }), () => { });
			}).finally(() => {
				cts.cancel();
				store.dispose();
			});
		} else {
			const quickInputService = accessor.get(IQuickInputService);
			const toItem = (entry: ILocationEntry): ILocationQuickPickItem => ({
				uri: entry.uri,
				label: entry.label,
				iconClass: ThemeIcon.asClassName(entry.icon),
				description: describe(entry, isCurrentUri(entry.uri))
			});
			const quickPick = store.add(quickInputService.createQuickPick<ILocationQuickPickItem>({ useSeparators: false }));
			quickPick.placeholder = localize('switchFolderLocationPlaceholder', "Select a Location for the Folder");
			quickPick.matchOnDescription = true;
			const seedItems = toEntries(seedGroups).map(toItem);
			quickPick.items = seedItems;
			quickPick.activeItems = [seedItems[seedItems.length - 1]];
			quickPick.busy = true;
			const pickedItem = await new Promise<ILocationQuickPickItem | undefined>(resolve => {
				store.add(quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0])));
				store.add(quickPick.onDidHide(() => resolve(undefined)));
				quickPick.show();
				loadLocations(groups => {
					const items = toEntries(groups).map(toItem);
					quickPick.items = items;
					const currentItem = items.find(item => isCurrentUri(item.uri));
					if (currentItem) {
						quickPick.activeItems = [currentItem];
					}
				}, () => {
					quickPick.busy = false;
				});
			}).finally(() => {
				cts.cancel();
				store.dispose();
			});
			picked = pickedItem && { uri: pickedItem.uri, label: pickedItem.label ?? '', icon: Codicon.blank };
		}
		if (!picked) {
			return;
		}

		// Re-submitting the current location is deliberate: it supersedes a different switch that is still pending
		const currentIdentity = contextService.getWorkspace().uri;
		if (!currentIdentity || !uriIdentityService.extUri.isEqual(currentIdentity, primary)) {
			return;
		}

		await workspaceEditingService.setFolderLocation(picked.uri, { reason: 'user' });
	}
});
