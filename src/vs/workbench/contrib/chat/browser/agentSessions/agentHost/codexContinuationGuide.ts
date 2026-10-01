/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
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
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';

export const CODEX_CONTINUATION_MESSAGE = localize('codexContinuation.message', "You're nearing your ChatGPT limit. Continue your Codex sessions with your Copilot subscription.");
export const CODEX_CONTINUATION_LABEL = localize('codexContinuation.continue', "Continue with Copilot");
export const CODEX_CONTINUATION_DISABLE_LABEL = localize('codexContinuation.disable', "Don't Show Again");

const WIDGET_MATERIALIZATION_TIMEOUT = 5_000;

export interface ICodexContinuationSessionTarget extends IDisposable {
	readonly onDidOpen: Event<URI>;
	getElement(): HTMLElement | undefined;
	open(token: CancellationToken): Promise<boolean>;
	focus(): void;
}

export interface ICodexContinuationNavigation {
	getActiveWidget(): IChatWidget | undefined;
	revealSession(resource: URI, token: CancellationToken): Promise<ICodexContinuationSessionTarget | undefined>;
}

/**
 * Waits for a user-opened session's active widget to materialize. Never opens a
 * session or falls back to an inactive widget that happens to show the same chat.
 */
export function waitForActiveChatWidget(
	resource: URI,
	widgets: IChatWidgetService,
	getActiveWidget: () => IChatWidget | undefined,
	token: CancellationToken,
	timeoutMs = WIDGET_MATERIALIZATION_TIMEOUT,
): Promise<IChatWidget | undefined> {
	const store = new DisposableStore();
	let settled = false;
	let resolveResult: (widget: IChatWidget | undefined) => void;
	const result = new Promise<IChatWidget | undefined>(resolve => {
		resolveResult = resolve;
	});
	const matches = (widget: IChatWidget | undefined): widget is IChatWidget =>
		!!widget?.visible && widget.viewModel?.sessionResource.toString() === resource.toString();
	const finish = (widget: IChatWidget | undefined) => {
		if (settled) {
			return;
		}
		settled = true;
		store.dispose();
		resolveResult(widget);
	};
	const tryFinish = () => {
		const active = getActiveWidget();
		if (matches(active)) { finish(active); }
	};
	const observe = (widget: IChatWidget) => store.add(widget.onDidChangeViewModel(tryFinish));
	for (const widget of widgets.getAllWidgets()) {
		observe(widget);
	}
	store.add(widgets.onDidAddWidget(widget => {
		observe(widget);
		tryFinish();
	}));
	store.add(widgets.onDidChangeFocusedSession(tryFinish));
	store.add(widgets.onDidChangeWidgetVisibility(tryFinish));
	store.add(token.onCancellationRequested(() => finish(undefined)));
	store.add(disposableTimeout(() => finish(undefined), timeoutMs));

	if (token.isCancellationRequested) { finish(undefined); }
	else { tryFinish(); }
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
		@IChatWidgetService private readonly _widgets: IChatWidgetService,
	) { super(); }

	async run(candidate: ICodexContinuationCandidate, surface: CodexContinuationSurface, navigation: ICodexContinuationNavigation): Promise<void> {
		const store = new DisposableStore();
		this._run.value = store;
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		const row = store.add(new MutableDisposable<ICodexContinuationSessionTarget>());
		let widget: IChatWidget | undefined;
		let completed = false;
		let guideShown = false;
		let unavailable = false;
		this._nudge.log('continueClicked', surface);
		try {
			const current = await this._nudge.resolve(candidate);
			if (!current || store.isDisposed || !this._host.hasFocus || !this._trust.isWorkspaceTrusted()) { throw new Error('unavailable'); }
			const resource = this._connections.getSessionResource(current.session.session);
			const activeWidget = () => {
				const active = navigation.getActiveWidget();
				return active?.visible && active.viewModel?.sessionResource.toString() === resource.toString() ? active : undefined;
			};
			const validRun = () => !store.isDisposed && !cancellation.token.isCancellationRequested
				&& this._nudge.ownsEpisode() && this._trust.isWorkspaceTrusted();
			const validOwner = () => validRun() && !!widget && widget === activeWidget();
			const abortUnavailable = () => { unavailable = true; cancellation.cancel(); };
			const revalidate = async () => {
				if (!validRun()) { return false; }
				const eligible = await this._nudge.resolve(candidate);
				if (!validRun()) { return false; }
				if (!eligible) { abortUnavailable(); return false; }
				return true;
			};
			const didShow = () => {
				if (!guideShown) { guideShown = true; this._nudge.log('guideShown', surface); }
			};
			store.add(autorun(reader => {
				this._nudge.revision.read(reader);
				if (!validRun()) { cancellation.cancel(); }
			}));
			store.add(this._trust.onDidChangeTrust(trusted => { if (!trusted) { cancellation.cancel(); } }));

			widget = activeWidget();
			const id = `codex.continuation.${generateUuid()}`;
			const steps: ISpotlightStep[] = [];
			if (!widget) {
				row.value = await navigation.revealSession(resource, cancellation.token);
				const target = row.value;
				if (!target || !validRun()) { throw new Error('unavailable'); }
				const opened = store.add(new Emitter<Promise<boolean>>());
				const onSessionOpened = (token: CancellationToken) => {
					opened.fire((async () => {
						const active = await waitForActiveChatWidget(resource, this._widgets, activeWidget, token);
						if (token.isCancellationRequested || !validRun()) { return false; }
						widget = active;
						if (!widget || !await revalidate()) { abortUnavailable(); return false; }
						return !token.isCancellationRequested;
					})());
				};
				store.add(target.onDidOpen(openedResource => {
					if (openedResource.toString() !== resource.toString()) { cancellation.cancel(); return; }
					onSessionOpened(cancellation.token);
				}));
				const rowId = `${id}.session`;
				store.add(registerOnboardingTargetProvider(rowId, () => {
					const element = validRun() ? target.getElement() : undefined;
					return element ? { element, onDidSelect: opened.event } : undefined;
				}));
				steps.push({
					id: 'openSession', targetId: rowId,
					title: localize('codexContinuation.openSession', "Open a Codex Session"),
					description: localize('codexContinuation.openSession.description', "This Codex session uses your ChatGPT subscription. Open it to continue with your Copilot subscription."),
					placement: 'right', allowTargetInteraction: true, advanceOnTargetSelection: true,
					primaryAction: {
						label: localize('codexContinuation.openSession.action', "Open Session"),
						run: async token => {
							if (token.isCancellationRequested || !await revalidate() || token.isCancellationRequested) { return; }
							try {
								const didOpen = await target.open(token);
								if (token.isCancellationRequested || !validRun()) { return; }
								if (!didOpen) { cancellation.cancel(); return; }
								onSessionOpened(token);
							} catch { if (!token.isCancellationRequested && validRun()) { abortUnavailable(); } }
						},
					},
					missingTarget: { kind: 'wait', timeoutMs: WIDGET_MATERIALIZATION_TIMEOUT, onTimeout: 'abort' },
					onBeforeShow: async () => { await revalidate(); },
					onDidShow: didShow,
				});
			}

			const accepted = store.add(new Emitter<Promise<boolean>>());
			const markedTarget = store.add(new MutableDisposable());
			let markedElement: HTMLElement | undefined;
			let prepared = false;
			const getTarget = () => widget?.input.availableLanguageModels.find(model => model.metadata.id === current.target.id && model.metadata.isUserSelectable !== false);
			store.add(registerOnboardingTargetProvider(id, () => {
				if (!prepared || !validOwner()) { return undefined; }
				const control = widget!.input.getModelPickerControl();
				const target = getTarget();
				if (!control || !target) { return undefined; }
				if (markedElement !== control.element) {
					markedElement = control.element;
					markedTarget.value = markOnboardingTarget(control.element, id, { onDidSelect: accepted.event });
				}
				return {
					element: control.element,
					open: () => {
						const currentControl = widget?.input.getModelPickerControl();
						const currentTarget = getTarget();
						if (validOwner() && currentControl?.element === control.element && currentTarget?.identifier === target.identifier) {
							currentControl.open({ initialFilterValue: currentTarget.metadata.name, initialFocusItemId: currentTarget.identifier });
						}
					},
				};
			}));
			steps.push({
				id: 'chooseCopilot', targetId: id, title: CODEX_CONTINUATION_LABEL,
				description: localize('codexContinuation.guide', "Select {0} from GitHub Copilot to continue this session.", current.target.name),
				placement: 'left', openTarget: true, allowTargetInteraction: true, advanceOnTargetSelection: true,
				primaryAction: {
					label: localize('codexContinuation.useCopilot', "Use Copilot"),
					run: async token => {
						if (token.isCancellationRequested || !await revalidate() || token.isCancellationRequested) { return; }
						if (!validOwner() || widget!.viewModel!.model.isInputBlocked.get()) { abortUnavailable(); return; }
						const target = getTarget();
						if (target && widget!.input.selectedLanguageModel.get()?.identifier === target.identifier) { cancellation.cancel(); return; }
						if (!target || !widget!.input.getModelPickerControl()?.select(target.identifier)) { abortUnavailable(); }
					},
				},
				missingTarget: { kind: 'wait', timeoutMs: WIDGET_MATERIALIZATION_TIMEOUT, onTimeout: 'abort' },
				onDidShow: didShow,
				onBeforeShow: async () => {
					if (!await revalidate()) { return; }
					if (!validOwner() || widget!.viewModel!.model.isInputBlocked.get()) { abortUnavailable(); return; }
					if (prepared) { return; }
					const owner = widget!;
					const resolution = this._connections.resolveSessionResource(resource);
					const session = resolution?.connection.getSubscriptionUnmanaged(StateComponents.Session, resolution.backendSession)?.verifiedValue;
					const chat = session?.defaultChat && resolution?.connection.getSubscriptionUnmanaged(StateComponents.Chat, URI.parse(session.defaultChat));
					if (!resolution || !chat) { abortUnavailable(); return; }
					let explicitSelection = false;
					store.add(owner.input.onDidChangeUserSelectedModel(event => {
						explicitSelection = event.toModelId === getTarget()?.identifier;
						if (!explicitSelection) { cancellation.cancel(); }
					}));
					store.add(owner.onDidChangeViewModel(() => {
						if (owner.viewModel?.sessionResource.toString() !== resource.toString()) { cancellation.cancel(); }
					}));
					store.add(this._widgets.onDidChangeFocusedSession(() => { if (!validOwner()) { cancellation.cancel(); } }));
					store.add(chat.onDidApplyAction(envelope => {
						if (envelope.action.type !== ActionType.ChatDraftChanged || envelope.origin?.clientId !== resolution.connection.clientId) { return; }
						if (envelope.rejectionReason) { cancellation.cancel(); return; }
						const target = getTarget();
						if (target && explicitSelection && validOwner() && chat.verifiedValue?.draft?.model?.id === target.metadata.id
							&& owner.input.selectedLanguageModel.get()?.identifier === target.identifier) {
							accepted.fire((async () => {
								const eligible = await this._nudge.resolve(candidate, undefined, true);
								completed = !!eligible && validOwner() && chat.verifiedValue?.draft?.model?.id === target.metadata.id;
								return completed;
							})());
						}
					}));
					prepared = true;
				},
			});
			store.add(onboardingScenarioRegistry.register({
				id, repeatable: true, trigger: { kind: 'command', commandId: id },
				presentation: { kind: SPOTLIGHT_PRESENTATION_KIND, payload: { steps } satisfies ISpotlightPayload },
			}));
			const outcome = await this._onboarding.runScenario(id, cancellation.token);
			if (unavailable) { throw new Error('unavailable'); }
			if (completed && outcome === OnboardingOutcome.Completed && validOwner()) { await this._nudge.complete(surface); }
			else { this._nudge.log('guideCancelled', surface); }
		} catch {
			if (!store.isDisposed) {
				this._nudge.log('guideUnavailable', surface);
				this._notifications.info(localize('codexContinuation.unavailable', "This Copilot continuation is no longer available. Review the session's model picker to continue."));
			}
		} finally {
			if (!store.isDisposed && this._host.hasFocus) {
				if (widget?.visible && widget === navigation.getActiveWidget()) { widget.focusInput(); }
				else { row.value?.focus(); }
			}
			store.dispose();
		}
	}
}
