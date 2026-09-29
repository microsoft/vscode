/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionEnvelope, ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChatState, ComponentToState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { ICodexContinuationCandidate } from '../../../../../services/agentHost/browser/codexContinuation.js';
import { CodexContinuationAction, ICodexContinuationService } from '../../../../../services/agentHost/browser/codexContinuationService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { onDidSelectOnboardingTarget, ONBOARDING_TARGET_ATTR, resolveOnboardingTarget } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { CodexContinuationGuide, openAndWaitForChatWidget } from '../../../browser/agentSessions/agentHost/codexContinuationGuide.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';

suite('Codex continuation exact widget guide', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	for (const scenario of ['accepted', 'wrongModel', 'rejected', 'cancelled', 'replaced', 'restricted', 'noSearch'] as const) {
		test(`only a committed exact selection completes: ${scenario}`, async () => {
			const resource = URI.parse('agent-host-codex:/one');
			const candidate: ICodexContinuationCandidate = {
				session: { session: AgentSession.uri('codex', 'one'), startTime: 1, modifiedTime: 2, model: { id: '@provider=openai:gpt' } },
				source: { id: '@provider=openai:gpt', provider: 'codex', name: 'GPT' },
				target: { id: '@provider=vscode-proxy:gpt', provider: 'codex', name: 'GPT Copilot' },
			};
			const target: ILanguageModelChatMetadataAndIdentifier = { identifier: `agent-host-codex:${candidate.target.id}`, metadata: upcastPartial<ILanguageModelChatMetadata>({ id: candidate.target.id, name: candidate.target.name, isUserSelectable: true }) };
			const element = document.createElement('button');
			const foreign = document.createElement('button');
			for (const targetElement of [element, foreign]) {
				targetElement.style.cssText = 'position: fixed; width: 100px; height: 30px;';
				mainWindow.document.body.appendChild(targetElement);
				store.add(toDisposable(() => targetElement.remove()));
			}
			const selected = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('selected', undefined);
			const selections = store.add(new Emitter<{ fromModelId: string; toModelId: string }>());
			const confirmations = store.add(new Emitter<ActionEnvelope>());
			const viewChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
			let committed: ChatState | undefined;
			let replaced = false;
			const opened: object[] = [];
			const actions: CodexContinuationAction[] = [];
			let spotlightShows = 0;
			const input = upcastPartial<ChatInputPart>({
				availableLanguageModels: [target], selectedLanguageModel: selected,
				onDidChangeUserSelectedModel: selections.event,
				getModelPickerControl: () => scenario === 'noSearch' ? undefined : { element: replaced ? foreign : element, open: options => opened.push(options) },
			});
			const widget = upcastPartial<IChatWidget>({ input, viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: resource }), onDidChangeViewModel: viewChanged.event, focusInput: () => { } });
			const nudge = upcastPartial<ICodexContinuationService>({
				revision: observableValue('revision', 0),
				resolve: async () => candidate, ownsEpisode: () => true,
				log: action => actions.push(action), complete: async () => { actions.push('guideCompleted'); },
			});
			const connection = upcastPartial<IAgentConnection>({
				clientId: 'client',
				getSubscriptionUnmanaged: (_kind, uri) => upcastPartial<IAgentSubscription<ComponentToState[typeof _kind]>>({
					get verifiedValue() { return (uri.toString() === candidate.session.session.toString() ? { defaultChat: 'ahp-chat:/one/main' } : committed) as never; },
					onDidApplyAction: confirmations.event,
				}),
			});
			const connections = upcastPartial<IAgentHostConnectionsService>({
				getSessionResource: () => resource,
				resolveSessionResource: () => upcastPartial<IAgentHostSessionResolution>({ backendSession: candidate.session.session, connection }),
			});
			const onboarding = new class extends mock<IOnboardingScenarioService>() {
				override async runScenario(id: string, token?: CancellationToken): Promise<OnboardingOutcome> {
					const registered = onboardingScenarioRegistry.getScenario(id)!;
					const step = (registered.presentation.payload as ISpotlightPayload).steps[0];
					await step.onBeforeShow?.();
					let resolved = resolveOnboardingTarget(mainWindow, id);
					if (!resolved) {
						return OnboardingOutcome.Aborted;
					}
					spotlightShows++;
					step.onDidShow?.();
					await resolved.open?.();
					if (scenario === 'replaced') {
						replaced = true;
						resolved = resolveOnboardingTarget(mainWindow, id);
						assert.ok(resolved, 'replacement control resolves through the same exact owner');
						spotlightShows++;
						step.onDidShow?.();
						await resolved.open?.();
					}
					assert.strictEqual(resolved.element.getAttribute(ONBOARDING_TARGET_ATTR), id);
					assert.strictEqual(step.placement, 'left');
					assert.deepStrictEqual(opened, Array.from({ length: scenario === 'replaced' ? 2 : 1 }, () => ({
						initialFilterValue: target.metadata.name,
						initialFocusItemId: target.identifier,
					})));
					assert.strictEqual(selected.get(), undefined, 'opening never changes the model');
					if (scenario === 'cancelled') { return OnboardingOutcome.Dismissed; }
					let result: Promise<boolean> | undefined;
					const listener = onDidSelectOnboardingTarget(resolved.element)(promise => { result = promise; });
					try {
						selected.set(target, undefined);
						selections.fire({ fromModelId: 'source', toModelId: scenario === 'wrongModel' ? 'other' : target.identifier });
						assert.strictEqual(actions.includes('guideCompleted'), false, 'optimistic changes do not complete');
						committed = upcastPartial<ChatState>({ draft: upcastPartial<NonNullable<ChatState['draft']>>({ model: { id: target.metadata.id } }) });
						confirmations.fire(upcastPartial<ActionEnvelope>({ action: { type: ActionType.ChatDraftChanged, draft: committed.draft }, origin: { clientId: 'client', clientSeq: 1 }, ...(scenario === 'rejected' ? { rejectionReason: 'denied' } : {}) }));
						return result && await result && !token?.isCancellationRequested ? OnboardingOutcome.Completed : OnboardingOutcome.Dismissed;
					} finally { listener.dispose(); }
				}
			}();
			const guide = store.add(new CodexContinuationGuide(nudge, connections, onboarding,
				upcastPartial<IWorkspaceTrustManagementService>({ isWorkspaceTrusted: () => scenario !== 'restricted', onDidChangeTrust: Event.None }),
				upcastPartial<INotificationService>({ info: () => { } }),
				upcastPartial<IHostService>({ hasFocus: true, onDidChangeFocus: Event.None })));
			let opens = 0;
			await guide.run(candidate, 'editorWindow', async requested => { assert.strictEqual(requested.toString(), resource.toString()); opens++; return widget; });
			assert.strictEqual(actions.includes('guideCompleted'), scenario === 'accepted' || scenario === 'replaced');
			assert.strictEqual(actions.filter(action => action === 'guideShown').length, scenario === 'restricted' || scenario === 'noSearch' ? 0 : 1);
			assert.strictEqual(spotlightShows, scenario === 'restricted' || scenario === 'noSearch' ? 0 : scenario === 'replaced' ? 2 : 1);
			assert.strictEqual(element.hasAttribute(ONBOARDING_TARGET_ATTR), false, 'run target is disposed');
			assert.strictEqual(foreign.hasAttribute(ONBOARDING_TARGET_ATTR), false, 'replacement target is disposed');
			assert.strictEqual(opens, scenario === 'restricted' ? 0 : 1);
		});
	}

	test('waits for the exact widget owner after session opening completes', async () => {
		const resource = URI.parse('agent-host-codex:/one');
		const otherResource = URI.parse('agent-host-codex:/other');
		const added = store.add(new Emitter<IChatWidget>());
		const focusedSessionChanged = store.add(new Emitter<void>());
		const widgets: IChatWidget[] = [];
		const other = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: otherResource }),
			onDidChangeViewModel: Event.None,
		});
		const exact = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: resource }),
			onDidChangeViewModel: Event.None,
		});
		const service = upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return widgets.at(-1); },
			getAllWidgets: () => widgets,
			onDidAddWidget: added.event,
			onDidChangeFocusedSession: focusedSessionChanged.event,
		});
		const cancellation = store.add(new CancellationTokenSource());
		const result = openAndWaitForChatWidget(resource, service, async () => undefined, cancellation.token, 1_000);
		widgets.push(other);
		added.fire(other);
		widgets.push(exact);
		added.fire(exact);

		assert.strictEqual(await result, exact);
	});

	test('cancelling the widget wait ignores a late owner', async () => {
		const resource = URI.parse('agent-host-codex:/one');
		const added = store.add(new Emitter<IChatWidget>());
		const widgets: IChatWidget[] = [];
		const service = upcastPartial<IChatWidgetService>({
			getAllWidgets: () => widgets,
			onDidAddWidget: added.event,
			onDidChangeFocusedSession: Event.None,
		});
		const cancellation = store.add(new CancellationTokenSource());
		const result = openAndWaitForChatWidget(resource, service, async () => undefined, cancellation.token, 1_000);
		cancellation.cancel();
		const exact = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: resource }),
			onDidChangeViewModel: Event.None,
		});
		widgets.push(exact);
		added.fire(exact);

		assert.strictEqual(await result, undefined);
	});
});
