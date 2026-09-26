/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/comparison.css';
import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ISessionsRecentWorkspacesService } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionChangesService } from '../../changes/common/sessionChangesService.js';
import { buildFolderQuickPickItems } from '../../chat/browser/newSessionFolderQuickPickAction.js';
import { ComparisonFocusedContext, IComparisonRun, IComparisonTarget, ISessionComparisonService, MAX_COMPARISON_CANDIDATES } from '../common/comparison.js';
import { ComparisonCandidateView } from './comparisonCandidateView.js';
import { getComparisonChanges } from './comparisonChanges.js';
import { ComparisonTargetPicker } from './comparisonTargetPicker.js';

export class ComparisonView extends AbstractCustomView {
	readonly title = constObservable(localize('comparison.title', "Compare implementations"));
	override readonly description = constObservable(localize('comparison.description', "One prompt. Independent approaches. Choose the implementation you prefer."));
	override readonly maxWidth = 1400;
	private readonly bodyStore = this._register(new DisposableStore());
	private readonly targetStore = this._register(new DisposableStore());
	private readonly source = new CancellationTokenSource();
	private readonly targetPicker: ComparisonTargetPicker;
	private container: HTMLElement | undefined;
	private folderUri: URI | undefined;
	private targets: IComparisonTarget[] = [];
	private picking = false;
	private prompt: InputBox | undefined;
	private focusTarget: HTMLElement | undefined;

	constructor(
		@ISessionComparisonService private readonly comparisonService: ISessionComparisonService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionChangesService private readonly changesService: ISessionChangesService,
		@IEditorService private readonly editorService: IEditorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
		@ILabelService private readonly labelService: ILabelService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._register(toDisposable(() => this.source.dispose(true)));
		this.targetPicker = instantiationService.createInstance(ComparisonTargetPicker);
	}

