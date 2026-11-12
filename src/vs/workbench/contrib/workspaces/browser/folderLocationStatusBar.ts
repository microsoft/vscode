/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableResizeObserver, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { getFolderLocationText, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
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

interface ILocationQuickPickItem extends IQuickPickItem {
	readonly uri: URI;
}

export const RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID = 'workbench.action.returnToPrimaryFolderLocation';
export const SWITCH_FOLDER_LOCATION_COMMAND_ID = 'workbench.action.switchFolderLocation';

/**
 * Shows the location of the workspace folder in the status bar while
 * the folder is at an alternate location.
 */
export class FolderLocationStatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationStatusBar';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly introductionReady = observableValue<boolean>(this, false);
	private readonly introductionObservation = this._register(new MutableDisposable<DisposableStore>());
	private primaryName: string | undefined;

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IOnboardingScenarioService private readonly onboardingService: IOnboardingScenarioService
	) {
		super();

		this.registerIntroduction();

		this._register(this.folderLocationService.onDidChangeCurrentLocation(() => this.update()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
		this.update();
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
		const location = this.folderLocationService.currentLocation;
		const primaryName = this.primaryName ?? '';
		const locationText = location ? getFolderLocationText(location) : '';
		return {
			id: 'folderLocation',
			targetId: FOLDER_LOCATION_INTRODUCTION_TARGET_ID,
			title: localize('folderLocationIntroductionTitle', "Folder Location"),
			description: localize('folderLocationSwitched', "The folder is now at the location '{0}'. Files, search, terminals and extensions use this location.", locationText),
			primaryAction: {
				label: localize('returnToPrimaryNamed', "Return to {0}", primaryName),
				run: () => this.commandService.executeCommand(RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID),
				advance: true
			},
			endTourLabel: localize('gotIt', "Got It"),
			focusEndTour: true,
			placement: 'above',
			missingTarget: { kind: 'abort' }
		};
	}

	private update(): void {
		const location = this.folderLocationService.currentLocation;
		const folder = this.contextService.getWorkspace().folders[0];
		if (!location || !folder?.primaryUri) {
			this.entry.clear();
			this.introductionReady.set(false, undefined);
			this.introductionObservation.clear();
			this.primaryName = undefined;
			return;
		}

		const primaryName = basename(folder.primaryUri);
		this.primaryName = primaryName;
		const props = {
			name: localize('folderLocation', "Folder Location"),
			text: `$(${location.icon?.id ?? Codicon.worktree.id}) ${location.label}`,
			ariaLabel: localize('folderLocationAria', "Folder Location, {0}", getFolderLocationText(location)),
			tooltip: localize('folderLocationTooltip', "{0} (alternate location of '{1}')", getFolderLocationText(location), primaryName),
			command: SWITCH_FOLDER_LOCATION_COMMAND_ID,
			kind: 'prominent' as const
		};

		if (this.entry.value) {
			this.entry.value.update(props);
		} else {
			this.entry.value = this.statusbarService.addEntry(props, FOLDER_LOCATION_STATUS_ENTRY_ID, StatusbarAlignment.LEFT, FOLDER_LOCATION_STATUS_ENTRY_PRIORITY);
			if (!this.onboardingService.hasBeenShown(FOLDER_LOCATION_INTRODUCTION_ID)) {
				this.observeIntroductionTarget();
			}
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
		const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
		if (folder?.primaryUri) {
			await accessor.get(IWorkspaceEditingService).setFolderLocation(folder.primaryUri, undefined, { reason: 'user' });
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

	async run(accessor: ServicesAccessor): Promise<void> {
		const contextService = accessor.get(IWorkspaceContextService);
		const folder = contextService.getWorkspace().folders[0];
		if (!folder) {
			return;
		}
		const primary = folder.primaryUri ?? folder.uri;

		const quickInputService = accessor.get(IQuickInputService);
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const uriIdentityService = accessor.get(IUriIdentityService);

		const toItem = (uri: URI, label: string, description: string | undefined, icon: ThemeIcon): ILocationQuickPickItem => {
			const isCurrent = uriIdentityService.extUri.isEqual(uri, folder.uri);
			return {
				uri,
				label,
				iconClass: ThemeIcon.asClassName(icon),
				description: isCurrent ? (description ? localize('currentLocationWithDescription', "{0} (Current)", description) : localize('currentLocation', "Current")) : description
			};
		};
		const primaryItem = toItem(primary, basename(primary), localize('primaryLocation', "Primary Location"), Codicon.folder);

		// Show the picker right away: resolving the locations can take a while
		const store = new DisposableStore();
		const quickPick = store.add(quickInputService.createQuickPick<ILocationQuickPickItem>({ useSeparators: false }));
		quickPick.placeholder = localize('switchFolderLocationPlaceholder', "Select a Location for the Folder");
		quickPick.matchOnDescription = true;
		// Seed the current location so that accepting before the lookup resolves keeps it
		const folderLocationService = accessor.get(IWorkspaceFolderLocationService);
		const currentLocation = folderLocationService.currentLocation;
		const currentSeed = folder.primaryUri && currentLocation ? toItem(folder.uri, currentLocation.label, currentLocation.description, currentLocation.icon ?? Codicon.worktree) : undefined;
		const seedItems = currentSeed ? [primaryItem, currentSeed] : [primaryItem];
		quickPick.items = seedItems;
		quickPick.activeItems = [currentSeed ?? primaryItem];
		quickPick.busy = true;
		const cts = store.add(new CancellationTokenSource());
		const picked = await new Promise<ILocationQuickPickItem | undefined>(resolve => {
			store.add(quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0])));
			store.add(quickPick.onDidHide(() => resolve(undefined)));
			quickPick.show();
			folderLocationService.getLocations(primary, cts.token).then(locations => {
				if (cts.token.isCancellationRequested) {
					return;
				}
				const items = [primaryItem, ...locations.map(location => toItem(location.uri, location.label, location.description, location.icon ?? Codicon.worktree))];
				quickPick.items = items;
				const currentItem = items.find(item => uriIdentityService.extUri.isEqual(item.uri, folder.uri));
				if (currentItem) {
					quickPick.activeItems = [currentItem];
				}
				quickPick.busy = false;
			}, error => {
				if (!cts.token.isCancellationRequested) {
					quickPick.busy = false;
					if (!isCancellationError(error)) {
						onUnexpectedError(error);
					}
				}
			});
		}).finally(() => {
			cts.cancel();
			store.dispose();
		});
		if (!picked) {
			return;
		}

		// Re-submitting the current location is deliberate: it supersedes a different switch that is still pending
		const current = contextService.getWorkspace().folders[0];
		if (!current || !uriIdentityService.extUri.isEqual(current.primaryUri ?? current.uri, primary)) {
			return;
		}

		await workspaceEditingService.setFolderLocation(primary, uriIdentityService.extUri.isEqual(picked.uri, primary) ? undefined : picked.uri, { reason: 'user' });
	}
});
