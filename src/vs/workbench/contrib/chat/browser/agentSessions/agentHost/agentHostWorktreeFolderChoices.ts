/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { getSessionIsolationProperty } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { getCurrentFolderLocationDescription, getNewWorktreeLabel, groupFolderLocations } from '../../../../../services/workspaces/common/folderLocationSections.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { IAgentHostWorktreeSessionSources } from './agentHostWorktreeSessionSources.js';
import { getLocalAgentHostSessionProvider } from './agentHostSessionUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/** What the folder chip shows for a folder, and which one it is. */
interface IFolderChoice {
	readonly uri: URI;
	readonly label: string;
	readonly kind: 'folder' | 'worktree';
	readonly current: boolean;
}

/**
 * The choices of the folder chip of a new agent host session in a window with a single local folder, while
 * `chat.editorWindow.enableWorktree` is on: New Worktree, then the window's folder and the worktrees that sessions work in,
 * in the sections that every such picker shows (see `groupFolderLocations`). Picking the folder or a worktree makes it
 * the session's working directory; New Worktree has the session work in a new worktree of the folder.
 */
export class AgentHostWorktreeFolderChoices extends Disposable {

	/** The folder's worktrees, read ahead of time, as the chip asks for its choices synchronously. */
	private _locations: readonly IFolderLocation[] = [];
	private readonly _refresh = this._register(new MutableDisposable());

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires as its choices or the selected one change. */
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly _sessionResource: () => URI | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@IAgentHostWorktreeSessionSources sessionSources: IAgentHostWorktreeSessionSources,
	) {
		super();
		this._register(_folderLocationService.onDidChangeProviders(() => this.refresh()));
		this._register(_folderLocationService.onDidChangeLocation(() => this.refresh()));
		// A session can come to work in a new worktree meanwhile, such as one in the background
		const refreshForSessions = this._register(new RunOnceScheduler(() => this.refresh(), 500));
		this._register(Event.any(agentSessionsService.model.onDidChangeSessions, sessionSources.onDidChange)(() => {
			if (this.isActive()) {
				refreshForSessions.schedule();
			}
		}));
		this._register(_provisional.onDidChange(() => this._onDidChange.fire()));
		this.refresh();
	}

	/** Whether the chip offers these choices: in a window with a single local folder, while the setting is on. */
	isActive(): boolean {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return !!this._configurationService.getValue<boolean>(ChatConfiguration.EditorWindowEnableWorktree)
			&& this._workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER
			&& !!folder && !!this._workspaceContextService.getWorkspace().uri && this._folderLocationService.canSetLocation(folder);
	}

	/** Reads the folder's worktrees again, such as one that a session created since. */
	refresh(): void {
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!primary || !this.isActive()) {
			this._refresh.clear();
			this._locations = [];
			return;
		}
		const source = new CancellationTokenSource();
		this._refresh.value = toDisposable(() => source.dispose(true));
		this._folderLocationService.getLocations(primary, source.token).then(locations => {
			if (!source.token.isCancellationRequested) {
				this._locations = locations;
				this._onDidChange.fire();
			}
		}, onUnexpectedError);
	}

	/** Whether the session is to work in a new worktree of its folder. */
	isNewWorktreeSelected(): boolean {
		const isolation = this._isolation();
		return !!isolation && isolation.values[isolation.key] === 'worktree';
	}

	/** The label of the chip for the selected `folder`: by its name, or as a new worktree of it. */
	getLabel(folder: URI): string {
		const name = this._choices().find(choice => extUriBiasedIgnorePathCase.isEqual(choice.uri, folder))?.label ?? basename(folder);
		return this.isNewWorktreeSelected() ? localize('agentHost.folderPicker.newWorktree', "{0} - New Worktree", name) : name;
	}

	/** The chip's choices, `selected` checked, unless the session is to work in a new worktree. */
	getActions(action: MenuItemAction, selected: URI | undefined, onDidPick: () => void): IActionWidgetDropdownAction[] {
		const newWorktreeSelected = this.isNewWorktreeSelected();
		const actions: IActionWidgetDropdownAction[] = [];
		if (this._isolation()?.worktree) {
			actions.push({
				...action,
				id: 'agentHostFolder.newWorktree',
				label: getNewWorktreeLabel(),
				tooltip: localize('agentHost.folderPicker.newWorktreeDescription', "Start the session in a new worktree of the selected folder."),
				checked: newWorktreeSelected,
				icon: Codicon.gitBranchCheckout,
				enabled: true,
				category: { label: '', order: 0 },
				run: async () => {
					await this._setIsolation(true);
					onDidPick();
				},
			});
		}
		const sections = groupFolderLocations(this._choices().map(choice => ({ item: choice, kind: choice.kind, current: choice.current })));
		sections.forEach((section, index) => {
			for (const choice of section.items) {
				actions.push({
					...action,
					id: `agentHostFolder.${choice.uri.toString()}`,
					label: choice.label,
					description: choice.current ? getCurrentFolderLocationDescription() : undefined,
					checked: !newWorktreeSelected && !!selected && extUriBiasedIgnorePathCase.isEqual(selected, choice.uri),
					icon: choice.kind === 'worktree' ? Codicon.gitBranchCheckout : Codicon.folder,
					enabled: true,
					tooltip: choice.uri.fsPath,
					category: { label: section.title, order: index + 1, showHeader: true },
					run: async () => {
						const sessionResource = this._sessionResource();
						// Read before the folder changes, which resets the session's configuration
						const isolation = this._isolation();
						if (sessionResource) {
							this._newSessionFolderService.setFolder(sessionResource, choice.uri);
						}
						await this._setIsolation(false, isolation, choice.uri);
						onDidPick();
					},
				});
			}
		});
		return actions;
	}

	/** The window's folder at its own location, and its worktrees, with where the folder is now. */
	private _choices(): IFolderChoice[] {
		const workspace = this._workspaceContextService.getWorkspace();
		const primary = workspace.uri;
		const folder = workspace.folders[0];
		if (!primary || !folder) {
			return [];
		}
		const isCurrent = (uri: URI) => extUriBiasedIgnorePathCase.isEqual(uri, folder.uri);
		const locations: IFolderLocation[] = this._locations.filter(location => !extUriBiasedIgnorePathCase.isEqual(location.uri, primary));
		// Where the folder is now, also a worktree that no session works in any more
		const current = this._folderLocationService.getLocation(folder);
		if (current && !isCurrent(primary) && !locations.some(location => isCurrent(location.uri))) {
			locations.push(current);
		}
		return [
			{ uri: primary, label: basename(primary), kind: 'folder', current: isCurrent(primary) },
			...locations.map(location => ({ uri: location.uri, label: location.label, kind: 'worktree' as const, current: isCurrent(location.uri) })),
		];
	}

	/** The session's isolation property and values, with whether it can work in a new worktree. */
	private _isolation(): { readonly key: string; readonly values: Readonly<Record<string, unknown>>; readonly worktree: boolean; readonly inPlace: string | undefined } | undefined {
		const sessionResource = this._sessionResource();
		const config = sessionResource && (this._provisional.getResolvedConfig(sessionResource) ?? this._provisional.getPreparedSessionConfig(sessionResource));
		const property = config ? getSessionIsolationProperty(config.schema) : undefined;
		if (!config || !property) {
			return undefined;
		}
		const values = property.schema.enum ?? [];
		return { key: property.key, values: config.values, worktree: values.includes('worktree'), inPlace: values.find(value => value !== 'worktree') as string | undefined };
	}

	/** Has the session work in a new worktree of its folder, or in the folder itself. */
	private async _setIsolation(worktree: boolean, isolation = this._isolation(), folder?: URI): Promise<void> {
		const sessionResource = this._sessionResource();
		const provider = sessionResource && getLocalAgentHostSessionProvider(sessionResource);
		const value = worktree ? (isolation?.worktree ? 'worktree' : undefined) : isolation?.inPlace;
		if (!sessionResource || !provider || !isolation || !value || isolation.values[isolation.key] === value) {
			return;
		}
		const workingDirectory = folder ?? this._newSessionFolderService.getFolder(sessionResource) ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
		await this._provisional.applyConfigChange(sessionResource, provider, workingDirectory, { [isolation.key]: value });
		this._onDidChange.fire();
	}
}
