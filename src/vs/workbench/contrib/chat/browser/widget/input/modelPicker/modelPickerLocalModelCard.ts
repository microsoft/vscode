/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { status as ariaStatus } from '../../../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { getBaseLayerHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { createPixelSpinner, IPixelSpinner } from '../../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Radio } from '../../../../../../../base/browser/ui/radio/radio.js';
import { Switch } from '../../../../../../../base/browser/ui/toggle/switch.js';
import { Action, IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { escapeMarkdownSyntaxTokens } from '../../../../../../../base/common/htmlContent.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { getLocalModelSafetyDisclosure, ILocalModelContextV1, ILocalModelFamilyV1, ILocalModelLoadV1, ILocalModelMemoryWarningV1, ILocalModelOperationV1, ILocalModelStatusV1 } from '../../../../../../../platform/agentHost/common/localModel.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { getLocalModelErrorActionLabel } from '../../../agentSessions/agentHost/localModelErrorActions.js';
import { buildLocalModelSetUpConsent, formatLocalModelBytes, formatLocalModelDuration, getLocalModelDrainingStreams, getLocalModelLoad, getLocalModelLoadProgress, getLocalModelLoadStepKey, getLocalModelSetUpAgreement, ILocalModelLicenseLink, ILocalModelSetUpConsent, isLocalModelReload, LocalModelEntryPath, LocalModelLoadTicker } from '../../../agentSessions/agentHost/localModelSetupFlow.js';
import { getLocalModelServerStopId } from '../../../../../../services/agentHost/common/localModelService.js';
import { createModelCardChoiceControl, IModelCardChoice } from './modelPickerCard.js';
import { createMessageBanner } from './modelPickerHover.js';
import { formatLocalModelContextTokens, getLocalModelFamilyError, getLocalModelLoadStepLabel, getLocalModelOperationPercent, getLocalModelPausedLabel, getLocalModelPausedReasonLabel, getLocalModelPreparingLabel, getLocalModelRunningAction, getLocalModelServingContextTokens, getLocalModelStateLabel, getLocalModelThinkingProperty, getLocalModelThinkingTitle, ILocalModelDetails, ILocalModelDirectModelConfig, ILocalModelFamilyError, ILocalModelPickerActionRequest, needsLocalModelSetUpConsent } from './modelPickerLocalModelItems.js';
import { getModelConfigChoices, setModelConfigValues } from './modelPickerModelConfig.js';

/** The parts of the Status section that follow progress without a re-render. */
interface IProgressElements {
	readonly text: HTMLElement;
	readonly track: HTMLElement | undefined;
	readonly fill: HTMLElement | undefined;
	readonly note: HTMLElement;
}

/** The thinking level the page shows, so a change made elsewhere re-renders it. */
function getThinkingSignature(directModel: ILocalModelDirectModelConfig | undefined): unknown {
	const property = directModel && getLocalModelThinkingProperty(directModel.model, directModel.configurationAccess);
	return property && [property.key, property.value, property.schema.enum];
}

/** Everything the page shows except progress: a change re-renders it, progress alone updates it in place. */
function getCardSignature({ status, family, readiness, directModel, pendingStops }: ILocalModelDetails): string {
	const { usage: _usage, operation, ...rest } = family;
	return JSON.stringify([
		readiness,
		rest,
		operation && { ...operation, completedBytes: undefined, bytesPerSecond: undefined },
		status.runtime,
		status.active && { ...status.active, drain: !!status.active.drain },
		status.useInAuto,
		status.device,
		getThinkingSignature(directModel),
		[operation?.id, getLocalModelServerStopId(family.familyId)].map(id => !!id && !!pendingStops?.has(id)),
	]);
}

/** What the Status section shows: the text, the bar's percentage when known, and a note such as the time remaining. */
interface IStatusProgress {
	readonly text: string;
	readonly percent: number | undefined;
	readonly note: string | undefined;
}

/** The progress of a model load (estimated from the last comparable one, also during a swap's loading phase), else of the family's operation. */
function getStatusProgress(family: ILocalModelFamilyV1, status: ILocalModelStatusV1, now: number): IStatusProgress | undefined {
	const operation = family.operation;
	const load = getLocalModelLoad(status, family);
	if (load && (!operation || (operation.state === 'running' && operation.phase === 'loading'))) {
		const { percent, remaining, overdue } = getLocalModelLoadProgress(load, now);
		const note = remaining
			? localize('localModel.card.remaining', "About {0} remaining", remaining)
			: overdue ? localize('localModel.card.almostDone', "Almost done\u2026") : undefined;
		return { text: getLoadStatusText(load, isLocalModelReload(status, family)), percent, note };
	}
	return operation && operation.state !== 'error'
		? { text: getOperationText(family, status, operation), percent: getLocalModelOperationPercent(family), note: getRemainingText(operation) }
		: undefined;
}

/** What the Status section says about a load: its step, or that it retries and how. */
function getLoadStatusText(load: ILocalModelLoadV1, reload: boolean): string {
	return load.retry === 'withoutSpeculativeDecoding'
		? localize('localModel.card.retryingWithoutSpeculativeDecoding', "Retrying without speculative decoding\u2026")
		: getLocalModelLoadStepLabel(load, reload);
}

/** What the Status section says about a running or paused operation. */
function getOperationText(family: ILocalModelFamilyV1, status: ILocalModelStatusV1, operation: ILocalModelOperationV1): string {
	if (operation.state === 'paused') {
		const reason = getLocalModelPausedReasonLabel(family);
		return reason
			? localize('localModel.card.pausedWithReason', "{0} \u00b7 {1}", getLocalModelPausedLabel(family), reason)
			: getLocalModelPausedLabel(family);
	}
	if (operation.phase === 'downloading' && operation.totalBytes && operation.completedBytes !== undefined) {
		return localize('localModel.card.downloading', "Downloading: {0} of {1}", formatLocalModelBytes(operation.completedBytes), formatLocalModelBytes(operation.totalBytes));
	}
	return getLocalModelPreparingLabel(family, status);
}

function getRemainingText(operation: ILocalModelOperationV1): string | undefined {
	const { state, phase, completedBytes, totalBytes, bytesPerSecond } = operation;
	if (state !== 'running' || phase !== 'downloading' || !totalBytes || completedBytes === undefined || !bytesPerSecond || bytesPerSecond <= 0) {
		return undefined;
	}
	const remainingMs = Math.max(0, totalBytes - completedBytes) / bytesPerSecond * 1000;
	return remainingMs < 60_000
		? localize('localModel.card.remainingUnderMinute', "Less than a minute remaining")
		: localize('localModel.card.remaining', "About {0} remaining", formatLocalModelDuration(remainingMs));
}

/** What the first header icon shows: the model's state, and what choosing it does. */
interface IStateIcon {
	/** `busy` shows the in-progress indicator of an active session, and the icon of its action on hover or keyboard focus. */
	readonly busy: boolean;
	/** The icon of the action; it also keeps the icon's width while the indicator stands in for it. */
	readonly icon: ThemeIcon;
	/** The accessible name and hover: the action, or while busy the state and then the action. */
	readonly label: string;
	/** What choosing it requests; none while a stop is pending or the step can't be stopped. */
	readonly request: Pick<ILocalModelPickerActionRequest, 'action' | 'operationId'> | undefined;
}

/** What `family` is busy with, named after it, e.g. "Downloading Example Flash 41%" or "Loading Example Flash". */
function getBusyStateText(family: ILocalModelFamilyV1, status: ILocalModelStatusV1): string {
	const name = family.displayName;
	const operation = family.operation?.state === 'running' ? family.operation : undefined;
	const load = getLocalModelLoad(status, family);
	const reload = isLocalModelReload(status, family);
	if (load && (!operation || operation.phase === 'loading')) {
		if (load.retry === 'withoutSpeculativeDecoding') {
			return localize('localModel.card.busy.retrying', "Retrying {0} without speculative decoding", name);
		}
		if (load.step === 'warmingUp') {
			return localize('localModel.card.busy.warmingUp', "Warming up {0}", name);
		}
		return reload ? localize('localModel.card.busy.reloading', "Reloading {0}", name) : localize('localModel.card.busy.loading', "Loading {0}", name);
	}
	if (operation) {
		switch (operation.phase) {
			case 'downloading': {
				const percent = getLocalModelOperationPercent(family);
				return percent === undefined
					? localize('localModel.card.busy.downloading', "Downloading {0}", name)
					: localize('localModel.card.busy.downloadingPercent', "Downloading {0} {1}%", name, percent);
			}
			case 'verifying': return localize('localModel.card.busy.verifying', "Verifying {0}", name);
			case 'draining': {
				const streams = getLocalModelDrainingStreams(status, family);
				if (streams !== undefined) {
					return streams === 1
						? localize('localModel.card.busy.drainingOne', "Waiting for 1 response to finish")
						: localize('localModel.card.busy.draining', "Waiting for {0} responses to finish", streams);
				}
				break;
			}
		}
		switch (operation.kind) {
			case 'remove': return localize('localModel.card.busy.removing', "Removing {0}", name);
			case 'update': return localize('localModel.card.busy.updating', "Updating {0}", name);
			case 'swap': return reload ? localize('localModel.card.busy.reloading', "Reloading {0}", name) : localize('localModel.card.busy.loading', "Loading {0}", name);
			default: return localize('localModel.card.busy.settingUp', "Setting up {0}", name);
		}
	}
	return status.active?.familyId === family.familyId && status.active.server === 'stopping'
		? localize('localModel.card.busy.stopping', "Stopping {0}", name)
		: localize('localModel.card.busy.loading', "Loading {0}", name);
}

/** The in-progress indicator, which turns into `action` (labelled, e.g. Cancel, or Cancelling... once sent) on hover or keyboard focus. */
function getBusyStateIcon(family: ILocalModelFamilyV1, status: ILocalModelStatusV1, action?: { readonly label: string; readonly icon: ThemeIcon; readonly request: IStateIcon['request'] }): IStateIcon {
	const state = getBusyStateText(family, status);
	return {
		busy: true,
		icon: action?.icon ?? Codicon.stopCircle,
		label: action ? localize('localModel.card.busyAction', "{0}, {1}", state, action.label) : state,
		request: action?.request,
	};
}

/**
 * The first header icon of `family`: Load while not loaded, Resume while paused, Stop while loaded, and while busy the
 * in-progress indicator that turns into the step's stop action. None while the model needs setting up or failed.
 */
function getStateIcon({ family, readiness, status, pendingStops }: ILocalModelDetails): IStateIcon | undefined {
	const name = family.displayName;
	const operation = family.operation;
	if (operation?.state === 'running') {
		const stop = getLocalModelRunningAction(family, status, pendingStops);
		return getBusyStateIcon(family, status, stop && {
			label: stop.label,
			icon: stop.id === 'localModel.pause' ? Codicon.debugPause : Codicon.stopCircle,
			request: stop.pending ? undefined : stop.request,
		});
	}
	if (operation?.state === 'paused') {
		return operation.pausedReason === 'consentChanged'
			? undefined
			: { busy: false, icon: Codicon.playCircle, label: localize('localModel.action.resumeModel', "Resume {0}", name), request: { action: 'resume', operationId: operation.id } };
	}
	if (!family.install || readiness === 'error' || readiness === 'requiresSetup') {
		return undefined;
	}
	const active = status.active?.familyId === family.familyId ? status.active : undefined;
	const stopPending = !!pendingStops?.has(getLocalModelServerStopId(family.familyId));
	switch (active?.server) {
		case 'starting':
			return getBusyStateIcon(family, status, {
				label: stopPending ? localize('localModel.action.cancelling', "Cancelling\u2026") : localize('localModel.action.cancel', "Cancel"),
				icon: Codicon.stopCircle,
				request: stopPending ? undefined : { action: 'stop' },
			});
		case 'stopping':
			return getBusyStateIcon(family, status);
		case 'ready':
			return stopPending
				? { busy: true, icon: Codicon.stopCircle, label: localize('localModel.card.busy.stopping', "Stopping {0}", name), request: undefined }
				: { busy: false, icon: Codicon.stopCircle, label: localize('localModel.action.stopModel', "Stop {0}", name), request: { action: 'stop' } };
		case 'error':
			return undefined;
	}
	// The model the host loads next, once the active one has unloaded.
	if (!active && status.active?.swapTo === family.familyId) {
		return getBusyStateIcon(family, status);
	}
	return { busy: false, icon: Codicon.playCircle, label: localize('localModel.action.loadModel', "Load {0}", name), request: { action: active ? 'start' : 'makeActive' } };
}

/**
 * The detail page's first header icon: Load, Resume, Stop, or the in-progress indicator that turns into the step's stop
 * action on hover or focus. It stays the same element through state changes, so focus and the spinner persist.
 */
class LocalModelStateActionViewItem extends ActionViewItem {

	private readonly _spinner = this._register(new MutableDisposable<IPixelSpinner>());
	private _indicator: HTMLElement | undefined;

	constructor(action: IAction, options: IActionViewItemOptions, private readonly _accessibilityService: IAccessibilityService) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.label?.classList.add('chat-local-model-card-state-action');
		this._register(this._accessibilityService.onDidChangeReducedMotion(() => {
			this._removeIndicator();
			this._updateIndicator();
		}));
		this._updateIndicator();
	}

	protected override updateClass(): void {
		super.updateClass();
		this._updateIndicator();
	}

	private _updateIndicator(): void {
		const label = this.label;
		if (!label?.classList.contains('busy')) {
			this._removeIndicator();
			return;
		}
		if (this._indicator) {
			return;
		}
		const indicator = this._indicator = dom.append(label, dom.$('span.chat-local-model-card-busy', { 'aria-hidden': 'true' }));
		if (this._accessibilityService.isMotionReduced()) {
			indicator.appendChild(renderIcon(Codicon.sessionInProgress));
		} else {
			this._spinner.value = createPixelSpinner(indicator, { variant: 'grid' });
		}
	}

	private _removeIndicator(): void {
		this._spinner.clear();
		this._indicator?.remove();
		this._indicator = undefined;
	}
}

