/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/worktreeSuggestion.css';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableFromEvent, observableSignal, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, ONBOARDING_ENABLED_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { isDevContainerWorktreeEnabled } from '../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionFileChange, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { ISessionChangesService } from '../../changes/common/sessionChangesService.js';
import { createWorktreeSuggestionTour } from '../../onboardingTours/browser/tours/worktreeSuggestionTour.js';
import { isWorktreeSuggestionVariant, WORKTREE_SUGGESTION_MIN_CREATED_SESSIONS, WORKTREE_SUGGESTION_SETTING, WORKTREE_SUGGESTION_TOUR_ID, WorktreeSuggestionVariant } from '../common/worktreeSuggestion.js';
import { formatChangeStats, getChangedFileAriaDescription, getChangedFileLabel, getChangedFilesRoot, getChangedFileUri, getMoreFilesLabel, getSendInWorktreeLabel, getSendLabel, getUncommittedChangesMessage } from './worktreeSuggestionPresentation.js';

/** A new session that would start in a folder with uncommitted changes. */
export interface IWorktreeSuggestion {
	readonly session: IActiveSession;
	/** Number of files with uncommitted changes in the session's folder. */
	readonly uncommittedChanges: number;
	/** The folder's checked-out branch, when known. */
	readonly branchName: string | undefined;
}

/** A row that lists uncommitted files of a suggestion, which opens them when chosen. */
export interface IUncommittedChangesListItem {
	readonly run: () => void;
}

/** What the user chose in the spotlight that appears as they send a request. */
export const enum WorktreeSpotlightChoice {
	/** Send the request in a new worktree. */
	Worktree = 'worktree',
	/** Send the request on the branch. */
	Branch = 'branch',
}

export function worktreeSuggestionEquals(a: IWorktreeSuggestion | undefined, b: IWorktreeSuggestion | undefined): boolean {
	return a === b || !!a && !!b
		&& a.session === b.session
		&& a.uncommittedChanges === b.uncommittedChanges
		&& a.branchName === b.branchName;
}

export interface IWorktreeSuggestionService {
	readonly _serviceBrand: undefined;

	/** The presentation selected by {@link WORKTREE_SUGGESTION_SETTING}, or by a developer preview. */
	readonly variant: IObservable<WorktreeSuggestionVariant>;

	/** Whether a developer preview of a presentation is active in this window. */
	readonly isPreviewing: IObservable<boolean>;

	/**
	 * The suggestion every arm would make for `session`: a new session with Branch isolation in a folder
	 * with uncommitted changes, for someone who already started a few sessions, where New Worktree is
	 * available. It ignores state that only the treatments write, such as a closed hint or a spotlight
	 * that was already shown, so it can decide the experiment trigger.
	 */
	getSuggestion(session: IActiveSession | undefined, reader: IReader | undefined): IWorktreeSuggestion | undefined;

	/** Logs the experiment trigger once a suggestion would appear in any arm. */
	reportWouldShow(): void;

