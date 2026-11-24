/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { language } from '../../../../../base/common/platform.js';
import { removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ISCMRepository, ISCMRepositoryNotice, ISCMService, ISCMViewService } from '../../../scm/common/scm.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { ChatModeKind } from '../../common/constants.js';
import { getAgentLimitState, getPlanCreditsAvailableFact, getPlanFactMarkdown, IPlanSummary, ITerminalAgent, parseAgentCommandLine, parseTerminalAgents, PlanNudgeId, PlanNudgeSurface } from '../../common/planAwareness/chatPlanAwareness.js';
import { IChatPlanAwarenessService, PlanNudgeAction } from './chatPlanAwarenessService.js';
import { ChatPlanMoments } from './chatPlanMoments.js';

/** The resource group of Git that holds the staged changes. */
const STAGED_CHANGES_GROUP_ID = 'index';

/** How much recent agent output is kept to find a usage limit message split across writes. */
const AGENT_OUTPUT_WINDOW = 4000;

/**
 * Notices moments where Copilot can take over what the user is doing, and offers
 * them with a card or right where the user works.
 */
export class ChatPlanAwarenessTriggers extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPlanAwarenessTriggers';

	private readonly moments: ChatPlanMoments;
	private readonly repositoryListeners = this._register(new DisposableMap<ISCMRepository>());
	private readonly agentTerminals = this._register(new DisposableMap<ITerminalInstance>());
	/** The user used or dismissed the review suggestion, so it stays away for this window. */
	private readonly reviewNoticeHidden = observableValue<boolean>(this, false);
	private reviewNoticeShown = false;
	private readonly terminalAgents: readonly ITerminalAgent[];

	constructor(
		@IChatPlanAwarenessService private readonly planAwarenessService: IChatPlanAwarenessService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITerminalService terminalService: ITerminalService,
		@ISCMService scmService: ISCMService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IProductService productService: IProductService,
	) {
		super();

		this.moments = instantiationService.createInstance(ChatPlanMoments);

		// Another AI agent running out of its usage limit in the terminal. The product configures the agents.
		this.terminalAgents = parseTerminalAgents(productService.chatPlanAwarenessTerminalAgents);
		if (this.terminalAgents.length) {
			const commandExecuted = this._register(terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, capability => capability.onCommandExecuted));
			this._register(commandExecuted.event(({ instance, data }) => this.onDidExecuteTerminalCommand(instance, data)));
			const commandFinished = this._register(terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, capability => capability.onCommandFinished));
			this._register(commandFinished.event(({ instance }) => this.agentTerminals.deleteAndDispose(instance)));
			this._register(terminalService.onDidDisposeInstance(instance => this.agentTerminals.deleteAndDispose(instance)));
		}

		// Committing from the Source Control view, a moment to let Copilot review the changes first
		for (const repository of scmService.repositories) {
			this.watchRepository(repository);
		}
		this._register(scmService.onDidAddRepository(repository => this.watchRepository(repository)));
		this._register(scmService.onDidRemoveRepository(repository => this.repositoryListeners.deleteAndDispose(repository)));
	}

	private onDidExecuteTerminalCommand(instance: ITerminalInstance, command: ITerminalCommand): void {
		const agentCommand = parseAgentCommandLine(command.command, this.terminalAgents);
		if (!agentCommand) {
			return;
		}

		// Agent CLIs are interactive and report a usage limit while they keep running, so watch their output live
		let output = '';
		let approaching = false;
		this.agentTerminals.set(instance, instance.onData(data => {
			output = (output + removeAnsiEscapeCodes(data)).slice(-AGENT_OUTPUT_WINDOW);
			const state = getAgentLimitState(output, agentCommand.agent);
			if (state === 'reached') {
				this.agentTerminals.deleteAndDispose(instance);
				this.planAwarenessService.showMoment(this.moments.agentUsageLimit(agentCommand.agent, agentCommand.prompt, true));
			} else if (state === 'approaching' && !approaching) {
				approaching = true;
				output = '';
				this.planAwarenessService.showMoment(this.moments.agentUsageLimit(agentCommand.agent, agentCommand.prompt, false));
			}
		}));
	}

	/**
	 * Offers to review the changes of a repository below its commit button, for
	 * users who commit from the Source Control view.
	 */
	private watchRepository(repository: ISCMRepository): void {
		const store = new DisposableStore();
		const registration = store.add(new MutableDisposable());
		let shownNotice: ISCMRepositoryNotice | undefined;
		const reviewNotice = derived(this, reader => {
			const plan = this.planAwarenessService.plan.read(reader);
			return plan && this.getReviewNotice(repository, plan);
		});
		const changesChanged = observableSignalFromEvent(this, repository.provider.onDidChangeResources);
		store.add(autorun(reader => {
			changesChanged.read(reader);
			const notice = reviewNotice.read(reader);
			const hasChanges = repository.provider.groups.some(group => group.resources.length > 0);
			// Once shown in this window, it stays until the user acts on it, even when it used up the last of the suggestions.
			// Until then, it follows the limits: another suggestion may use up the last one before the user opens the view.
			const show = !!notice && hasChanges && !this.reviewNoticeHidden.read(reader) && (this.reviewNoticeShown
				? this.planAwarenessService.developerMode.read(reader).has(PlanNudgeId.ReviewChanges) || !!this.planAwarenessService.summary.read(reader)
				: this.planAwarenessService.canShow(PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint, reader));
			const next = show ? notice : undefined;
			if (next !== shownNotice) {
				shownNotice = next;
				registration.value = next && this.scmViewService.setRepositoryNotice(repository, next);
			}
		}));
		this.repositoryListeners.set(repository, store);
	}

	private getReviewNotice(repository: ISCMRepository, plan: IPlanSummary): ISCMRepositoryNotice {
		// Not appendText, which keeps the sentence on one line with non-breaking spaces
		const message = new MarkdownString(`${escapeMarkdownSyntaxTokens(localize('planAwareness.review.hint', "Let Copilot review your changes and commit them when ready."))} ${getPlanFactMarkdown(getPlanCreditsAvailableFact(plan, language))}`);
		return {
			id: 'chat.planAwareness.reviewChanges',
			icon: Codicon.copilot,
			message,
			action: {
				label: localize('planAwareness.review.action', "Review with Copilot"),
				run: () => this.reviewChanges(repository),
			},
			dismiss: {
				tooltip: localize('planAwareness.review.dismiss', "Don't Show Again"),
				run: () => {
					this.planAwarenessService.dismiss(PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint);
					this.reviewNoticeHidden.set(true, undefined);
				},
			},
			onDidRender: () => {
				if (!this.reviewNoticeShown) {
					this.reviewNoticeShown = true;
					this.planAwarenessService.markShown(PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint);
				}
			},
		};
	}

	private reviewChanges(repository: ISCMRepository): Promise<void> {
		// Once the user reviewed with Copilot, they know about it
		this.planAwarenessService.dismiss(PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint, PlanNudgeAction.Primary);
		this.reviewNoticeHidden.set(true, undefined);
		const staged = repository.provider.groups.some(group => group.id === STAGED_CHANGES_GROUP_ID && group.resources.length > 0);
		return this.planAwarenessService.openChat({
			mode: ChatModeKind.Agent,
			query: staged
				? localize('planAwareness.review.staged', "Review my staged changes for bugs, security issues and missing tests. If everything looks good, commit them with a concise message that describes the change. Otherwise, list the issues you found without committing.")
				: localize('planAwareness.review.uncommitted', "Review my uncommitted changes for bugs, security issues and missing tests. If everything looks good, commit them with a concise message that describes the change. Otherwise, list the issues you found without committing."),
			isPartialQuery: false,
		});
	}
}