/**
 * The detail page of an on-device model family in the model picker, mounted like a cloud model's card: header icons,
 * memory warning, error, progress, setup consent, thinking level, context size and Use in Auto. Updates follow the
 * family's status and keep keyboard focus.
 */
export class LocalModelCard extends DisposableStore {

	readonly element = dom.$('.chat-model-card.chat-local-model-card');
	readonly headerElement = dom.$('.chat-model-card-header.chat-local-model-card-header');

	private readonly _contentDisposables = this.add(new DisposableStore());
	/** Focusable controls by a key that is stable across renders, with how to focus them again. */
	private readonly _controls = new Map<string, { readonly element: HTMLElement; focus(): void }>();
	/** The segmented choices, by the same kind of key, which restore focus to the choice that had it. */
	private readonly _choices = new Map<string, Radio>();
	private _details: ILocalModelDetails;
	private _signature: string | undefined;
	private _progress: IProgressElements | undefined;
	/** The header keeps its elements across renders, so its icons keep focus and the in-progress indicator keeps running. */
	private readonly _name: HTMLElement;
	private readonly _headerActions: ActionBar;
	/** The first header icon, which shows the state; it is in {@link _headerActions} while {@link _stateIcon} is set. */
	private readonly _stateAction: Action;
	private _stateIcon: IStateIcon | undefined;
	private _stateViewItem: LocalModelStateActionViewItem | undefined;
	/** Update and Remove, rebuilt only when they change. */
	private readonly _trailingActions = this.add(new DisposableStore());
	private _trailing: readonly { readonly key: string; readonly action: Action }[] = [];
	private readonly _trailingViewItems = new Map<IAction, ActionViewItem>();
	private _trailingSignature: string | undefined;
	/** Whether a button of this render already leads; the rest are secondary. */
	private _hasPrimary = false;
	/** The entry path of the setup consent shown, for telemetry. */
	private _consentShown: LocalModelEntryPath | undefined;
	private _consentAccepted = false;
	/** Only the latest thinking level choice re-renders the page once saved. */
	private _configurationVersion = 0;

