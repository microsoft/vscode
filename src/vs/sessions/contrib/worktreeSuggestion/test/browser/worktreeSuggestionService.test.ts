/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { ISpotlightPayload } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IView } from '../../../../../workbench/common/views.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IChat, ISessionChangeset, ISessionFileChange, ISessionWorkspace, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { CHANGES_VIEW_ID } from '../../../changes/common/changes.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { WORKTREE_SUGGESTION_SETTING, WORKTREE_SUGGESTION_TOUR_ID, WorktreeSuggestionVariant } from '../../common/worktreeSuggestion.js';
import { getChangedFileLabel, getInlineHintMessage } from '../../browser/worktreeSuggestionPresentation.js';
import { IUncommittedChangesListItem, IWorktreeSuggestion, WorktreeSpotlightChoice, WorktreeSuggestionService } from '../../browser/worktreeSuggestionService.js';

class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
	readonly events: unknown[] = [];

	override publicLog2(eventName?: string, data?: object): void {
		super.publicLog2(eventName, data);
		if (eventName === 'agents/worktreeSuggestion') {
			this.events.push(data);
		}
	}
}

interface ISessionOptions {
	readonly id?: string;
	readonly isCreated?: boolean;
	readonly worktree?: boolean;
	readonly uncommittedChanges?: number;
	readonly providerId?: string;
	/** The uncommitted changes the provider reports. `undefined` while they load. */
	readonly changes?: readonly ISessionFileChange[];
}

