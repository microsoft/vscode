/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { getRepositoryRootFromWorktree } from '../../../../../../platform/agentHost/common/worktreePaths.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { getSessionIsolationProperty } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { getCurrentFolderLocationDescription, getFolderLocationDetail, getNewWorktreeDetail, getNewWorktreeLabel, groupFolderLocations } from './agentHostFolderLocationSections.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { getLocalAgentHostSessionProvider } from './agentHostSessionUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/** What the folder chip shows for a folder, and which one it is. */
/** The icon of a worktree in the folder chip: New Worktree, the window's folder's worktrees, and the chip at one. */
const WORKTREE_ICON = Codicon.worktree;
/** The setting that shows the Agents window's sessions, with their workspace-less chats, in the Chat view. */

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
export const IAgentHostWorktreeLocationsCache = createDecorator<IAgentHostWorktreeLocationsCache>('agentHostWorktreeLocationsCache');

/**
 * The worktrees of the window's folder, read once for all the chat inputs and folder chips of the window that ask for them:
 * at the first ask, then again as the folder location service tells they changed, such as as a session comes to work in a
 * new worktree.
 */
export interface IAgentHostWorktreeLocationsCache {
	readonly _serviceBrand: undefined;
	/** Fires as it starts reading the worktrees again. */
	readonly onWillRefresh: Event<void>;
	/** Fires as it has read the worktrees again. */
	readonly onDidChange: Event<void>;
	/** Whether the window offers worktrees: in a window with a single local folder, while the setting is on. */
	isActive(): boolean;
	/** The worktrees as last read, empty until read: the first ask starts reading them. */
	getLocations(): readonly IFolderLocation[];
	/** Reads the worktrees again, such as one that a session created since. */
	refresh(): void;
}

/** A synchronous read cache of the location service's locations, fed only from that service, not a second source of them. */
export class AgentHostWorktreeLocationsCache extends Disposable implements IAgentHostWorktreeLocationsCache {

	declare readonly _serviceBrand: undefined;

	private _locations: readonly IFolderLocation[] = [];
	/** Whether anything asked for the worktrees: until then, nothing reads them. */
	private _asked = false;
	private readonly _refresh = this._register(new MutableDisposable());

	private readonly _onWillRefresh = this._register(new Emitter<void>());
	readonly onWillRefresh = this._onWillRefresh.event;
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
	) {
		super();
		const refreshIfAsked = () => {
			if (this._asked) {
				this.refresh();
			}
		};
		this._register(_folderLocationService.onDidChangeProviders(refreshIfAsked));
		this._register(_folderLocationService.onDidChangeLocation(refreshIfAsked));
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.EditorWindowEnableWorktree)) {
				refreshIfAsked();
			}
		}));
		// As its provider tells the worktrees changed, such as as a session comes to work in a new one
		this._register(_folderLocationService.onDidChangeLocations(refreshIfAsked));
	}

	isActive(): boolean {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return !!this._configurationService.getValue<boolean>(ChatConfiguration.EditorWindowEnableWorktree)
			&& this._workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER
			&& !!folder && !!this._workspaceContextService.getWorkspace().uri && this._folderLocationService.canSetLocation(folder);
	}

	getLocations(): readonly IFolderLocation[] {
		if (!this._asked) {
			this.refresh();
		}
		return this._locations;
	}

	refresh(): void {
		this._asked = true;
		this._onWillRefresh.fire();
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!primary || !this.isActive()) {
			this._refresh.clear();
			if (this._locations.length) {
				this._locations = [];
				this._onDidChange.fire();
			}
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
}

registerSingleton(IAgentHostWorktreeLocationsCache, AgentHostWorktreeLocationsCache, InstantiationType.Delayed);

export class AgentHostWorktreeFolderChoices extends Disposable {