	/** Records that `variant` presented the suggestion for its session. */
	markShown(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void;

	/** Records that the user opened the isolation picker from the suggestion, or to list its uncommitted files. */
	markOpened(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void;

	/** Records that the user chose New Worktree for the session while `variant` presented the suggestion. */
	markAccepted(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void;

	/** Records that the user kept Branch isolation for the session while `variant` presented the suggestion. */
	decline(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void;

	/** Whether the user kept Branch isolation for the suggestion's session while `variant` presented it, in this window. */
	hasDeclined(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, reader: IReader | undefined): boolean;

	/**
	 * Switches the session to a new worktree and records the acceptance. Reports a failure to the user
	 * and resolves to `false` instead of rejecting.
	 */
	useWorktree(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): Promise<boolean>;

	/**
	 * The files with uncommitted changes in the suggestion's folder, as the provider reports them in the
	 * session's uncommitted changes. `undefined` while they load, or when the provider does not report them.
	 */
	getUncommittedChanges(suggestion: IWorktreeSuggestion, reader: IReader | undefined): readonly ISessionFileChange[] | undefined;

	/** Opens the suggestion's uncommitted changes in the Changes editor and view, revealing `change` when given. */
	reviewChanges(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, change?: ISessionFileChange): Promise<void>;

	/**
	 * The rows that list up to `maxFiles` of the suggestion's uncommitted files, which a picker can show among
	 * its options, followed by a row that stands for the rest and opens all of them. A single remaining file
	 * is listed instead.
	 */
	getUncommittedChangesListItems(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, maxFiles: number): IActionListItem<IUncommittedChangesListItem>[];

	/** Whether the user closed the inline hint, which then never shows again. */
	isHintClosed(reader: IReader | undefined): boolean;

	/** Stops showing the inline hint. */
	closeHint(suggestion: IWorktreeSuggestion): void;

	/** Whether the spotlight may still run: once per user while automatic onboarding is enabled, or in a preview. */
	canShowSpotlight(): boolean;

	/**
	 * Spotlights the isolation picker as the user sends a request, offering to send it in a new worktree.
	 * `reveal` first shows the picker if it is collapsed. Escape sends it on Branch. Resolves to the user's
	 * choice, or `undefined` when the spotlight could not show, for example while another one does.
	 * A preview, or a spotlight that could not show, leaves the user's one-time spotlight to show later.
	 */
	showSendSpotlight(suggestion: IWorktreeSuggestion, options: { readonly reveal: () => void }): Promise<WorktreeSpotlightChoice | undefined>;

	/**
	 * Previews `variant` in this window regardless of usage and earlier responses, which the preview neither
	 * reads nor changes. The inline hint shows in a preview even before the user started enough sessions for
	 * the banners below the input. `undefined` ends the preview.
	 */
	setPreview(variant: WorktreeSuggestionVariant | undefined): void;

	/** Forgets earlier responses, so a closed hint and a spotlight that was shown can appear again. */
	reset(): void;
}

export const IWorktreeSuggestionService = createDecorator<IWorktreeSuggestionService>('worktreeSuggestionService');

const STATE_STORAGE_KEY = 'sessions.worktreeSuggestion.state';

interface IWorktreeSuggestionState {
	/** Whether the user closed the inline hint. */
	readonly hintClosed: boolean;
}

const INITIAL_STATE: IWorktreeSuggestionState = { hintClosed: false };

type WorktreeSuggestionAction = 'shown' | 'opened' | 'reviewed' | 'accepted' | 'declined' | 'dismissed';

type WorktreeSuggestionEvent = {
	variant: string;
	action: WorktreeSuggestionAction;
	uncommittedChanges: number;
};

type WorktreeSuggestionClassification = {
	owner: 'benibenj';
	comment: 'Tracks exposure to and interaction with the suggestion to start a new Agents window session in a new worktree when its folder has uncommitted changes.';
	variant: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the suggestion was presented: spotlightOnSend, inlineHint, or uncommittedFilesCount.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the suggestion was shown, opened the isolation picker or listed the uncommitted files in it, was used to review the uncommitted changes, was accepted or declined for the session, or was closed for good (the inline hint).' };
	uncommittedChanges: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files with uncommitted changes in the folder of the new session.' };
};

export class WorktreeSuggestionService extends Disposable implements IWorktreeSuggestionService {
	declare readonly _serviceBrand: undefined;

	private readonly _preview = observableValue<WorktreeSuggestionVariant | undefined>(this, undefined);
	readonly isPreviewing = derived(this, reader => this._preview.read(reader) !== undefined);
	readonly variant: IObservable<WorktreeSuggestionVariant>;

	private readonly _experienced: IObservable<boolean>;
	private readonly _phoneLayout: IObservable<boolean>;
	private readonly _stateChanged: IObservable<void>;
	/** Fires for every session config change, which includes a draft switching to Dev Container execution. */
	private readonly _sessionConfigChanged = observableSignal(this);
	/** The state of the current preview, which starts afresh and is never stored. */
	private readonly _previewState = observableValue<IWorktreeSuggestionState>(this, INITIAL_STATE);
	/** The variants and sessions for which the user kept Branch isolation, as `variant:sessionId`. */
	private readonly _declined = observableValue<ReadonlySet<string>>(this, new Set());
	/** `action:variant:sessionId` triples already reported in this window. */
	private readonly _reported = new Set<string>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IOnboardingScenarioService private readonly _onboardingService: IOnboardingScenarioService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const configuredVariant = observableConfigValue<string>(WORKTREE_SUGGESTION_SETTING, WorktreeSuggestionVariant.Off, _configurationService);
		this.variant = derived(this, reader => {
			const preview = this._preview.read(reader);
			if (preview !== undefined) {
				return preview;
			}
			const configured = configuredVariant.read(reader);
			return isWorktreeSuggestionVariant(configured) ? configured : WorktreeSuggestionVariant.Off;
		});

		const usage = new AgentsWindowUsage(_storageService);
		this._experienced = observableFromEvent(this, usage.onDidChangeCreatedSessionCount(this._store), () => usage.createdSessionCount >= WORKTREE_SUGGESTION_MIN_CREATED_SESSIONS);
		const phoneLayoutKeys = new Set([IsPhoneLayoutContext.key]);
		this._phoneLayout = observableFromEvent(this,
			Event.filter(contextKeyService.onDidChangeContext, event => event.affectsSome(phoneLayoutKeys)),
			() => IsPhoneLayoutContext.getValue(contextKeyService) === true);
		this._stateChanged = observableSignalFromEvent(this, _storageService.onDidChangeValue(StorageScope.PROFILE, STATE_STORAGE_KEY, this._store));

		const providerListeners = this._register(new DisposableMap<string>());
		const watchProviders = (providers: readonly ISessionsProvider[]) => {
			for (const provider of providers) {
				if (isAgentHostProvider(provider) && !providerListeners.has(provider.id)) {
					providerListeners.set(provider.id, provider.onDidChangeSessionConfig(() => this._sessionConfigChanged.trigger(undefined)));
				}
			}
		};
		this._register(_sessionsProvidersService.onDidChangeProviders(event => {
			for (const provider of event.removed) {
				providerListeners.deleteAndDispose(provider.id);
			}
			watchProviders(event.added);
		}));
		watchProviders(_sessionsProvidersService.getProviders({ includeSessionBackends: true }));
	}

	getSuggestion(session: IActiveSession | undefined, reader: IReader | undefined): IWorktreeSuggestion | undefined {
		if (!session || this._chatEntitlementService.sentimentObs.read(reader).hidden) {
			return undefined;
		}
		if (!this._experienced.read(reader) && this._preview.read(reader) === undefined) {
			return undefined;
		}
		// The phone composer opens a combined repository sheet that none of the presentations support.
		if (this._phoneLayout.read(reader)) {
			return undefined;
		}
		if (session.isCreated.read(reader) || session.loading.read(reader)
			|| session.isNewSessionRequestInProgress?.read(reader) || session.isQuickChat?.read(reader)) {
			return undefined;
		}
		// Only providers that report the isolation pick of a draft can show and change it.
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!session.worktreePending || session.worktreePending.read(reader) || !provider?.setIsolationMode) {
			return undefined;
		}
		const workspace = session.workspace.read(reader);
		// New Worktree is unavailable for drafts that run on a Dev Container without worktree support.
		this._sessionConfigChanged.read(reader);
		if (isAgentHostProvider(provider) && provider.isDevContainerEnabled?.(session.sessionId) === true
			&& !isDevContainerWorktreeEnabled(workspace?.uri, this._configurationService)) {
			return undefined;
		}
		const repository = workspace && !workspace.isVirtualWorkspace ? workspace.folders[0]?.gitRepository : undefined;
		// `undefined` means the host has not reported the folder's Git state, which is never treated as dirty.
		const uncommittedChanges = repository?.uncommittedChanges ?? 0;
		if (uncommittedChanges <= 0) {
			return undefined;
		}
		return { session, uncommittedChanges, branchName: repository?.branchName };
	}

	reportWouldShow(): void {
		if (this._preview.get() === undefined) {
			logSettingExperimentTrigger(this._telemetryService, WORKTREE_SUGGESTION_SETTING);
		}
	}

	markShown(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void {
		this._report(variant, 'shown', suggestion);
	}

	markOpened(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void {
		this._report(variant, 'opened', suggestion);
	}

	markAccepted(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void {
		this._report(variant, 'accepted', suggestion);
	}

	decline(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): void {
		const key = `${variant}:${suggestion.session.sessionId}`;
		const declined = this._declined.get();
		if (!declined.has(key)) {
			this._declined.set(new Set([...declined, key]), undefined);
		}
		this._report(variant, 'declined', suggestion);
	}

	hasDeclined(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, reader: IReader | undefined): boolean {
		return this._declined.read(reader).has(`${variant}:${suggestion.session.sessionId}`);
	}

	async useWorktree(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion): Promise<boolean> {
		try {
			const provider = this._sessionsProvidersService.getProvider(suggestion.session.providerId);
			if (!provider?.setIsolationMode) {
				throw new Error(`Provider '${suggestion.session.providerId}' cannot change the isolation of a new session.`);
			}
			await provider.setIsolationMode(suggestion.session.sessionId, 'worktree');
		} catch (error) {
			this._logService.error('[WorktreeSuggestion] Failed to switch the new session to a worktree', error);
			this._notificationService.error(localize('worktreeSuggestion.switchFailed', "Couldn't switch this session to a new worktree. Choose New Worktree in the isolation picker instead."));
			return false;
		}
		this.markAccepted(variant, suggestion);
		status(localize('worktreeSuggestion.switched', "This session will start in a new worktree."));
		return true;
	}

	getUncommittedChanges(suggestion: IWorktreeSuggestion, reader: IReader | undefined): readonly ISessionFileChange[] | undefined {
		const changeset = suggestion.session.activeChat.read(reader).changesets.read(reader)
			?.find(candidate => candidate.id === UNCOMMITTED_CHANGES_CHANGESET_ID && candidate.isEnabled.read(reader));
		if (!changeset || changeset.isLoadingChanges.read(reader)) {
			return undefined;
		}
		const changes = changeset.changes.read(reader);
		return changes.length > 0 ? changes : undefined;
	}

	async reviewChanges(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, change?: ISessionFileChange): Promise<void> {
		this._report(variant, 'reviewed', suggestion);
		// Like the branch picker's Show Changes, the desktop layout shows the diffs beside the composer.
		if (this._layoutService.agentWorkbenchLayout === AgentWorkbenchLayout.Desktop) {
			this._layoutService.revealEditorPartExplicitly();
			const suppression = this._layoutService.suppressEditorPartAutoVisibility();
			try {
				await this._sessionChangesService.openChangesEditor(suggestion.session.resource, {
					changesetSelection: { kind: 'id', id: UNCOMMITTED_CHANGES_CHANGESET_ID },
					...(change ? { viewState: { revealData: { resource: { original: change.originalUri, modified: change.modifiedUri } } } } : {}),
				});
			} finally {
				suppression.dispose();
			}
		}
		await this._viewsService.openView(CHANGES_VIEW_ID, false);
	}

	getUncommittedChangesListItems(variant: WorktreeSuggestionVariant, suggestion: IWorktreeSuggestion, maxFiles: number): IActionListItem<IUncommittedChangesListItem>[] {
		const changes = this.getUncommittedChanges(suggestion, undefined) ?? [];
		// A row that stands for one more file would take that file's place, so the file is listed instead.
		const listed = changes.length <= maxFiles + 1 ? changes : changes.slice(0, maxFiles);
		const root = getChangedFilesRoot(suggestion);
		const items: IActionListItem<IUncommittedChangesListItem>[] = listed.map(change => {
			const label = getChangedFileLabel(change, root);
			const { insertions, deletions } = formatChangeStats(change);
			return {
				kind: ActionListItemKind.Action,
				label: label.name,
				iconClasses: getIconClasses(this._modelService, this._languageService, getChangedFileUri(change), FileKind.FILE),
				additionalBadges: [{ label: insertions, className: 'insertions' }, { label: deletions, className: 'deletions' }],
				// The row leaves out the file's folder to stay compact, so its tooltip and screen readers name it.
				ariaDescription: getChangedFileAriaDescription(change, label),
				tooltip: label.path,
				// Rows are styled as changed files wherever a picker lists them.
				className: 'worktree-suggestion-changed-file show-file-icons',
				item: { run: () => void this.reviewChanges(variant, suggestion, change) },
			};
		});
		const moreFiles = changes.length - listed.length;
		if (moreFiles > 0) {
			items.push({
				kind: ActionListItemKind.Action,
				label: getMoreFilesLabel(moreFiles),
				// A file icon that is never drawn keeps the label in line with the file names.
				iconClasses: ['file-icon'],
				className: 'worktree-suggestion-more-files show-file-icons',
				item: { run: () => void this.reviewChanges(variant, suggestion) },
			});
		}
		return items;
	}

	isHintClosed(reader: IReader | undefined): boolean {
		return this._getState(reader).hintClosed;
	}

	closeHint(suggestion: IWorktreeSuggestion): void {
		this._updateState({ hintClosed: true });
		this._report(WorktreeSuggestionVariant.InlineHint, 'dismissed', suggestion);
	}

	canShowSpotlight(): boolean {
		return this._preview.get() !== undefined
			|| this._configurationService.getValue<boolean>(ONBOARDING_ENABLED_CONFIG) !== false && !this._onboardingService.hasBeenShown(WORKTREE_SUGGESTION_TOUR_ID);
	}

	async showSendSpotlight(suggestion: IWorktreeSuggestion, options: { readonly reveal: () => void }): Promise<WorktreeSpotlightChoice | undefined> {
		// Another composer may be presenting it, or another onboarding may be showing.
		if (onboardingScenarioRegistry.getScenario(WORKTREE_SUGGESTION_TOUR_ID) || this._onboardingService.isPresenting.get()) {
			return undefined;
		}
		const store = new DisposableStore();
		const previewing = this._preview.get() !== undefined;
		/** Whether the user had been shown the spotlight before this run, once known. */
		let shownBefore: boolean | undefined;
		let sendInWorktree = false;
		let shown = false;
		try {
			store.add(onboardingScenarioRegistry.register(createWorktreeSuggestionTour({
				changes: getUncommittedChangesMessage(suggestion),
				sendInWorktreeLabel: getSendInWorktreeLabel(),
				sendLabel: getSendLabel(),
				reveal: options.reveal,
				sendInWorktree: () => sendInWorktree = true,
				onDidShow: () => {
					shown = true;
					this.markShown(WorktreeSuggestionVariant.SpotlightOnSend, suggestion);
				},
			})));
			shownBefore = this._onboardingService.hasBeenShown(WORKTREE_SUGGESTION_TOUR_ID);
			const outcome = await this._onboardingService.runScenario(WORKTREE_SUGGESTION_TOUR_ID);
			if (!shown) {
				return undefined;
			}
			if (sendInWorktree) {
				return WorktreeSpotlightChoice.Worktree;
			}
			if (outcome === OnboardingOutcome.Aborted) {
				return undefined;
			}
			this.decline(WorktreeSuggestionVariant.SpotlightOnSend, suggestion);
			return WorktreeSpotlightChoice.Branch;
		} finally {
			// The engine records a run as shown before it finds the target. A spotlight that never appeared may
			// still show, and a preview leaves the spotlight the user may still be shown as it was.
			if (shownBefore === false && (previewing || !shown)) {
				this._onboardingService.reset(WORKTREE_SUGGESTION_TOUR_ID);
			}
			store.dispose();
		}
	}

	setPreview(variant: WorktreeSuggestionVariant | undefined): void {
		this._reported.clear();
		transaction(tx => {
			this._previewState.set(INITIAL_STATE, tx);
			this._declined.set(new Set(), tx);
			this._preview.set(variant, tx);
		});
	}

	reset(): void {
		this._reported.clear();
		transaction(tx => {
			this._previewState.set(INITIAL_STATE, tx);
			this._declined.set(new Set(), tx);
		});
		this._storageService.remove(STATE_STORAGE_KEY, StorageScope.PROFILE);
		this._onboardingService.reset(WORKTREE_SUGGESTION_TOUR_ID);
	}

	/** Logs `action` once per variant and session, outside a preview. */
	private _report(variant: WorktreeSuggestionVariant, action: WorktreeSuggestionAction, suggestion: IWorktreeSuggestion): void {
		const key = `${action}:${variant}:${suggestion.session.sessionId}`;
		if (this._preview.get() !== undefined || this._reported.has(key)) {
			return;
		}
		this._reported.add(key);
		this._telemetryService.publicLog2<WorktreeSuggestionEvent, WorktreeSuggestionClassification>('agents/worktreeSuggestion', {
			variant,
			action,
			uncommittedChanges: suggestion.uncommittedChanges,
		});
	}

	/** The stored state, or the state of the current preview. */
	private _getState(reader: IReader | undefined): IWorktreeSuggestionState {
		if (this._preview.read(reader) !== undefined) {
			return this._previewState.read(reader);
		}
		this._stateChanged.read(reader);
		const state = this._storageService.getObject<Partial<IWorktreeSuggestionState>>(STATE_STORAGE_KEY, StorageScope.PROFILE);
		return { hintClosed: state?.hintClosed === true };
	}

	private _updateState(update: Partial<IWorktreeSuggestionState>): void {
		if (this._preview.get() !== undefined) {
			this._previewState.set({ ...this._previewState.get(), ...update }, undefined);
			return;
		}
		this._storageService.store(STATE_STORAGE_KEY, { ...this._getState(undefined), ...update }, StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}