function createSession({ id = 'draft', isCreated = false, worktree = false, uncommittedChanges = 3, providerId = LOCAL_AGENT_HOST_PROVIDER_ID, changes }: ISessionOptions = {}): IActiveSession {
	const workspace: ISessionWorkspace = {
		label: 'repo',
		icon: { id: 'folder' },
		uri: URI.file('/repo'),
		folders: [{
			root: URI.file('/repo'),
			workingDirectory: URI.file('/repo'),
			name: 'repo',
			description: undefined,
			gitRepository: { uri: URI.file('/repo'), workTreeUri: undefined, baseBranchName: undefined, branchName: 'main', uncommittedChanges, gitHubInfo: constObservable(undefined) },
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	const changeset = new class extends mock<ISessionChangeset>() {
		override readonly id = UNCOMMITTED_CHANGES_CHANGESET_ID;
		override readonly isEnabled = constObservable(true);
		override readonly isLoadingChanges = constObservable(changes === undefined);
		override readonly changes = constObservable(changes ?? []);
	}();
	const chat = new class extends mock<IChat>() {
		override readonly changesets = constObservable([changeset]);
	}();
	return new class extends mock<IActiveSession>() {
		override readonly sessionId = id;
		override readonly resource = URI.parse(`test-session:/${id}`);
		override readonly activeChat = constObservable(chat);
		override readonly providerId = providerId;
		override readonly isCreated = constObservable(isCreated);
		override readonly loading = constObservable(false);
		override readonly worktreePending = constObservable(worktree);
		override readonly workspace = constObservable(workspace);
	}();
}

suite('WorktreeSuggestionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** How the user responds to the spotlight, or how it ends without a response. */
	type SpotlightResponse = 'sendInWorktree' | 'send' | 'missingTarget' | 'lostTarget';

	function createService(options: { variant?: WorktreeSuggestionVariant; createdSessions?: number; hidden?: boolean; phoneLayout?: boolean; devContainer?: boolean; isolationFailsFor?: string; spotlight?: SpotlightResponse; spotlightShown?: boolean } = {}) {
		const configuration = new TestConfigurationService({ [WORKTREE_SUGGESTION_SETTING]: options.variant ?? WorktreeSuggestionVariant.InlineHint });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const storage = store.add(new InMemoryStorageService());
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, options.createdSessions ?? 3, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const telemetry = new RecordingTelemetryService();
		const sentiment = observableValue<IChatSentiment>('sentiment', { hidden: options.hidden ?? false });
		const contextKeyService = new MockContextKeyService();
		IsPhoneLayoutContext.bindTo(contextKeyService).set(options.phoneLayout ?? false);
		const isolationChanges: string[] = [];
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly onDidChangeSessionConfig = Event.None;
			override isDevContainerEnabled(): boolean {
				return options.devContainer ?? false;
			}
			override async setIsolationMode(sessionId: string, mode: string): Promise<void> {
				if (sessionId === options.isolationFailsFor) {
					throw new Error('The host rejected the isolation.');
				}
				isolationChanges.push(`${sessionId}:${mode}`);
			}
		}();
		const opened: unknown[] = [];
		const notifications: unknown[] = [];
		const onboarding: string[] = [];
		const shownTours = new Set<string>(options.spotlightShown ? [WORKTREE_SUGGESTION_TOUR_ID] : []);
		const service = store.add(new WorktreeSuggestionService(
			configuration,
			storage,
			telemetry,
			new class extends mock<IChatEntitlementService>() { override readonly sentimentObs = sentiment; }(),
			new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders(): ISessionsProvider[] {
					return [provider];
				}
				override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
					return providerId === provider.id ? provider as ISessionsProvider as T : undefined;
				}
			}(),
			new class extends mock<IOnboardingScenarioService>() {
				override readonly isPresenting = constObservable(false);
				override hasBeenShown(id: string): boolean {
					return shownTours.has(id);
				}
				override reset(id: string): void {
					shownTours.delete(id);
				}
				/**
				 * Plays the tour's only step as `options.spotlight` describes the user's response. Like the engine, records
				 * the tour as shown before looking for its target.
				 */
				override async runScenario(id: string): Promise<OnboardingOutcome> {
					shownTours.add(id);
					const step = (onboardingScenarioRegistry.getScenario(id)?.presentation.payload as ISpotlightPayload | undefined)?.steps[0];
					onboarding.push(`${step?.primaryAction?.label} | ${step?.endTourLabel}`);
					if (options.spotlight === 'missingTarget') {
						return OnboardingOutcome.Aborted;
					}
					await step?.onBeforeShow?.();
					step?.onDidShow?.();
					// The isolation picker went away for good while the spotlight showed.
					if (options.spotlight === 'lostTarget') {
						return OnboardingOutcome.Aborted;
					}
					if (options.spotlight === 'sendInWorktree') {
						await step?.primaryAction?.run(CancellationToken.None);
						return OnboardingOutcome.Completed;
					}
					return OnboardingOutcome.Skipped;
				}
			}(),
			contextKeyService,
			new class extends mock<IModelService>() {
				override getModel() {
					return null;
				}
			}(),
			new class extends mock<ILanguageService>() {
				override guessLanguageIdByFilepathOrFirstLine() {
					return null;
				}
			}(),
			new class extends mock<ISessionChangesService>() {
				override async openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions): Promise<undefined> {
					opened.push({ editor: sessionResource.toString(), changeset: options?.changesetSelection, reveal: options?.viewState?.revealData?.resource.modified?.toString() });
					return undefined;
				}
			}(),
			new class extends mock<IViewsService>() {
				override async openView<T extends IView>(id: string, focus?: boolean): Promise<T | null> {
					opened.push({ view: id, focus });
					return null;
				}
			}(),
			new class extends mock<IAgentWorkbenchLayoutService>() {
				override readonly agentWorkbenchLayout = AgentWorkbenchLayout.Desktop;
				override revealEditorPartExplicitly(): void {
					opened.push('revealEditorPart');
				}
				override suppressEditorPartAutoVisibility() {
					return Disposable.None;
				}
			}(),
			new class extends mock<INotificationService>() {
				override error(message: unknown): void {
					notifications.push(message);
				}
			}(),
			new NullLogService(),
		));
		return { service, storage, telemetry, isolationChanges, opened, notifications, onboarding };
	}

	function summarize(suggestion: IWorktreeSuggestion | undefined) {
		return suggestion && { sessionId: suggestion.session.sessionId, uncommittedChanges: suggestion.uncommittedChanges, branchName: suggestion.branchName };
	}

	function actions(telemetry: RecordingTelemetryService): string[] {
		return telemetry.events.map(event => `${(event as { action: string }).action}:${(event as { variant: string }).variant}`);
	}

	test('suggests a worktree only for people who started at least three sessions, starting on Branch in a folder with uncommitted changes', () => {
		const dirty = { sessionId: 'draft', uncommittedChanges: 3, branchName: 'main' };
		const cases = {
			dirtyBranch: [createService(), createSession()],
			newUser: [createService({ createdSessions: 2 }), createSession()],
			aiHidden: [createService({ hidden: true }), createSession()],
			phoneLayout: [createService({ phoneLayout: true }), createSession()],
			devContainer: [createService({ devContainer: true }), createSession()],
			worktreeSelected: [createService(), createSession({ worktree: true })],
			clean: [createService(), createSession({ uncommittedChanges: 0 })],
			created: [createService(), createSession({ isCreated: true })],
			providerCannotSwitch: [createService(), createSession({ providerId: 'other' })],
			offArm: [createService({ variant: WorktreeSuggestionVariant.Off }), createSession()],
		} as const;
		const results = Object.fromEntries(Object.entries(cases).map(([name, [{ service }, session]]) => [name, summarize(service.getSuggestion(session, undefined))]));

		const preview = createService({ createdSessions: 0 });
		preview.service.setPreview(WorktreeSuggestionVariant.SpotlightOnSend);

		assert.deepStrictEqual({ ...results, previewForNewUser: summarize(preview.service.getSuggestion(createSession(), undefined)) }, {
			dirtyBranch: dirty,
			newUser: undefined,
			aiHidden: undefined,
			phoneLayout: undefined,
			devContainer: undefined,
			worktreeSelected: undefined,
			clean: undefined,
			created: undefined,
			providerCannotSwitch: undefined,
			offArm: dirty,
			previewForNewUser: dirty,
		});
	});

	test('logs the experiment trigger in every arm, also once the user responded to a suggestion, but not in a developer preview', () => {
		const triggers = Object.fromEntries([WorktreeSuggestionVariant.Off, WorktreeSuggestionVariant.SpotlightOnSend, WorktreeSuggestionVariant.InlineHint, WorktreeSuggestionVariant.UncommittedFilesCount].map(variant => {
			const { service, telemetry } = createService({ variant });
			service.reportWouldShow();
			service.reportWouldShow();
			return [variant, telemetry.triggers];
		}));
		// State that only the treatments write never withdraws the suggestion that decides the trigger.
		const responded = createService({ spotlightShown: true });
		const suggestion = responded.service.getSuggestion(createSession(), undefined)!;
		responded.service.closeHint(suggestion);
		const preview = createService();
		preview.service.setPreview(WorktreeSuggestionVariant.InlineHint);
		preview.service.reportWouldShow();
		preview.service.markShown(WorktreeSuggestionVariant.InlineHint, preview.service.getSuggestion(createSession(), undefined)!);

		const expected = [`config.${WORKTREE_SUGGESTION_SETTING}`];
		assert.deepStrictEqual({
			triggers,
			suggestedAfterResponses: summarize(responded.service.getSuggestion(createSession({ id: 'next' }), undefined)),
			preview: { triggers: preview.telemetry.triggers, events: preview.telemetry.events },
		}, {
			triggers: { off: expected, spotlightOnSend: expected, inlineHint: expected, uncommittedFilesCount: expected },
			suggestedAfterResponses: { sessionId: 'next', uncommittedChanges: 3, branchName: 'main' },
			preview: { triggers: [], events: [] },
		});
	});

	test('closes the hint for good, which a preview neither reads nor changes', () => {
		const { service, storage, telemetry } = createService();
		const suggestion = service.getSuggestion(createSession(), undefined)!;
		const closed = () => service.isHintClosed(undefined);

		const initially = closed();
		service.closeHint(suggestion);
		const afterClosing = closed();
		const stored = JSON.parse(storage.get('sessions.worktreeSuggestion.state', StorageScope.PROFILE) ?? 'null');
		service.setPreview(WorktreeSuggestionVariant.InlineHint);
		const inPreview = closed();
		service.closeHint(suggestion);
		const afterClosingInPreview = closed();
		service.setPreview(WorktreeSuggestionVariant.InlineHint);
		const inNextPreview = closed();
		service.setPreview(undefined);
		const afterPreview = closed();
		service.reset();

		assert.deepStrictEqual({
			initially,
			afterClosing,
			stored,
			inPreview,
			afterClosingInPreview,
			inNextPreview,
			afterPreview,
			afterReset: closed(),
			events: actions(telemetry),
		}, {
			initially: false,
			afterClosing: true,
			stored: { hintClosed: true },
			inPreview: false,
			afterClosingInPreview: true,
			inNextPreview: false,
			afterPreview: true,
			afterReset: false,
			events: ['dismissed:inlineHint'],
		});
	});

	test('reports each response once per session, and keeps suggesting after the user accepts or declines one', async () => {
		const variant = WorktreeSuggestionVariant.UncommittedFilesCount;
		const { service, telemetry, isolationChanges } = createService({ variant });
		const suggestion = service.getSuggestion(createSession(), undefined)!;

		service.markShown(variant, suggestion);
		service.markShown(variant, suggestion);
		service.markOpened(variant, suggestion);
		service.decline(variant, suggestion);
		service.decline(variant, suggestion);
		await service.useWorktree(variant, suggestion);
		service.markShown(variant, service.getSuggestion(createSession({ id: 'next' }), undefined)!);

		assert.deepStrictEqual({
			events: actions(telemetry),
			isolationChanges,
			declined: { draft: service.hasDeclined(variant, suggestion, undefined), otherVariant: service.hasDeclined(WorktreeSuggestionVariant.InlineHint, suggestion, undefined) },
			nextSession: summarize(service.getSuggestion(createSession({ id: 'next' }), undefined)),
		}, {
			events: ['shown:uncommittedFilesCount', 'opened:uncommittedFilesCount', 'declined:uncommittedFilesCount', 'accepted:uncommittedFilesCount', 'shown:uncommittedFilesCount'],
			isolationChanges: ['draft:worktree'],
			declined: { draft: true, otherVariant: false },
			nextSession: { sessionId: 'next', uncommittedChanges: 3, branchName: 'main' },
		});
	});

	test('reviews the uncommitted changes, and reports a failed switch to a worktree', async () => {
		const variant = WorktreeSuggestionVariant.UncommittedFilesCount;
		const { service, telemetry, opened, notifications } = createService({ variant, isolationFailsFor: 'broken' });
		const change: IChatSessionFileChange2 = { uri: URI.file('/repo/src/app.ts'), originalUri: URI.parse('git:/repo/src/app.ts'), modifiedUri: URI.file('/repo/src/app.ts'), insertions: 4, deletions: 1 };
		const suggestion = service.getSuggestion(createSession({ changes: [change] }), undefined)!;
		const loading = service.getSuggestion(createSession({ id: 'loading' }), undefined)!;

		await service.reviewChanges(variant, suggestion, change);
		await service.reviewChanges(variant, suggestion);
		const broken = service.getSuggestion(createSession({ id: 'broken' }), undefined)!;
		const switched = await service.useWorktree(variant, broken);

		const editor = { editor: 'test-session:/draft', changeset: { kind: 'id', id: UNCOMMITTED_CHANGES_CHANGESET_ID } };
		const view = { view: CHANGES_VIEW_ID, focus: false };
		assert.deepStrictEqual({
			changes: service.getUncommittedChanges(suggestion, undefined),
			whileLoading: service.getUncommittedChanges(loading, undefined),
			opened,
			switched,
			notifications: notifications.length,
			events: actions(telemetry),
		}, {
			changes: [change],
			whileLoading: undefined,
			opened: ['revealEditorPart', { ...editor, reveal: 'file:///repo/src/app.ts' }, view, 'revealEditorPart', { ...editor, reveal: undefined }, view],
			switched: false,
			notifications: 1,
			events: ['reviewed:uncommittedFilesCount'],
		});
	});

	test('lists a few uncommitted files, then a row that counts and opens the rest, which never stands for a single file', async () => {
		const variant = WorktreeSuggestionVariant.UncommittedFilesCount;
		const { service, opened } = createService({ variant });
		const changes = (count: number): IChatSessionFileChange2[] => ['README.md', 'src/app.ts', 'src/todo.ts', 'src/store.ts', 'src/view.ts'].slice(0, count).map((path, index) => ({
			uri: URI.file(`/repo/${path}`), modifiedUri: URI.file(`/repo/${path}`), insertions: index + 1, deletions: index,
		}));
		const list = (count: number) => service.getUncommittedChangesListItems(variant, service.getSuggestion(createSession({ changes: changes(count) }), undefined)!, 3);
		// Rows show their label and lines added and removed, but no folder, which their tooltip and screen readers name, and keep a file icon for alignment.
		const describe = (row: IActionListItem<IUncommittedChangesListItem>) => [row.label, row.description, ...(row.additionalBadges?.map(badge => badge.label) ?? []), row.ariaDescription, row.tooltip && `(${row.tooltip})`, `[${row.className}]`, `{${row.iconClasses?.filter(name => name === 'file-icon').join(' ')}}`].filter(Boolean).join(' ');

		const five = list(5);
		five[1].item!.run();
		five.at(-1)!.item!.run();
		await timeout(0);

		assert.deepStrictEqual({
			three: list(3).map(describe),
			four: list(4).map(row => row.label),
			five: five.map(row => row.label),
			moreRow: describe(five.at(-1)!),
			opened: opened.map(entry => (entry as { reveal?: string }).reveal).filter(Boolean),
		}, {
			three: [
				'README.md +1 -0 +1 -0 (README.md) [worktree-suggestion-changed-file show-file-icons] {file-icon}',
				'app.ts +2 -1 src, +2 -1 (src/app.ts) [worktree-suggestion-changed-file show-file-icons] {file-icon}',
				'todo.ts +3 -2 src, +3 -2 (src/todo.ts) [worktree-suggestion-changed-file show-file-icons] {file-icon}',
			],
			four: ['README.md', 'app.ts', 'todo.ts', 'store.ts'],
			five: ['README.md', 'app.ts', 'todo.ts', '2 more'],
			moreRow: '2 more [worktree-suggestion-more-files show-file-icons] {file-icon}',
			opened: ['file:///repo/src/app.ts'],
		});
	});

	test('asks once in a spotlight whether to send the request in a new worktree, unless the spotlight could not show or was a preview', async () => {
		const variant = WorktreeSuggestionVariant.SpotlightOnSend;
		const respond = async (spotlight: SpotlightResponse, options: { preview?: boolean; spotlightShown?: boolean } = {}) => {
			const { service, telemetry, onboarding } = createService({ variant, spotlight, spotlightShown: options.spotlightShown });
			if (options.preview) {
				service.setPreview(variant);
			}
			const suggestion = service.getSuggestion(createSession(), undefined)!;
			let revealed = 0;
			const choice = await service.showSendSpotlight(suggestion, { reveal: () => revealed++ });
			const declined = service.hasDeclined(variant, suggestion, undefined);
			service.setPreview(undefined);
			return {
				choice,
				revealed,
				buttons: onboarding,
				events: actions(telemetry),
				declined,
				canShowLater: service.canShowSpotlight(),
				tourRegistered: !!onboardingScenarioRegistry.getScenario(WORKTREE_SUGGESTION_TOUR_ID),
			};
		};
		const buttons = ['Send in Worktree | Send'];

		assert.deepStrictEqual({
			sendInWorktree: await respond('sendInWorktree'),
			send: await respond('send'),
			missingTarget: await respond('missingTarget'),
			lostTarget: await respond('lostTarget'),
			preview: await respond('send', { preview: true }),
			previewOnceShown: await respond('sendInWorktree', { preview: true, spotlightShown: true }),
		}, {
			sendInWorktree: { choice: WorktreeSpotlightChoice.Worktree, revealed: 1, buttons, events: ['shown:spotlightOnSend'], declined: false, canShowLater: false, tourRegistered: false },
			send: { choice: WorktreeSpotlightChoice.Branch, revealed: 1, buttons, events: ['shown:spotlightOnSend', 'declined:spotlightOnSend'], declined: true, canShowLater: false, tourRegistered: false },
			missingTarget: { choice: undefined, revealed: 0, buttons, events: [], declined: false, canShowLater: true, tourRegistered: false },
			// The user saw it, so it does not show again, but did not decline it.
			lostTarget: { choice: undefined, revealed: 1, buttons, events: ['shown:spotlightOnSend'], declined: false, canShowLater: false, tourRegistered: false },
			preview: { choice: WorktreeSpotlightChoice.Branch, revealed: 1, buttons, events: [], declined: true, canShowLater: true, tourRegistered: false },
			previewOnceShown: { choice: WorktreeSpotlightChoice.Worktree, revealed: 1, buttons, events: [], declined: false, canShowLater: false, tourRegistered: false },
		});
	});

	test('splits the inline hint around its number of uncommitted files, which links to the changes', () => {
		const session = createSession();
		const hint = (uncommittedChanges: number, branchName: string | undefined) => getInlineHintMessage({ session, uncommittedChanges, branchName });
		const after = '. Worktrees allow agents to run on a separate copy of the files.';
		assert.deepStrictEqual({
			branch: hint(3, 'main'),
			singleFile: hint(1, 'main'),
			folder: hint(2, undefined),
		}, {
			branch: { before: 'main has ', files: '3 uncommitted files', after },
			singleFile: { before: 'main has ', files: '1 uncommitted file', after },
			folder: { before: 'This folder has ', files: '2 uncommitted files', after },
		});
	});

	test('labels changed files relative to the session folder, also for a remote agent host', () => {
		const folder = URI.file('/repo');
		const label = (uri: URI) => getChangedFileLabel({ uri, insertions: 1, deletions: 0 }, folder);
		assert.deepStrictEqual({
			nested: label(URI.file('/repo/src/app.ts')),
			root: label(URI.file('/repo/README.md')),
			remote: label(URI.from({ scheme: 'agent-host', authority: 'remote', path: '/repo/src/todo.ts' })),
			outside: label(URI.file('/other/notes.md')),
		}, {
			nested: { name: 'app.ts', directory: 'src', path: 'src/app.ts' },
			root: { name: 'README.md', directory: undefined, path: 'README.md' },
			remote: { name: 'todo.ts', directory: 'src', path: 'src/todo.ts' },
			outside: { name: 'notes.md', directory: '/other', path: '/other/notes.md' },
		});
	});
});
