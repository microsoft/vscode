/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { ICodexContinuationCandidate, CodexContinuationSurface } from '../../../../../services/agentHost/browser/codexContinuation.js';
import { ICodexContinuationService } from '../../../../../services/agentHost/browser/codexContinuationService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { markOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { IChatWidget } from '../../chat.js';

export const CODEX_CONTINUATION_MESSAGE = localize('codexContinuation.message', "You're nearing your ChatGPT limit. Continue this Codex session with your Copilot subscription.");
export const CODEX_CONTINUATION_LABEL = localize('codexContinuation.continue', "Continue with Copilot");
export const CODEX_CONTINUATION_DISABLE_LABEL = localize('codexContinuation.disable', "Don't Show Again");

/** One exact ChatWidget adapter shared by editor and Agents windows. */
export class CodexContinuationGuide extends Disposable {
	private readonly _run = this._register(new MutableDisposable<DisposableStore>());
	constructor(
		@ICodexContinuationService private readonly _nudge: ICodexContinuationService,
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@IOnboardingScenarioService private readonly _onboarding: IOnboardingScenarioService,
		@IWorkspaceTrustManagementService private readonly _trust: IWorkspaceTrustManagementService,
		@INotificationService private readonly _notifications: INotificationService,
		@IHostService private readonly _host: IHostService,
	) { super(); }

	async run(candidate: ICodexContinuationCandidate, surface: CodexContinuationSurface, open: (resource: URI) => Promise<IChatWidget | undefined>): Promise<void> {
		const store = new DisposableStore();
		this._run.value = store;
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		let widget: IChatWidget | undefined;
		let completed = false;
		this._nudge.log('continueClicked', surface);
		try {
			let current = await this._nudge.resolve(candidate);
			if (!current || store.isDisposed || !this._host.hasFocus || !this._trust.isWorkspaceTrusted()) { throw new Error('unavailable'); }
			const resource = this._connections.getSessionResource(current.session.session);
			widget = await open(resource);
			current = await this._nudge.resolve(candidate);
			if (!current || store.isDisposed || !widget || widget.viewModel?.sessionResource.toString() !== resource.toString() || !this._trust.isWorkspaceTrusted()) { throw new Error('unavailable'); }
			const owner = widget;
			const control = owner.input.getModelPickerControl();
			const target = owner.input.availableLanguageModels.find(model => model.metadata.id === current!.target.id && model.metadata.isUserSelectable !== false);
			if (!control || !target) { throw new Error('unavailable'); }
			const resolution = this._connections.resolveSessionResource(resource);
			if (!resolution) { throw new Error('unavailable'); }
			const session = resolution.connection.getSubscriptionUnmanaged(StateComponents.Session, resolution.backendSession)?.verifiedValue;
			const chat = session?.defaultChat && resolution.connection.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(session.defaultChat));
			if (!chat) { throw new Error('unavailable'); }
			const validOwner = () => !store.isDisposed && this._host.hasFocus && this._nudge.ownsEpisode() && this._trust.isWorkspaceTrusted()
				&& owner.viewModel?.sessionResource.toString() === resource.toString()
				&& owner.input.getModelPickerControl()?.element === control.element
				&& owner.input.availableLanguageModels.some(model => model.identifier === target.identifier && model.metadata.isUserSelectable !== false);
			let explicitSelection = false;
			store.add(autorun(reader => {
				this._nudge.revision.read(reader);
				if (!validOwner()) { cancellation.cancel(); }
			}));
			const accepted = store.add(new Emitter<Promise<boolean>>());
			store.add(owner.input.onDidChangeUserSelectedModel(event => {
				explicitSelection = event.toModelId === target.identifier;
				if (!explicitSelection) { cancellation.cancel(); }
			}));
			store.add(this._host.onDidChangeFocus(focused => { if (!focused) { cancellation.cancel(); } }));
			store.add(owner.onDidChangeViewModel(() => cancellation.cancel()));
			store.add(this._trust.onDidChangeTrust(trusted => { if (!trusted) { cancellation.cancel(); } }));
			store.add(chat.onDidApplyAction(envelope => {
				if (envelope.action.type !== ActionType.ChatDraftChanged || envelope.origin?.clientId !== resolution.connection.clientId) { return; }
				if (envelope.rejectionReason) { cancellation.cancel(); return; }
				if (explicitSelection && validOwner() && chat.verifiedValue?.draft?.model?.id === target.metadata.id
					&& owner.input.selectedLanguageModel.get()?.identifier === target.identifier) {
					accepted.fire((async () => {
						// The source selection is now a Copilot draft, so validate the original
						// metadata pair and current gates without substituting another session.
						const eligible = await this._nudge.resolve(candidate, undefined, true);
						completed = !!eligible && validOwner() && chat.verifiedValue?.draft?.model?.id === target.metadata.id;
						return completed;
					})());
				}
			}));
			const id = `codex.continuation.${generateUuid()}`;
			store.add(markOnboardingTarget(control.element, id, {
				open: () => { if (validOwner()) { control.open({ initialFilterValue: target.metadata.name, initialFocusItemId: target.identifier }); } },
				onDidSelect: accepted.event,
			}));
			store.add(onboardingScenarioRegistry.register({
				id, repeatable: true, trigger: { kind: 'command', commandId: id },
				presentation: {
					kind: SPOTLIGHT_PRESENTATION_KIND, payload: {
						steps: [{
							id: 'chooseCopilot', targetId: id, title: CODEX_CONTINUATION_LABEL,
							description: localize('codexContinuation.guide', "Select {0} from GitHub Copilot to continue this session.", target.metadata.name),
							openTarget: true, allowTargetInteraction: true, advanceOnTargetSelection: true, hideNext: true,
							missingTarget: { kind: 'abort' },
							onDidShow: () => this._nudge.log('guideShown', surface),
							onBeforeShow: async () => {
								if (!await this._nudge.resolve(candidate) || !validOwner()) { throw new Error('unavailable'); }
							},
						}]
					} satisfies ISpotlightPayload
				},
			}));
			const outcome = await this._onboarding.runScenario(id, cancellation.token);
			if (completed && outcome === OnboardingOutcome.Completed && validOwner()) { await this._nudge.complete(surface); }
			else { this._nudge.log('guideCancelled', surface); }
		} catch {
			if (!store.isDisposed) {
				this._nudge.log('guideUnavailable', surface);
				this._notifications.info(localize('codexContinuation.unavailable', "This Copilot continuation is no longer available. Review the session's model picker to continue."));
			}
		} finally {
			const restoreFocus = !store.isDisposed && this._host.hasFocus;
			store.dispose();
			if (restoreFocus) { widget?.focusInput(); }
		}
	}
}