	render(container: HTMLElement): void {
		this.container = dom.append(container, dom.$('.session-comparison'));
		this.container.setAttribute('role', 'region');
		this.container.setAttribute('aria-label', localize('comparison.title', "Compare implementations"));
		const scopedContext = this._register(this.contextKeyService.createScoped(this.container));
		const focused = ComparisonFocusedContext.bindTo(scopedContext);
		const focusTracker = this._register(dom.trackFocus(this.container));
		let hintAnnounced = false;
		this._register(focusTracker.onDidFocus(() => {
			focused.set(true);
			if (!hintAnnounced && this.accessibilityService.isScreenReaderOptimized() && this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionComparison)) {
				const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
				if (keybinding) {
					hintAnnounced = true;
					status(localize('comparison.helpHint', "Press {0} for accessibility help.", keybinding));
				}
			}
		}));
		this._register(focusTracker.onDidBlur(() => focused.set(false)));
		this._register(autorun(reader => {
			const id = this.comparisonService.activeRunId.read(reader);
			this.bodyStore.clear();
			this.targetStore.clear();
			this.prompt = undefined;
			this.focusTarget = undefined;
			this.picking = false;
			dom.clearNode(this.container!);
			if (id) {
				this.renderRun(this.container!, id);
			} else {
				this.renderSetup(this.container!);
			}
		}));
	}

	private button(container: HTMLElement, label: string, action: () => Promise<void> | void, store = this.bodyStore, secondary = true): Button {
		const button = store.add(new Button(container, { ...defaultButtonStyles, secondary }));
		button.label = label;
		store.add(button.onDidClick(() => {
			void Promise.resolve().then(action).catch(error => this.notificationService.error(error));
		}));
		return button;
	}

	private renderSetup(container: HTMLElement): void {
		const source = new CancellationTokenSource(this.source.token);
		this.bodyStore.add(toDisposable(() => source.dispose(true)));
		const setup = dom.append(container, dom.$('.comparison-setup'));
		dom.append(setup, dom.$('h2', undefined, localize('comparison.setupTitle', "Try a few approaches")));
		dom.append(setup, dom.$('p.comparison-secondary', undefined, localize('comparison.setupHint', "Compare different models, or give the same model multiple chances. Each attempt starts a fresh session in its own Git worktree.")));
		const folderRow = dom.append(setup, dom.$('.comparison-folder-row'));
		const folder = this.button(folderRow, this.folderUri ? this.labelService.getUriLabel(this.folderUri) : localize('comparison.chooseFolder', "Choose Repository..."), async () => {
			const selected = await this.quickInputService.pick(buildFolderQuickPickItems(this.recentWorkspacesService, this.labelService), {
				title: localize('comparison.chooseRepoTitle', "Compare Implementations: Choose Repository"),
			}, source.token);
			if (!selected) { return; }
			const uri = selected.browse ? (await this.fileDialogService.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false }))?.[0] : selected.folderUri;
			if (!uri || source.token.isCancellationRequested) { return; }
			this.folderUri = uri;
			this.targets = [];
			folder.label = this.labelService.getUriLabel(uri);
			renderTargets();
		});
		const branch = this.bodyStore.add(new InputBox(folderRow, this.contextViewService, {
			ariaLabel: localize('comparison.baseBranch', "Base branch or commit"),
			placeholder: localize('comparison.baseBranch', "Base branch or commit"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		branch.value = 'HEAD';
		dom.append(setup, dom.$('p.comparison-secondary', undefined, localize('comparison.baseHint', "All attempts use this base branch or commit. HEAD uses the current checkout; uncommitted changes are not included. Use a commit ID for an exact, fixed baseline.")));
		this.prompt = this.bodyStore.add(new InputBox(setup, this.contextViewService, {
			ariaLabel: localize('comparison.promptLabel', "Shared implementation prompt"),
			placeholder: localize('comparison.promptPlaceholder', "What should each agent implement? Include the same constraints and acceptance tests for all attempts."),
			flexibleHeight: true, flexibleMaxHeight: 240,
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this.prompt.element.classList.add('comparison-prompt-input');
		const prompt = this.prompt;
		this.focusTarget = prompt.inputElement;
		const targetList = dom.append(setup, dom.$('.comparison-targets'));
		const footer = dom.append(setup, dom.$('.comparison-setup-actions'));
		const add = this.button(footer, localize('comparison.addAttempt', "Add Attempt..."), async () => {
			if (!this.folderUri || this.picking) { return; }
			this.picking = true;
			updateEnabled();
			try {
				const target = await this.targetPicker.pick(this.folderUri, source.token);
				if (target && !source.token.isCancellationRequested && this.targets.length < MAX_COMPARISON_CANDIDATES) {
					this.targets.push(target);
					renderTargets();
				}
			} finally {
				if (!source.token.isCancellationRequested) {
					this.picking = false;
					updateEnabled();
				}
			}
		});
		const start = this.button(footer, localize('comparison.start', "Start Comparison"), async () => {
			if (!this.folderUri || !start.enabled) { return; }
			start.enabled = false;
			try {
				await this.comparisonService.start(this.folderUri, branch.value, prompt.value, this.targets);
			} finally {
				if (this.prompt === prompt) { updateEnabled(); }
			}
		}, this.bodyStore, false);
		const cost = dom.append(setup, dom.$('p.comparison-secondary'));
		const updateEnabled = () => {
			add.enabled = !!this.folderUri && !this.picking && this.targets.length < MAX_COMPARISON_CANDIDATES;
			start.enabled = !!this.folderUri && !!branch.value.trim() && !!prompt.value.trim() && this.targets.length >= 2 && !this.picking;
			cost.textContent = this.targets.length >= 2
				? localize('comparison.cost', "Starts {0} independent agent sessions. Each uses its provider's normal billing and permissions. Nothing is merged automatically.", this.targets.length)
				: localize('comparison.minimum', "Add 2–4 attempts to compare. You choose which result to keep working on.");
		};
		const renderTargets = () => {
			this.targetStore.clear();
			dom.clearNode(targetList);
			this.targets.forEach((target, index) => {
				const row = dom.append(targetList, dom.$('.comparison-target'));
				dom.append(row, dom.$('span.comparison-attempt-label', undefined, String.fromCharCode(65 + index)));
				const name = dom.append(row, dom.$('.comparison-target-name'));
				dom.append(name, dom.$('strong', undefined, target.modelLabel));
				dom.append(name, dom.$('span.comparison-secondary', undefined, target.providerLabel));
				this.button(row, localize('comparison.duplicate', "Duplicate"), () => {
					if (this.targets.length < MAX_COMPARISON_CANDIDATES) {
						this.targets.splice(index + 1, 0, { ...target });
						renderTargets();
						add.focus();
					}
				}, this.targetStore).enabled = this.targets.length < MAX_COMPARISON_CANDIDATES;
				this.button(row, localize('comparison.remove', "Remove"), () => {
					this.targets.splice(index, 1);
					renderTargets();
					add.focus();
				}, this.targetStore);
			});
			updateEnabled();
		};
		this.bodyStore.add(prompt.onDidChange(updateEnabled));
		this.bodyStore.add(branch.onDidChange(updateEnabled));
		renderTargets();
	}

	private renderRun(container: HTMLElement, id: string): void {
		const run = derived(this, reader => this.comparisonService.runs.read(reader).find(run => run.id === id)!);
		const initial = run.get();
		dom.append(container, dom.$('p.comparison-baseline', undefined, localize('comparison.baseline', "{0} · base {1} · {2} isolated attempts", basename(initial.folderUri), initial.branch, initial.candidates.length)));
		const prompt = dom.append(container, dom.$('details.comparison-shared-prompt'));
		this.focusTarget = dom.append(prompt, dom.$('summary', undefined, localize('comparison.sharedPrompt', "Shared prompt")));
		dom.append(prompt, dom.$('p', undefined, initial.prompt));
		prompt.setAttribute('open', '');
		const heading = dom.append(container, dom.$('.comparison-review-heading'));
		const title = dom.append(heading, dom.$('h2', undefined, localize('comparison.which', "Which implementation do you prefer?")));
		dom.append(container, dom.$('p.comparison-secondary', undefined, localize('comparison.reviewHint', "Review the code, not just the response. These are live session results: Finished does not mean tests passed. All attempts are kept when you choose.")));
		const controls = dom.append(container, dom.$('.comparison-review-actions'));
		const openAll = this.button(controls, localize('comparison.openAll', "Open Sessions Side by Side"), async () => {
			const sessions = this.getSessions(run.get());
			for (const session of sessions) {
				await this.sessionsService.openSessionToSide(session, { preserveFocus: true });
			}
		});
		const compare = this.button(controls, localize('comparison.compareCode', "Compare Code..."), () => this.compareCode(run.get()));
		const continuePreferred = this.button(controls, localize('comparison.continue', "Continue with Preferred"), async () => {
			const current = run.get();
			const candidate = current.candidates.find(candidate => candidate.id === current.preferredCandidateId);
			const session = candidate && this.comparisonService.getSession(candidate);
			if (!session) {
				throw new Error(localize('comparison.chooseFirst', "Choose a finished implementation first."));
			}
			await this.sessionsService.openSession(session.resource);
		});
		const grid = dom.append(container, dom.$('.comparison-grid'));
		for (const [index, candidate] of initial.candidates.entries()) {
			const card = this.bodyStore.add(this.instantiationService.createInstance(ComparisonCandidateView, index, candidate.id, run, {
				openSession: (session: ISession) => this.sessionsService.openSession(session.resource),
				openChanges: async (session: ISession) => {
					await this.sessionsService.openSession(session.resource, { preserveFocus: true });
					await this.changesService.openChangesEditor(session.resource);
				},
			}));
			grid.appendChild(card.element);
		}
		this.bodyStore.add(autorun(reader => {
			const current = run.read(reader);
			const available = current.candidates.flatMap(candidate => {
				const session = this.comparisonService.getSession(candidate, reader);
				return session ? [session] : [];
			});
			openAll.enabled = available.length > 0;
			compare.enabled = available.filter(session => session.status.read(reader) === SessionStatus.Completed).length >= 2;
			const preferred = current.candidates.findIndex(candidate => candidate.id === current.preferredCandidateId);
			continuePreferred.enabled = preferred >= 0 && !!this.comparisonService.getSession(current.candidates[preferred], reader);
			title.textContent = preferred < 0 ? localize('comparison.which', "Which implementation do you prefer?")
				: localize('comparison.chosen', "Attempt {0} is your preferred implementation", String.fromCharCode(65 + preferred));
		}));
	}

	private getSessions(run: IComparisonRun): ISession[] {
		return run.candidates.flatMap(candidate => {
			const session = this.comparisonService.getSession(candidate);
			return session ? [session] : [];
		});
	}

	private async compareCode(run: IComparisonRun): Promise<void> {
		const candidates = run.candidates.flatMap((candidate, index) => {
			const session = this.comparisonService.getSession(candidate);
			return session?.status.get() === SessionStatus.Completed
				? [{ label: localize('comparison.diffTarget', "Attempt {0}: {1}", String.fromCharCode(65 + index), candidate.target.modelLabel), session }]
				: [];
		});
		const left = candidates.length === 2 ? candidates[0] : await this.quickInputService.pick(candidates, { title: localize('comparison.diffLeft', "Compare Code: Left Implementation") }, this.source.token);
		if (!left) { return; }
		const right = candidates.length === 2 ? candidates[1] : await this.quickInputService.pick(candidates.filter(candidate => candidate !== left), { title: localize('comparison.diffRight', "Compare Code: Right Implementation") }, this.source.token);
		if (!right) { return; }
		const resources = await getComparisonChanges(left.session, right.session, this.fileService);
		if (!resources.length) {
			status(localize('comparison.noDiff', "Neither attempt has file changes to compare."));
			this.notificationService.info(localize('comparison.noDiff', "Neither attempt has file changes to compare."));
			return;
		}
		await this.sessionsService.openSession(left.session.resource, { preserveFocus: true });
		await this.editorService.openEditor({
			label: localize('comparison.diffTitle', "{0} ↔ {1}", left.label, right.label),
			resources, isTransient: true, options: { pinned: true },
		});
	}

	override focus(): void {
		if (!this.comparisonService.activeRunId.get()) {
			this.prompt?.focus();
		} else {
			this.focusTarget?.focus();
		}
	}

	layout(width: number): void {
		this.container?.classList.toggle('narrow', width < 800);
	}
}
