/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
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
import { markOnboardingTarget, registerOnboardingTargetProvider } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';

export const CODEX_CONTINUATION_MESSAGE = localize('codexContinuation.message', "You're nearing your ChatGPT limit. Continue this Codex session with your Copilot subscription.");
export const CODEX_CONTINUATION_LABEL = localize('codexContinuation.continue', "Continue with Copilot");
export const CODEX_CONTINUATION_DISABLE_LABEL = localize('codexContinuation.disable', "Don't Show Again");

const WIDGET_MATERIALIZATION_TIMEOUT = 5_000;

/**
 * Opens a session and waits for the exact widget owner to materialize. Sessions
 * can finish opening before their Chat widget is mounted, so observe the widget
 * service rather than sampling its registry once.
 */
export function openAndWaitForChatWidget(
	resource: URI,
	widgets: IChatWidgetService,
	open: () => Promise<IChatWidget | undefined>,
	token: CancellationToken,
	timeoutMs = WIDGET_MATERIALIZATION_TIMEOUT,
): Promise<IChatWidget | undefined> {
	const store = new DisposableStore();
	const touched: IChatWidget[] = [];
	let openCompleted = false;
	let settled = false;
	let resolveResult: (widget: IChatWidget | undefined) => void;
	let rejectResult: (error: unknown) => void;
	const result = new Promise<IChatWidget | undefined>((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	const matches = (widget: IChatWidget | undefined): widget is IChatWidget =>
		widget?.viewModel?.sessionResource.toString() === resource.toString();
	const finish = (widget: IChatWidget | undefined, error?: unknown) => {
		if (settled) {
			return;
		}
		settled = true;
		store.dispose();
		if (error !== undefined) {
			rejectResult(error);
		} else {
			resolveResult(widget);
		}
	};
	const tryFinish = (openedWidget?: IChatWidget) => {
		if (!openCompleted || settled) {
			return;
		}
		if (matches(openedWidget)) {
			finish(openedWidget);
			return;
		}
		if (matches(widgets.lastFocusedWidget)) {
			finish(widgets.lastFocusedWidget);
			return;
		}
		const touchedWidget = touched.findLast(matches);
		if (touchedWidget) {
			finish(touchedWidget);
			return;
		}
		const matchingWidgets = widgets.getAllWidgets().filter(matches);
		if (matchingWidgets.length === 1) {
			finish(matchingWidgets[0]);
		}
	};
	const observe = (widget: IChatWidget, wasTouched: boolean) => {
		if (wasTouched && matches(widget)) {
			touched.push(widget);
		}
		store.add(widget.onDidChangeViewModel(() => {
			if (matches(widget)) {
				touched.push(widget);
			}
			tryFinish();
		}));
	};
	for (const widget of widgets.getAllWidgets()) {
		observe(widget, false);
	}
	store.add(widgets.onDidAddWidget(widget => {
		observe(widget, true);
		tryFinish();
	}));
	store.add(widgets.onDidChangeFocusedSession(() => {
		if (matches(widgets.lastFocusedWidget)) {
			touched.push(widgets.lastFocusedWidget);
		}
		tryFinish();
	}));
	store.add(token.onCancellationRequested(() => finish(undefined)));
	store.add(disposableTimeout(() => finish(undefined), timeoutMs));

	void open().then(openedWidget => {
		openCompleted = true;
		tryFinish(openedWidget);
	}, error => finish(undefined, error));
	return result;
}

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

	async run(candidate: ICodexContinuationCandidate, surface: CodexContinuationSurface, open: (resource: URI, token: CancellationToken) => Promise<IChatWidget | undefined>): Promise<void> {
		const store = new DisposableStore();
		this._run.value = store;
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		let widget: IChatWidget | undefined;
		let completed = false;
		let guideShown = false;
		this._nudge.log('continueClicked', surface);
		try {
			let current = await this._nudge.resolve(candidate);
			if (!current || store.isDisposed || !this._host.hasFocus || !this._trust.isWorkspaceTrusted()) { throw new Error('unavailable'); }
			const resource = this._connections.getSessionResource(current.session.session);
			widget = await open(resource, cancellation.token);
			current = await this._nudge.resolve(candidate);
			if (!current || store.isDisposed || !widget || widget.viewModel?.sessionResource.toString() !== resource.toString() || !this._trust.isWorkspaceTrusted()) { throw new Error('unavailable'); }
			const owner = widget;
			const resolution = this._connections.resolveSessionResource(resource);
			if (!resolution) { throw new Error('unavailable'); }
			const session = resolution.connection.getSubscriptionUnmanaged(StateComponents.Session, resolution.backendSession)?.verifiedValue;
			const chat = session?.defaultChat && resolution.connection.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(session.defaultChat));
			if (!chat) { throw new Error('unavailable'); }
			const validOwner = () => !store.isDisposed && this._nudge.ownsEpisode() && this._trust.isWorkspaceTrusted()
				&& owner.viewModel?.sessionResource.toString() === resource.toString();
			const getTarget = () => owner.input.availableLanguageModels.find(model => model.metadata.id === current!.target.id && model.metadata.isUserSelectable !== false);
			let explicitSelection = false;
			store.add(autorun(reader => {
				this._nudge.revision.read(reader);
				if (!validOwner()) { cancellation.cancel(); }
			}));
			const accepted = store.add(new Emitter<Promise<boolean>>());
			store.add(owner.input.onDidChangeUserSelectedModel(event => {
				explicitSelection = event.toModelId === getTarget()?.identifier;
				if (!explicitSelection) { cancellation.cancel(); }
			}));
			store.add(owner.onDidChangeViewModel(() => {
				if (owner.viewModel?.sessionResource.toString() !== resource.toString()) { cancellation.cancel(); }
			}));
			store.add(this._trust.onDidChangeTrust(trusted => { if (!trusted) { cancellation.cancel(); } }));
			store.add(chat.onDidApplyAction(envelope => {
				if (envelope.action.type !== ActionType.ChatDraftChanged || envelope.origin?.clientId !== resolution.connection.clientId) { return; }
				if (envelope.rejectionReason) { cancellation.cancel(); return; }
				const target = getTarget();
				if (target && explicitSelection && validOwner() && chat.verifiedValue?.draft?.model?.id === target.metadata.id
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
			const markedTarget = store.add(new MutableDisposable());
			let markedElement: HTMLElement | undefined;
			store.add(registerOnboardingTargetProvider(id, () => {
				if (!validOwner()) {
					return undefined;
				}
				const control = owner.input.getModelPickerControl();
				const target = getTarget();
				if (!control || !target) {
					return undefined;
				}
				if (markedElement !== control.element) {
					markedElement = control.element;
					markedTarget.value = markOnboardingTarget(control.element, id, { onDidSelect: accepted.event });
				}
				return {
					element: control.element,
					open: () => {
						const currentControl = owner.input.getModelPickerControl();
						const currentTarget = getTarget();
						if (validOwner() && currentControl?.element === control.element && currentTarget?.identifier === target.identifier) {
							currentControl.open({ initialFilterValue: currentTarget.metadata.name, initialFocusItemId: currentTarget.identifier });
						}
					},
				};
			}));
			store.add(onboardingScenarioRegistry.register({
				id, repeatable: true, trigger: { kind: 'command', commandId: id },
				presentation: {
					kind: SPOTLIGHT_PRESENTATION_KIND, payload: {
						steps: [{
							id: 'chooseCopilot', targetId: id, title: CODEX_CONTINUATION_LABEL,
							description: localize('codexContinuation.guide', "Select {0} from GitHub Copilot to continue this session.", current.target.name),
							placement: 'left',
							openTarget: true, allowTargetInteraction: true, advanceOnTargetSelection: true, hideNext: true,
							missingTarget: { kind: 'wait', timeoutMs: WIDGET_MATERIALIZATION_TIMEOUT, onTimeout: 'abort' },
							onDidShow: () => {
								if (!guideShown) {
									guideShown = true;
									this._nudge.log('guideShown', surface);
								}
							},
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
