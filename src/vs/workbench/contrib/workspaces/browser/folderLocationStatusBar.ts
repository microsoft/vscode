/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnimationFrameScheduler, DisposableResizeObserver } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
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
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { getFolderLocationText, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../onboarding/common/onboardingScenarioService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';

const FOLDER_LOCATION_INTRODUCTION_ID = 'workbench.folderLocation.introduction';
const FOLDER_LOCATION_INTRODUCTION_TARGET_ID = 'workbench.folderLocation.statusEntry';
const FOLDER_LOCATION_STATUS_ENTRY_ID = 'status.workspace.folderLocation';

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
		@ILayoutService private readonly layoutService: ILayoutService,
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
			const element = scope === undefined ? this.layoutService.mainContainer.ownerDocument.getElementById(FOLDER_LOCATION_STATUS_ENTRY_ID) : null;
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
			description: localize('folderLocationSwitched', "The folder is now at the location '{0}'. Files, search, terminals and extensions use this location, but open editors stay where they are.", locationText),
			primaryAction: {
				label: localize('returnToPrimaryNamed', "Return to {0}", primaryName),
				run: () => this.commandService.executeCommand(RETURN_TO_PRIMARY_FOLDER_LOCATION_COMMAND_ID),
				advance: true
			},
			endTourLabel: localize('gotIt', "Got It"),
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
			text: `$(${location.icon?.id ?? Codicon.location.id}) ${location.label}`,
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
	 * Readiness tracks the visibility of the entry until the introduction is actually shown
	 * (a queued introduction must not stay ready after the entry hides), and observation never starts once it was shown.
	 */
	private observeIntroductionTarget(): void {
		const store = new DisposableStore();
		const scheduler = store.add(new AnimationFrameScheduler(mainWindow.document.body, () => {
			if (this.onboardingService.hasBeenShown(FOLDER_LOCATION_INTRODUCTION_ID)) {
				this.introductionObservation.clear();
				return;
			}
			this.introductionReady.set(!!resolveOnboardingTarget(mainWindow, FOLDER_LOCATION_INTRODUCTION_TARGET_ID), undefined);
		}));
		const observer = store.add(new DisposableResizeObserver('FolderLocation.introductionTarget', () => scheduler.schedule()));
		// eslint-disable-next-line eslint-js/no-restricted-syntax -- the status bar names each item element after its entry id
		const element = mainWindow.document.getElementById(FOLDER_LOCATION_STATUS_ENTRY_ID);
		if (element) {
			store.add(observer.observe(element));
		}
		scheduler.schedule();
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
		const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
		const primary = folder?.primaryUri;
		if (!primary) {
			return;
		}

		const quickInputService = accessor.get(IQuickInputService);
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const uriIdentityService = accessor.get(IUriIdentityService);

		const locations = await accessor.get(IWorkspaceFolderLocationService).getLocations(primary, CancellationToken.None);
		const toItem = (uri: URI, label: string, description: string | undefined, icon: ThemeIcon): ILocationQuickPickItem => ({
			uri,
			label: `$(${icon.id}) ${label}`,
			description,
			picked: uriIdentityService.extUri.isEqual(uri, folder.uri)
		});
		const items: ILocationQuickPickItem[] = [
			toItem(primary, basename(primary), localize('primaryLocation', "Primary Location"), Codicon.folder),
			...locations.map(location => toItem(location.uri, location.label, location.description, location.icon ?? Codicon.location))
		];

		const picked = await quickInputService.pick(items, { placeHolder: localize('switchFolderLocationPlaceholder', "Select a Location for the Folder") });
		if (!picked || uriIdentityService.extUri.isEqual(picked.uri, folder.uri)) {
			return;
		}

		await workspaceEditingService.setFolderLocation(primary, uriIdentityService.extUri.isEqual(picked.uri, primary) ? undefined : picked.uri, { reason: 'user' });
	}
});