	constructor(details: ILocalModelDetails, private readonly _openerService: IOpenerService, accessibilityService: IAccessibilityService) {
		super();
		this._details = details;
		this._name = dom.append(this.headerElement, dom.$('.chat-model-card-name', { role: 'heading', 'aria-level': '2' }));
		this.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), this._name, () => this._details.family.displayName));
		this._stateAction = this.add(new Action('chat.modelPicker.localModel.state', '', undefined, true, async () => {
			const request = this._stateIcon?.request;
			if (request) {
				this._request(this._details, request.action, { operationId: request.operationId })();
			}
		}));
		const container = dom.append(this.headerElement, dom.$('.chat-model-card-actions'));
		this._headerActions = this.add(new ActionBar(container, {
			ariaLabel: localize('localModel.card.actions', "Model Actions"),
			actionViewItemProvider: (action, options) => {
				if (action === this._stateAction) {
					this._stateViewItem = new LocalModelStateActionViewItem(action, options, accessibilityService);
					return this._stateViewItem;
				}
				const item = new ActionViewItem(undefined, action, options);
				this._trailingViewItems.set(action, item);
				return item;
			},
		}));
		this.add(this._headerActions.onDidRun(event => {
			if (event.error) {
				onUnexpectedError(event.error);
			}
		}));
		this._render();
		this.add(toDisposable(() => {
			if (this._consentShown && !this._consentAccepted) {
				this._details.actions.logConsent?.('consentCancelled', this._consentShown);
			}
		}));
	}

	get familyId(): string {
		return this._details.family.familyId;
	}

	/** Shows the family's latest status, keeping keyboard focus; a change of state, or of a load's step, is announced. */
	update(details: ILocalModelDetails): void {
		const previousReadiness = this._details.readiness;
		const previousLoad = getLocalModelLoad(this._details.status, this._details.family);
		this._details = details;
		if (getCardSignature(details) === this._signature) {
			this._updateProgress();
		} else {
			this._renderPreservingFocus();
		}
		if (!this._hasFocus()) {
			return;
		}
		const load = getLocalModelLoad(details.status, details.family);
		if (previousReadiness !== details.readiness) {
			ariaStatus(localize('localModel.card.stateChanged', "{0}: {1}", details.family.displayName, getLocalModelStateLabel(details.family, details.readiness, details.status)));
		} else if (load && previousLoad && getLocalModelLoadStepKey(load) !== getLocalModelLoadStepKey(previousLoad)) {
			ariaStatus(localize('localModel.card.stateChanged', "{0}: {1}", details.family.displayName, getLoadStatusText(load, isLocalModelReload(details.status, details.family))));
		}
	}

	private _hasFocus(): boolean {
		const active = dom.getActiveElement();
		return !!active && (this.element.contains(active) || this.headerElement.contains(active));
	}

	private _renderPreservingFocus(): void {
		const active = dom.getActiveElement();
		const hadFocus = this._hasFocus();
		const choice = [...this._choices].find(([, control]) => dom.isAncestorOfActiveElement(control.domNode));
		const optionIndex = choice?.[1].optionElements.findIndex(element => dom.isActiveElement(element)) ?? -1;
		const key = choice?.[0] ?? [...this._controls].find(([, control]) => control.element === active || control.element.contains(active))?.[0];
		this._render();
		// A header icon keeps its element across renders, and with it focus.
		if (!hadFocus || (active && dom.isActiveElement(active))) {
			return;
		}
		const radio = key ? this._choices.get(key) : undefined;
		const control = key ? this._controls.get(key) : undefined;
		if (radio) {
			if (radio.optionElements[optionIndex]) {
				radio.focusItem(optionIndex);
			} else {
				radio.focusActiveItem();
			}
		} else if (control) {
			control.focus();
		}
		if (!this._hasFocus()) {
			// The control acted on is gone with the state it belonged to, e.g. Download once setup starts.
			this.element.tabIndex = -1;
			this.element.focus();
		}
	}

	private _render(): void {
		this._contentDisposables.clear();
		dom.clearNode(this.element);
		this._controls.clear();
		this._choices.clear();
		this._progress = undefined;
		const details = this._details;
		this._signature = getCardSignature(details);
		const { status, family, readiness } = details;

		this._renderHeader(details);
		if (family.memoryWarning) {
			this._renderMemoryWarning(details, family.memoryWarning);
		}
		const failure = getLocalModelFamilyError(family, status);
		const consent = needsLocalModelSetUpConsent(family, readiness) ? buildLocalModelSetUpConsent(status, family) : undefined;
		// The consent is what the page asks for, so it leads.
		this._hasPrimary = !!consent && consent.buttons.length > 0;

		if (failure) {
			this._renderError(details, failure);
		}
		if (getStatusProgress(family, status, Date.now())) {
			this._renderStatus(details);
		}
		if (consent) {
			this._renderConsent(details, consent);
		}
		if (family.install) {
			this._renderThinking(details);
			if (family.context) {
				this._renderContext(details, family.context);
			}
		}
		if (family.install && family.autoCapable) {
			this._renderUseInAuto(details);
		}
	}

	private _request(details: ILocalModelDetails, action: ILocalModelPickerActionRequest['action'], extra?: Partial<ILocalModelPickerActionRequest>): () => void {
		return () => details.actions.run({ action, familyId: details.family.familyId, readiness: details.readiness, ...extra });
	}

	// #region Building blocks

	private _section(title?: string): HTMLElement {
		const section = dom.append(this.element, dom.$('.chat-model-card-section.chat-local-model-card-section'));
		if (title) {
			const heading = dom.append(section, dom.$('.chat-model-card-section-heading'));
			dom.append(heading, dom.$('.chat-model-card-section-title', { role: 'heading', 'aria-level': '3' }, title));
		}
		return section;
	}

	private _text(container: HTMLElement, text: string): HTMLElement {
		return dom.append(container, dom.$('p.chat-local-model-card-text', undefined, text));
	}

	private _message(container: HTMLElement, text: string, severity: 'error' | 'warning'): void {
		const banner = dom.append(container, dom.$(`.chat-local-model-card-message.${severity}`));
		const icon = renderIcon(severity === 'error' ? Codicon.error : Codicon.warning);
		icon.setAttribute('aria-hidden', 'true');
		banner.appendChild(icon);
		dom.append(banner, dom.$('p', undefined, text));
	}

	private _buttonBar(container: HTMLElement): HTMLElement {
		return dom.append(container, dom.$('.chat-local-model-card-buttons'));
	}

	/** Adds a button: `primary` always leads, the first `lead` leads when nothing else does, the rest are secondary. */
	private _button(container: HTMLElement, key: string, label: string, run: () => void, emphasis: 'primary' | 'lead' | 'secondary' = 'secondary'): Button {
		const primary = emphasis === 'primary' || (emphasis === 'lead' && !this._hasPrimary);
		if (primary) {
			this._hasPrimary = true;
		}
		const button = this._contentDisposables.add(new Button(container, { ...defaultButtonStyles, secondary: !primary }));
		button.label = label;
		this._contentDisposables.add(button.onDidClick(() => run()));
		this._controls.set(key, { element: button.element, focus: () => button.focus() });
		return button;
	}

	private _link(container: HTMLElement, key: string, label: string, url: string): void {
		const link = dom.append(container, dom.$('a.chat-local-model-card-link', { href: url }, label));
		this._contentDisposables.add(dom.addDisposableListener(link, dom.EventType.CLICK, event => {
			dom.EventHelper.stop(event, true);
			void this._openerService.open(URI.parse(url), { allowCommands: false, fromUserGesture: true });
		}));
		this._controls.set(key, { element: link, focus: () => link.focus() });
	}

	private _licenseLink(container: HTMLElement, key: string, license: ILocalModelLicenseLink): void {
		const line = dom.append(container, dom.$('p.chat-local-model-card-text'));
		this._link(line, key, localize('localModel.card.viewLicense', "View the {0} license", license.name), license.url);
	}

	private _progressBar(container: HTMLElement, label: string): { readonly track: HTMLElement; readonly fill: HTMLElement } {
		const track = dom.append(container, dom.$('.chat-local-model-card-progress.indeterminate', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': label }));
		const fill = dom.append(track, dom.$('.chat-local-model-card-progress-fill'));
		return { track, fill };
	}

	/** Adds the segmented choices of a setting, the same control as a cloud model's settings. */
	private _choice(container: HTMLElement, key: string, title: string, choices: readonly IModelCardChoice[], choose: (index: number) => void): void {
		const control = this._contentDisposables.add(createModelCardChoiceControl(title, choices));
		this._contentDisposables.add(control.onDidSelect(index => choose(index)));
		container.appendChild(control.domNode);
		this._choices.set(key, control);
	}

	// #endregion

	/** The name, which also gives the state to screen readers, and the header icons (state, Update, Remove); the elements persist so a changing icon keeps focus. */
	private _renderHeader(details: ILocalModelDetails): void {
		const { family, readiness, status } = details;
		this._name.textContent = family.displayName;
		this._name.setAttribute('aria-description', getLocalModelStateLabel(family, readiness, status));

		const state = this._stateIcon = getStateIcon(details);
		const showsState = this._headerActions.hasAction(this._stateAction);
		if (state) {
			this._updateStateAction(state);
			if (!showsState) {
				this._headerActions.push(this._stateAction, { icon: true, label: false, index: 0 });
			}
		} else if (showsState) {
			this._headerActions.pull(0);
			this._stateViewItem = undefined;
		}

		const entries = this._getTrailingActions(details);
		const signature = JSON.stringify(entries.map(entry => [entry.key, entry.label]));
		const offset = state ? 1 : 0;
		if (signature !== this._trailingSignature) {
			this._trailingSignature = signature;
			while (this._headerActions.length() > offset) {
				this._headerActions.pull(offset);
			}
			this._trailingActions.clear();
			this._trailingViewItems.clear();
			this._trailing = entries.map(entry => ({ key: entry.key, action: this._trailingActions.add(new Action(entry.id, entry.label, ThemeIcon.asClassName(entry.icon), true, async () => this._request(this._details, entry.request)())) }));
			for (const { action } of this._trailing) {
				this._headerActions.push(action, { icon: true, label: false });
			}
		}

		if (state && this._stateViewItem?.element) {
			this._controls.set('header:state', { element: this._stateViewItem.element, focus: () => this._headerActions.focus(0) });
		}
		this._trailing.forEach(({ key, action }, index) => {
			const element = this._trailingViewItems.get(action)?.element;
			if (element) {
				this._controls.set(key, { element, focus: () => this._headerActions.focus(offset + index) });
			}
		});
	}

	/** Shows `state` on the first header icon, in place, so it keeps focus and its indicator. */
	private _updateStateAction(state: IStateIcon): void {
		this._stateAction.label = state.label;
		this._stateAction.class = state.busy ? `${ThemeIcon.asClassName(state.icon)} busy` : ThemeIcon.asClassName(state.icon);
		this._stateAction.enabled = !!state.request;
	}

	/** The header icons after the state: Update when one is available and nothing else is running, and Remove, which asks first. */
	private _getTrailingActions(details: ILocalModelDetails): { readonly key: string; readonly id: string; readonly label: string; readonly icon: ThemeIcon; readonly request: ILocalModelPickerActionRequest['action'] }[] {
		const { family, readiness } = details;
		const name = family.displayName;
		const entries: { readonly key: string; readonly id: string; readonly label: string; readonly icon: ThemeIcon; readonly request: ILocalModelPickerActionRequest['action'] }[] = [];
		const update = family.install?.update;
		if (update && readiness !== 'preparing') {
			entries.push({ key: 'header:update', id: 'chat.modelPicker.localModel.update', label: localize('localModel.action.updateModel', "Update {0} ({1})", name, formatLocalModelBytes(update.downloadBytes)), icon: Codicon.cloudDownload, request: 'update' });
		}
		const removing = family.operation?.kind === 'remove' && family.operation.state === 'running';
		if ((family.install || family.operation?.state === 'paused') && !removing) {
			entries.push({ key: 'header:remove', id: 'chat.modelPicker.localModel.remove', label: localize('localModel.action.removeModel', "Remove {0}...", name), icon: Codicon.trash, request: 'remove' });
		}
		return entries;
	}

	/** Warns, like a cloud model's warning, that the device lacks the GPU memory for this context size, suggesting a smaller one that fits. */
	private _renderMemoryWarning({ family }: ILocalModelDetails, warning: ILocalModelMemoryWarningV1): void {
		const name = escapeMarkdownSyntaxTokens(family.displayName);
		const required = formatLocalModelBytes(warning.requiredBytes);
		const capacity = formatLocalModelBytes(warning.capacityBytes);
		const context = family.context;
		const smallerFits = !!context?.options.some(option => option.tokens < context.tokens && option.gpuBytes <= warning.capacityBytes);
		const message = !context
			? localize('localModel.card.memoryWarning', "{0} needs about {1} of GPU memory. This device has about {2}.", name, required, capacity)
			: smallerFits
				? localize('localModel.card.memoryWarningSmaller', "{0} needs about {1} of GPU memory at {2}. This device has about {3}. Choose a smaller context.", name, required, formatLocalModelContextTokens(context.tokens), capacity)
				: localize('localModel.card.memoryWarningContext', "{0} needs about {1} of GPU memory at {2}. This device has about {3}.", name, required, formatLocalModelContextTokens(context.tokens), capacity);
		this.element.appendChild(createMessageBanner(message, 'chat-model-hover-warning-text', Codicon.warningCompact, this._contentDisposables, this._openerService));
	}

	/** The error and its fixes. */
	private _renderError(details: ILocalModelDetails, failure: ILocalModelFamilyError): void {
		const { error, operationId } = failure;
		const section = this._section();
		this._message(section, error.message, error.code === 'insufficientMemory' ? 'warning' : 'error');
		if (!error.actions.length) {
			return;
		}
		const bar = this._buttonBar(section);
		for (const action of error.actions) {
			this._button(bar, `error:${action}`, getLocalModelErrorActionLabel(action), this._request(details, action, action === 'retry' ? { operationId } : undefined), 'lead');
		}
	}

	/** The Status section: the running or paused operation, or the model's load, with progress; a load's bar and time remaining are estimated and count down on their own. */
	private _renderStatus(details: ILocalModelDetails): void {
		const { family, status } = details;
		const operation = family.operation?.state === 'error' ? undefined : family.operation;
		const load = getLocalModelLoad(status, family);
		const section = this._section(localize('localModel.card.status', "Status"));
		const text = this._text(section, '');
		const showsBar = !!load || operation?.state === 'running' || getLocalModelOperationPercent(family) !== undefined;
		const bar = showsBar ? this._progressBar(section, localize('localModel.card.progress', "{0} progress", family.displayName)) : undefined;
		const note = dom.append(section, dom.$('p.chat-local-model-card-note'));
		if (load?.retry === 'withoutSpeculativeDecoding') {
			dom.append(section, dom.$('p.chat-local-model-card-note', undefined, localize('localModel.card.retryWithoutSpeculativeDecoding', "This llama.cpp build crashed with speculative decoding, so {0} loads without it.", family.displayName)));
		}
		this._progress = { text, track: bar?.track, fill: bar?.fill, note };
		this._updateProgress();
		this._contentDisposables.add(new LocalModelLoadTicker(() => getLocalModelLoad(this._details.status, this._details.family), () => this._updateProgress()));
	}

	/** Moves the progress, and the state the heading and first header icon give, in place. */
	private _updateProgress(): void {
		const { family, status, readiness } = this._details;
		this._name.setAttribute('aria-description', getLocalModelStateLabel(family, readiness, status));
		const state = this._stateIcon = getStateIcon(this._details);
		if (state && this._headerActions.hasAction(this._stateAction)) {
			this._updateStateAction(state);
		}
		const progress = this._progress;
		const view = progress && getStatusProgress(family, status, Date.now());
		if (!progress || !view) {
			return;
		}
		progress.text.textContent = view.text;
		const value = view.percent;
		if (progress.track && progress.fill) {
			progress.track.classList.toggle('indeterminate', value === undefined);
			progress.fill.style.width = value === undefined ? '' : `${value}%`;
			if (value === undefined) {
				progress.track.removeAttribute('aria-valuenow');
				progress.track.removeAttribute('aria-valuetext');
			} else {
				progress.track.setAttribute('aria-valuenow', String(value));
				progress.track.setAttribute('aria-valuetext', view.text);
			}
		}
		progress.note.textContent = view.note ?? '';
		progress.note.hidden = !view.note;
	}

	/** The download consent: the model's size, source and license, or its files already on this device. Its button is the consent. */
	private _renderConsent(details: ILocalModelDetails, consent: ILocalModelSetUpConsent): void {
		const { family } = details;
		const section = this._section(consent.title);
		if (family.operation?.pausedReason === 'consentChanged') {
			this._text(section, localize('localModel.card.consentChanged', "{0} changed since you agreed to set it up. Review the details to continue.", family.displayName));
		}
		if (consent.kind === 'notEnoughDisk') {
			this._message(section, consent.details[0], 'warning');
		}
		consent.details.forEach((detail, index) => {
			if (consent.kind !== 'notEnoughDisk' || index > 0) {
				this._text(section, detail);
			}
		});
		if (consent.license) {
			this._licenseLink(section, 'consent:license', consent.license);
		}
		if (consent.buttons.length) {
			const buttons = this._buttonBar(section);
			consent.buttons.forEach((button, index) => {
				this._button(buttons, `consent:${button.choice}`, button.label, () => this._agree(details), index === 0 ? 'primary' : 'secondary');
			});
		}
		if (consent.kind === 'consent' && !this._consentShown) {
			this._consentShown = consent.entryPath;
			details.actions.logConsent?.('consentShown', consent.entryPath);
		}
	}

	/** Sends the consent for exactly the family the page showed when the user chose. */
	private _agree(rendered: ILocalModelDetails): void {
		const agreement = getLocalModelSetUpAgreement(rendered.family);
		this._consentAccepted = true;
		this._request(rendered, 'setUp', { consent: agreement.consent, entryPath: agreement.entryPath })();
	}

	/** The thinking level of the family's direct model in this chat, when its template supports one: the same per-chat setting as a cloud model's; needs no reload. */
	private _renderThinking(details: ILocalModelDetails): void {
		const directModel = details.directModel;
		const property = directModel && getLocalModelThinkingProperty(directModel.model, directModel.configurationAccess);
		if (!directModel || !property) {
			return;
		}
		const title = getLocalModelThinkingTitle(property);
		const choices = getModelConfigChoices(property);
		this._choice(this._section(title), 'thinking', title, choices, index => {
			this._setThinking(directModel, property.key, choices[index].value).catch(onUnexpectedError);
		});
	}

	/** Saves the chat's thinking level, then shows it, keeping focus on the choice. */
	private async _setThinking(directModel: ILocalModelDirectModelConfig, key: string, value: unknown): Promise<void> {
		const version = ++this._configurationVersion;
		await setModelConfigValues(directModel.model, directModel.configurationAccess, { [key]: value }, directModel.onDidChangeConfiguration);
		await this._choices.get('thinking')?.whenSelectionAnimationSettles();
		if (!this.isDisposed && version === this._configurationVersion) {
			this._renderPreservingFocus();
		}
	}

	/**
	 * The context size the family loads with, each with its GPU memory. Choosing another reloads a loaded model once its
	 * running responses finish; otherwise it applies at the next load.
	 */
	private _renderContext(details: ILocalModelDetails, context: ILocalModelContextV1): void {
		const { family, status } = details;
		const title = localize('localModel.card.context', "Context");
		const section = this._section(title);
		const selected = context.options.find(option => option.tokens === context.tokens);
		if (context.options.length > 1) {
			const choices = context.options.map(option => ({
				label: formatLocalModelContextTokens(option.tokens),
				description: localize('localModel.card.contextMemory', "About {0} of GPU memory", formatLocalModelBytes(option.gpuBytes)),
				checked: option.tokens === context.tokens,
			}));
			this._choice(section, 'context', title, choices, index => {
				this._request(details, 'setContextSize', { contextTokens: context.options[index].tokens })();
			});
		}
		const notes: string[] = [];
		const serving = getLocalModelServingContextTokens(family, status);
		if (serving !== undefined && serving !== context.tokens) {
			const operation = family.operation;
			// A new selection waits for the reload; otherwise the host fit a smaller size to the device.
			notes.push(operation?.state === 'running' && operation.kind === 'swap'
				? localize('localModel.card.contextReloading', "Running with {0} until it reloads with {1}.", formatLocalModelContextTokens(serving), formatLocalModelContextTokens(context.tokens))
				: localize('localModel.card.contextReduced', "Running with {0}: not enough GPU memory for {1} right now.", formatLocalModelContextTokens(serving), formatLocalModelContextTokens(context.tokens)));
		}
		notes.push(selected
			? localize('localModel.card.contextSelected', "{0} uses about {1} of GPU memory.", formatLocalModelContextTokens(selected.tokens), formatLocalModelBytes(selected.gpuBytes))
			: localize('localModel.card.contextSize', "{0} tokens.", formatLocalModelContextTokens(context.tokens)));
		if (context.options.length > 1) {
			const active = status.active?.familyId === family.familyId ? status.active : undefined;
			const loaded = active?.server === 'ready' || active?.server === 'starting';
			notes.push(loaded
				? localize('localModel.card.contextReloads', "Changing it reloads the model. Running responses finish first.")
				: localize('localModel.card.contextNextLoad', "A change applies the next time the model loads."));
		}
		const noteId = `chat-local-model-card-context-${generateUuid()}`;
		const ids = notes.map((note, index) => {
			const id = `${noteId}-${index}`;
			dom.append(section, dom.$('p.chat-local-model-card-note', { id }, note));
			return id;
		});
		this._choices.get('context')?.domNode.setAttribute('aria-describedby', ids.join(' '));
	}

	/** The Use in Auto switch (off by default), what it does and the safety disclosure, which the switch's accessible description includes. */
	private _renderUseInAuto(details: ILocalModelDetails): void {
		const { status, family } = details;
		const active = status.active?.familyId === family.familyId ? status.active : undefined;
		const tooSlow = active?.autoEligible === false;
		const label = localize('localModel.useInAuto', "Use in Auto");
		const description = tooSlow
			? localize('localModel.useInAuto.tooSlow', "{0} runs on this device but is too slow for Auto. You can still select it directly.", family.displayName)
			: localize('localModel.useInAuto.description', "Let Auto route turns to this on-device model, with cloud fallback.");
		const section = this._section();
		const row = dom.append(section, dom.$('.chat-local-model-card-setting'));
		const labelId = `chat-local-model-card-auto-${generateUuid()}`;
		const descriptionId = `${labelId}-description`;
		const disclosureId = `${labelId}-disclosure`;
		dom.append(row, dom.$('span.chat-model-card-section-title', { id: labelId }, label));
		const toggle = this._contentDisposables.add(new Switch({ ariaLabel: label, title: description, checked: status.useInAuto && !tooSlow, disabled: tooSlow }));
		toggle.domNode.setAttribute('aria-describedby', `${descriptionId} ${disclosureId}`);
		row.appendChild(toggle.domNode);
		this._contentDisposables.add(toggle.onChange(checked => this._request(details, 'toggleAuto', { value: checked })()));
		this._controls.set('auto', { element: toggle.domNode, focus: () => toggle.domNode.focus() });
		dom.append(section, dom.$('p.chat-local-model-card-note', { id: descriptionId }, description));
		dom.append(section, dom.$('p.chat-local-model-card-note', { id: disclosureId }, getLocalModelSafetyDisclosure()));
	}
}
