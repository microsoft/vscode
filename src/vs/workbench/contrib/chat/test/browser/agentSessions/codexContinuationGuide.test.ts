/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
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
import { CodexContinuationGuide, waitForActiveChatWidget } from '../../../browser/agentSessions/agentHost/codexContinuationGuide.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { IChatModel } from '../../../common/model/chatModel.js';

suite('Codex continuation exact widget guide', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	for (const scenario of ['accepted', 'wrongModel', 'rejected', 'cancelled', 'replaced', 'restricted', 'noSearch', 'rowAccepted', 'rowCancelled', 'wrongSession', 'cancelledDuringOpen', 'rowArchived', 'blocked', 'buttonAccepted', 'rowButtonAccepted', 'buttonsAccepted', 'buttonRejected', 'buttonIneligible', 'buttonBlocked', 'buttonAlreadySelected', 'buttonCancelled', 'rowOpenDeclined', 'rowButtonCancelled'] as const) {
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
			const row = document.createElement('div');
			for (const targetElement of [element, foreign, row]) {
				targetElement.style.cssText = 'position: fixed; width: 100px; height: 30px;';
				mainWindow.document.body.appendChild(targetElement);
				store.add(toDisposable(() => targetElement.remove()));
			}
			const selected = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('selected', undefined);
			const selections = store.add(new Emitter<{ fromModelId: string; toModelId: string }>());
			const confirmations = store.add(new Emitter<ActionEnvelope>());
			const viewChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
			const sessionOpened = store.add(new Emitter<URI>());
			const focused = store.add(new Emitter<void>());
			const startWithRow = ['rowAccepted', 'rowCancelled', 'wrongSession', 'cancelledDuringOpen', 'rowArchived', 'rowButtonAccepted', 'buttonsAccepted', 'rowOpenDeclined', 'rowButtonCancelled'].includes(scenario);
			const useRowButton = ['rowButtonAccepted', 'buttonsAccepted', 'rowOpenDeclined', 'rowButtonCancelled'].includes(scenario);
			const useModelButton = ['buttonAccepted', 'buttonsAccepted', 'buttonRejected', 'buttonIneligible', 'buttonBlocked', 'buttonAlreadySelected', 'buttonCancelled'].includes(scenario);
			const buttonCancellation = store.add(new CancellationTokenSource());
			const openPending = new DeferredPromise<void>();
			const openStarted = new DeferredPromise<void>();
			const blocked = observableValue('blocked', scenario === 'blocked');
			let committed: ChatState | undefined;
			let eligible = true;
			let replaced = false;
			const opened: object[] = [];
			const actions: CodexContinuationAction[] = [];
			let spotlightShows = 0;
			let rowOpens = 0;
			const buttonSelections: string[] = [];
			const input = upcastPartial<ChatInputPart>({
				availableLanguageModels: [target], selectedLanguageModel: selected,
				onDidChangeUserSelectedModel: selections.event,
				getModelPickerControl: () => scenario === 'noSearch' ? undefined : {
					element: replaced ? foreign : element, open: options => opened.push(options),
					select: identifier => {
						buttonSelections.push(identifier);
						assert.strictEqual(identifier, target.identifier);
						selected.set(target, undefined);
						selections.fire({ fromModelId: 'source', toModelId: identifier });
						return true;
					},
				},
			});
			const widget = upcastPartial<IChatWidget>({ input, visible: true, viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: resource, model: upcastPartial<IChatModel>({ isInputBlocked: blocked }) }), onDidChangeViewModel: viewChanged.event, focusInput: () => { } });
			let active: IChatWidget | undefined = startWithRow ? undefined : widget;
			const widgets = upcastPartial<IChatWidgetService>({
				getAllWidgets: () => [widget], onDidAddWidget: Event.None,
				onDidChangeFocusedSession: focused.event, onDidChangeWidgetVisibility: Event.None,
			});
			const nudge = upcastPartial<ICodexContinuationService>({
				trackVisibility: () => toDisposable(() => { }),
				revision: observableValue('revision', 0),
				resolve: async () => eligible ? candidate : undefined, ownsEpisode: () => true,
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
					const steps = (registered.presentation.payload as ISpotlightPayload).steps;
					assert.strictEqual(steps.length, startWithRow ? 2 : 1);
					if (startWithRow) {
						const rowStep = steps[0];
						await rowStep.onBeforeShow?.();
						const rowTarget = resolveOnboardingTarget(mainWindow, rowStep.targetId)!;
						assert.strictEqual(rowTarget.element, row);
						assert.strictEqual(rowStep.primaryAction?.label, 'Open Session');
						spotlightShows++;
						rowStep.onDidShow?.();
						assert.deepStrictEqual({ active, opened, rowOpens }, { active: undefined, opened: [], rowOpens: 0 }, 'revealing a row neither opens the chat nor its picker');
						if (scenario === 'rowCancelled') { return OnboardingOutcome.Skipped; }
						let rowResult: Promise<boolean> | undefined;
						const listener = rowTarget.onDidSelect!(result => { rowResult = result; });
						try {
							if (scenario === 'rowArchived') { eligible = false; }
							if (useRowButton) {
								const action = rowStep.primaryAction!.run(buttonCancellation.token);
								if (scenario === 'rowButtonCancelled') {
									await openStarted.p;
									buttonCancellation.cancel();
									await openPending.complete();
									await action;
									assert.strictEqual(rowResult, undefined, 'late opening must not advance the cancelled step');
									return OnboardingOutcome.Skipped;
								}
								await action;
							} else {
								if (scenario !== 'cancelledDuringOpen') { active = widget; }
								sessionOpened.fire(scenario === 'wrongSession' ? resource.with({ path: '/other' }) : resource);
							}
							if (scenario === 'cancelledDuringOpen') {
								return OnboardingOutcome.Skipped;
							}
							if (!rowResult || !await rowResult || token?.isCancellationRequested) { return OnboardingOutcome.Aborted; }
						} finally { listener.dispose(); }
					}
					const step = steps[steps.length - 1];
					await step.onBeforeShow?.();
					if (token?.isCancellationRequested) { return OnboardingOutcome.Aborted; }
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
					assert.strictEqual(step.primaryAction?.label, 'Use Copilot');
					if (scenario === 'cancelled') { return OnboardingOutcome.Dismissed; }
					let result: Promise<boolean> | undefined;
					const listener = onDidSelectOnboardingTarget(resolved.element)(promise => { result = promise; });
					try {
						if (useModelButton) {
							if (scenario === 'buttonIneligible') { eligible = false; }
							if (scenario === 'buttonBlocked') { blocked.set(true, undefined); }
							if (scenario === 'buttonAlreadySelected') { selected.set(target, undefined); }
							const action = step.primaryAction!.run(buttonCancellation.token);
							if (scenario === 'buttonCancelled') { buttonCancellation.cancel(); }
							await action;
						} else {
							selected.set(target, undefined);
							selections.fire({ fromModelId: 'source', toModelId: scenario === 'wrongModel' ? 'other' : target.identifier });
						}
						assert.strictEqual(actions.includes('guideCompleted'), false, 'optimistic changes do not complete');
						committed = upcastPartial<ChatState>({ draft: upcastPartial<NonNullable<ChatState['draft']>>({ model: { id: target.metadata.id } }) });
						confirmations.fire(upcastPartial<ActionEnvelope>({ action: { type: ActionType.ChatDraftChanged, draft: committed.draft }, origin: { clientId: 'client', clientSeq: 1 }, ...(scenario === 'rejected' || scenario === 'buttonRejected' ? { rejectionReason: 'denied' } : {}) }));
						return result && await result && !token?.isCancellationRequested ? OnboardingOutcome.Completed : OnboardingOutcome.Dismissed;
					} finally { listener.dispose(); }
				}
			}();
			const guide = store.add(new CodexContinuationGuide(nudge, connections, onboarding,
				upcastPartial<IWorkspaceTrustManagementService>({ isWorkspaceTrusted: () => scenario !== 'restricted', onDidChangeTrust: Event.None }),
				upcastPartial<INotificationService>({ info: () => { } }),
				upcastPartial<IHostService>({ hasFocus: true, onDidChangeFocus: Event.None }), widgets));
			let reveals = 0;
			let releases = 0;
			await guide.run(candidate, 'editorWindow', {
				getActiveWidget: () => active,
				revealSession: async requested => {
					assert.strictEqual(requested.toString(), resource.toString());
					reveals++;
					return {
						getElement: () => row, onDidOpen: sessionOpened.event, focus: () => { }, dispose: () => { releases++; },
						open: async () => {
							rowOpens++;
							if (scenario === 'rowOpenDeclined') { return false; }
							if (scenario === 'rowButtonCancelled') { await openStarted.complete(); await openPending.p; }
							active = widget;
							return true;
						},
					};
				},
			});
			if (scenario === 'cancelledDuringOpen') {
				active = widget;
				focused.fire();
				await timeout(0);
				assert.deepStrictEqual(opened, [], 'a late open cannot revive a cancelled guide');
			}
			const neverShown = scenario === 'restricted' || scenario === 'noSearch' || scenario === 'blocked';
			const completes = ['accepted', 'replaced', 'rowAccepted', 'buttonAccepted', 'rowButtonAccepted', 'buttonsAccepted'].includes(scenario);
			assert.strictEqual(actions.includes('guideCompleted'), completes);
			assert.strictEqual(actions.filter(action => action === 'guideShown').length, neverShown ? 0 : 1);
			assert.strictEqual(spotlightShows, neverShown ? 0 : scenario === 'replaced' || (startWithRow && completes) ? 2 : 1);
			assert.deepStrictEqual({ rowOpens, buttonSelections }, {
				rowOpens: useRowButton ? 1 : 0,
				buttonSelections: ['buttonAccepted', 'buttonsAccepted', 'buttonRejected'].includes(scenario) ? [target.identifier] : [],
			});
			assert.strictEqual(element.hasAttribute(ONBOARDING_TARGET_ATTR), false, 'run target is disposed');
			assert.strictEqual(foreign.hasAttribute(ONBOARDING_TARGET_ATTR), false, 'replacement target is disposed');
			assert.deepStrictEqual({ reveals, releases }, { reveals: startWithRow ? 1 : 0, releases: startWithRow ? 1 : 0 });
		});
	}

	test('waits for the exact widget owner after session opening completes', async () => {
		const resource = URI.parse('agent-host-codex:/one');
		const otherResource = URI.parse('agent-host-codex:/other');
		const added = store.add(new Emitter<IChatWidget>());
		const focusedSessionChanged = store.add(new Emitter<void>());
		const widgets: IChatWidget[] = [];
		const other = upcastPartial<IChatWidget>({
			visible: true,
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: otherResource }),
			onDidChangeViewModel: Event.None,
		});
		const exact = upcastPartial<IChatWidget>({
			visible: true,
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: resource }),
			onDidChangeViewModel: Event.None,
		});
		const service = upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return widgets.at(-1); },
			getAllWidgets: () => widgets,
			onDidAddWidget: added.event,
			onDidChangeFocusedSession: focusedSessionChanged.event,
			onDidChangeWidgetVisibility: Event.None,
		});
		const cancellation = store.add(new CancellationTokenSource());
		const result = waitForActiveChatWidget(resource, service, () => widgets.at(-1), cancellation.token, 1_000);
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
			onDidChangeWidgetVisibility: Event.None,
		});
		const cancellation = store.add(new CancellationTokenSource());
		const result = waitForActiveChatWidget(resource, service, () => widgets.at(-1), cancellation.token, 1_000);
		cancellation.cancel();
		const exact = upcastPartial<IChatWidget>({
			visible: true,
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: resource }),
			onDidChangeViewModel: Event.None,
		});
		widgets.push(exact);
		added.fire(exact);

		assert.strictEqual(await result, undefined);
	});
});