	/**
	 * Whether folders it does not list are worktrees of the window's folder, by the window's folder and the folder, or still
	 * being resolved: read again as the worktrees are read again (see {@link refresh}), such as after a failed read.
	 */
	private readonly _provenWorktrees = new Map<string, boolean | 'resolving'>();
	/** Increases as the worktrees are read again: what resolved before then does not apply. */
	private _provenGeneration = 0;

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires as its choices or the selected one change. */
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly _sessionResource: () => URI | undefined,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IAgentHostWorktreeLocationsCache private readonly _locations: IAgentHostWorktreeLocationsCache,
	) {
		super();
		this._register(_locations.onWillRefresh(() => {
			this._provenWorktrees.clear();
			this._provenGeneration++;
		}));
		this._register(_locations.onDidChange(() => this._onDidChange.fire()));
		this._register(_provisional.onDidChange(() => this._onDidChange.fire()));
	}

	/** Whether the chip offers these choices: in a window with a single local folder, while the setting is on. */
	isActive(): boolean {
		return this._locations.isActive();
	}

	/** Reads the folder's worktrees again, such as one that a session created since. */
	refresh(): void {
		this._locations.refresh();
	}

	/** Whether the session is to work in a new worktree of its folder. */
	isNewWorktreeSelected(): boolean {
		const isolation = this._isolation();
		return !!isolation && isolation.values[isolation.key] === 'worktree';
	}

	/**
	 * Whether the session is known to work in its folder itself: its configuration has an isolation, and it is the in-place
	 * one. Not while its configuration or isolation is unknown, which {@link isNewWorktreeSelected} does not tell apart.
	 */
	isFolderSelected(): boolean {
		const isolation = this._isolation();
		return !!isolation?.inPlace && isolation.values[isolation.key] === isolation.inPlace;
	}

	/**
	 * Whether the chip would offer only the folder and New Worktree: the folder has no worktrees. A New Worktree checkbox then
	 * stands in for the chip.
	 */
	offersOnlyNewWorktree(): boolean {
		// The worktrees last, which reading costs: never for a chat input that would not offer the checkbox anyway
		return this.isActive()
			&& this.canWorkInNewWorktree()
			&& !this._choices().some(choice => choice.kind === 'worktree');
	}

	/**
	 * Whether the chip offers more than the folder the session works in already: a worktree or the folder at its own
	 * location, or New Worktree where no checkbox stands in for it. Not while the session's configuration, which says
	 * whether it can work in a new worktree, is still unknown, so that a chip with only the folder never shows.
	 */
	offersChoices(): boolean {
		return this.isActive()
			&& (this._choices().length > 1
				|| (this.canWorkInNewWorktree() && !this.offersOnlyNewWorktree()));
	}

	/** Whether the session can work in a new worktree of its folder: once its configuration, which says so, is known. */
	canWorkInNewWorktree(): boolean {
		return !!this._isolation()?.worktree;
	}

	/** Has the session work in a new worktree of its folder, or in the folder itself, as New Worktree and the folder do. */
	setNewWorktree(worktree: boolean): Promise<void> {
		return this._setIsolation(worktree);
	}

	/** Selects New Worktree for the session as the user answered before for such chats: not as their choice for this one. */
	preselectNewWorktree(): Promise<void> {
		return this._setIsolation(true, undefined, undefined, true);
	}

	/**
	 * The chip for the selected `folder`: by its icon, a folder or a worktree, and its name, or New Worktree by that name, with
	 * what it is for screen readers and on hover. The name shows at once; only the icon settles once git proves a worktree.
	 * `startedWorktree` is the worktree made for a session that started in a new worktree, which the chip then shows rather
	 * than New Worktree.
	 */
	getChip(folder: URI, startedWorktree?: URI): { readonly icon: ThemeIcon; readonly label: string; readonly description: string } {
		const choices = this._choices();
		const primary = choices.find(candidate => candidate.kind === 'folder');
		if (this.isNewWorktreeSelected()) {
			if (!startedWorktree) {
				return { icon: WORKTREE_ICON, label: getNewWorktreeLabel(), description: localize('agentHost.folderPicker.newWorktreeChipDescription', "New worktree of {0}", primary?.label ?? basename(folder)) };
			}
			folder = startedWorktree;
		}
		const choice = choices.find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate.uri, folder));
		const name = choice?.label ?? basename(folder);
		// A folder it does not list, such as the worktree a started session works in, is a worktree once git proves it one
		const worktree = choice ? choice.kind === 'worktree' : this._isProvenWorktree(folder);
		return worktree
			? { icon: WORKTREE_ICON, label: name, description: localize('agentHost.folderPicker.worktreeChipDescription', "Worktree: {0}", name) }
			: { icon: Codicon.folder, label: name, description: localize('agentHost.folderPicker.folderChipDescription', "Folder: {0}", name) };
	}

	/** The chip's choices, `selected` checked, unless the session is to work in a new worktree. */
	getActions(action: MenuItemAction, selected: URI | undefined, onDidPick: () => void): IActionWidgetDropdownAction[] {
		const newWorktreeSelected = this.isNewWorktreeSelected();
		// The folder and a new worktree of it first, each with what it does below its name; then the worktrees
		const workspaceGroup = { label: '', order: 0 };
		const worktreesGroup = { label: localize('agentHost.folderPicker.worktrees', "Worktrees"), order: 1, showHeader: true };
		let newWorktree: IActionWidgetDropdownAction | undefined;
		if (this._isolation()?.worktree) {
			newWorktree = {
				...action,
				id: 'agentHostFolder.newWorktree',
				label: getNewWorktreeLabel(),
				detail: getNewWorktreeDetail(),
				tooltip: localize('agentHost.folderPicker.newWorktreeDescription', "Start the session in a new worktree of the selected folder."),
				checked: newWorktreeSelected,
				icon: WORKTREE_ICON,
				enabled: true,
				category: workspaceGroup,
				run: async () => {
					await this._setIsolation(true);
					onDidPick();
				},
			};
		}
		const folders: IActionWidgetDropdownAction[] = [];
		const worktrees: IActionWidgetDropdownAction[] = [];
		for (const section of groupFolderLocations(this._choices().map(choice => ({ item: choice, kind: choice.kind, current: choice.current })))) {
			for (const choice of section.items) {
				(section.kind === 'worktree' ? worktrees : folders).push({
					...action,
					id: `agentHostFolder.${choice.uri.toString()}`,
					label: choice.label,
					detail: section.kind === 'worktree' ? undefined : getFolderLocationDetail(),
					description: choice.current ? getCurrentFolderLocationDescription() : undefined,
					checked: !newWorktreeSelected && !!selected && extUriBiasedIgnorePathCase.isEqual(selected, choice.uri),
					icon: choice.kind === 'worktree' ? WORKTREE_ICON : Codicon.folder,
					enabled: true,
					tooltip: choice.uri.fsPath,
					category: section.kind === 'worktree' ? worktreesGroup : workspaceGroup,
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
		}
		return [...folders, ...(newWorktree ? [newWorktree] : []), ...worktrees];
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
		const locations: IFolderLocation[] = this._locations.getLocations().filter(location => !extUriBiasedIgnorePathCase.isEqual(location.uri, primary));
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

	/**
	 * Whether `folder` is a worktree of the window's folder, as its location providers resolve it, such as by git's links
	 * between them. Until they answer, a folder named like a worktree VS Code creates for the window's folder,
	 * `<folder>.worktrees/<name>`, is assumed to be one and any other folder is not; the chip shows the answer once it settles.
	 */
	private _isProvenWorktree(folder: URI): boolean {
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!primary) {
			return false;
		}
		const repository = folder.scheme === Schemas.file ? getRepositoryRootFromWorktree(folder) : undefined;
		const assumed = !!repository && extUriBiasedIgnorePathCase.isEqual(repository, primary);
		const key = `${primary.toString()}\n${folder.toString()}`;
		const known = this._provenWorktrees.get(key);
		if (known === undefined) {
			this._provenWorktrees.set(key, 'resolving');
			const generation = this._provenGeneration;
			const settle = (worktree: boolean) => {
				if (generation !== this._provenGeneration || this._store.isDisposed) {
					return;
				}
				this._provenWorktrees.set(key, worktree);
				if (worktree !== assumed) {
					this._onDidChange.fire();
				}
			};
			this._folderLocationService.resolveLocation(primary, folder, CancellationToken.None).then(location => settle(!!location), error => {
				settle(false);
				onUnexpectedError(error);
			});
		}
		return known === undefined || known === 'resolving' ? assumed : known;
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
	private async _setIsolation(worktree: boolean, isolation = this._isolation(), folder?: URI, preselect = false): Promise<void> {
		const sessionResource = this._sessionResource();
		if (sessionResource && !preselect) {
			this._newSessionFolderService.setIsolationChosen(sessionResource);
		}
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
