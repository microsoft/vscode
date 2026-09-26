/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/artifactIntegrations.css';
import { $, addDisposableListener, append, EventHelper, EventType, getActiveElement, isAncestorOfActiveElement, isHTMLElement, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IDelayedHoverOptions, IHoverWidget } from '../../../../base/browser/ui/hover/hover.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { Switch } from '../../../../base/browser/ui/toggle/switch.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ArtifactActionView, ArtifactAutomationOption, ArtifactContributionSnapshot, ArtifactDetails, ArtifactIcon, ArtifactRun, ArtifactRunState, ArtifactSnapshot, getArtifactActionAvailability, IArtifactDetailsModel, IArtifactModel, isArtifactOptionEnabled, isArtifactRunSettled } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { artifactBindingId } from '../../../../platform/artifactIntegrations/common/artifactIntegrationStore.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, getColorRegistry } from '../../../../platform/theme/common/colorUtils.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { ChatPillActionViewItem, createChatPillButton, getChatPillEntryToolbarActions, IChatPill, IChatPillEntry } from '../../../../workbench/browser/chatPills.js';

function icon(value: ArtifactIcon): ThemeIcon {
	const id = getIconRegistry().getIcon(value.id) ? value.id : Codicon.link.id;
	const color = value.colorId && Object.hasOwn(getColorRegistry().getColorSchema().properties ?? {}, value.colorId) ? { id: value.colorId } : undefined;
	return { id, color };
}

function renderArtifactIcon(value: ThemeIcon, isPill = false): HTMLElement {
	const container = $('span.artifact-icon', { 'aria-hidden': 'true' });
	if (value.color) {
		container.style.color = asCssVariable(value.color.id);
	}
	const glyph = append(container, renderIcon(value));
	glyph.classList.toggle('chat-pill-icon', isPill);
	return container;
}

interface IArtifactButton {
	readonly id: string;
	readonly label: string;
	readonly icon?: ThemeIcon;
	readonly enabled?: boolean;
	readonly description?: string;
	readonly ariaLabel?: string;
	readonly disclosure?: boolean;
	readonly hover?: (target: HTMLElement) => IDelayedHoverOptions;
	run(target: HTMLElement): void;
}

class ArtifactButtons extends Disposable {
	private readonly buttons = this._register(new DisposableMap<string, ArtifactButton>());
	private orderedButtons: readonly ArtifactButton[] = [];
	private focusable = true;

	constructor(readonly element: HTMLElement, private readonly hoverService: IHoverService, private readonly kind: 'action' | 'pill' = 'action') {
		super();
		element.setAttribute('role', 'group');
	}

	update(items: readonly IArtifactButton[]): void {
		const active = getActiveElement();
		const hadFocus = !!active && this.element.contains(active);
		const ids = new Set(items.map(item => item.id));
		for (const id of this.buttons.keys()) {
			if (!ids.has(id)) {
				this.buttons.deleteAndDispose(id);
			}
		}
		let next = this.element.firstElementChild;
		const orderedButtons: ArtifactButton[] = [];
		for (const item of items) {
			let slot = this.buttons.get(item.id);
			if (!slot) {
				slot = new ArtifactButton(this.element, item, this.hoverService, this.kind);
				this.buttons.set(item.id, slot);
			}
			slot.update(item);
			slot.button.element.tabIndex = this.focusable && slot.reachable ? 0 : -1;
			if (next !== slot.button.element) {
				this.element.insertBefore(slot.button.element, next);
			}
			next = slot.button.element.nextElementSibling;
			orderedButtons.push(slot);
		}
		this.orderedButtons = orderedButtons;
		if (hadFocus && isHTMLElement(active)) {
			if (active.isConnected) {
				if (getActiveElement() !== active) {
					active.focus({ preventScroll: true });
				}
			} else {
				const first = orderedButtons.find(slot => slot.reachable);
				if (first) {
					first.button.focus();
				} else {
					this.element.parentElement?.focus();
				}
			}
		}
		this.element.hidden = items.length === 0;
	}

	setFocusable(focusable: boolean): void {
		this.focusable = focusable;
		for (const slot of this.buttons.values()) {
			slot.button.element.tabIndex = focusable && slot.reachable ? 0 : -1;
		}
	}

	get tabbableElements(): readonly HTMLElement[] {
		return this.element.hidden ? [] : this.orderedButtons.filter(slot => slot.reachable && slot.button.element.tabIndex === 0).map(slot => slot.button.element);
	}
}

class ArtifactButton extends Disposable {
	readonly button: Button;

	constructor(container: HTMLElement, private value: IArtifactButton, hoverService: IHoverService, private readonly kind: 'action' | 'pill') {
		super();
		this.button = this._register(kind === 'pill' ? createChatPillButton(container) : new Button(container, { ...defaultButtonStyles, secondary: true, small: true }));
		this.button.element.classList.add('monaco-text-button');
		this._register(this.button.onDidClick(() => this.value.run(this.button.element)));
		this._register(hoverService.setupDelayedHover(this.button.element, () => this.value.hover?.(this.button.element) ?? { content: this.value.description ?? this.value.label }));
	}

	/** Whether keyboard users can reach the button. A disabled action that explains why stays reachable so the reason is announced. */
	get reachable(): boolean {
		return this.button.enabled || (this.kind === 'action' && !!this.value.description);
	}

	update(value: IArtifactButton): void {
		this.value = value;
		const glyph = value.icon ? renderArtifactIcon(value.icon, this.kind === 'pill') : undefined;
		reset(this.button.element, ...(glyph ? [glyph] : []), $(this.kind === 'pill' ? 'span.chat-pill-label' : 'span.artifact-button-label', undefined, value.label));
		this.button.enabled = value.enabled !== false;
		this.button.element.setAttribute('aria-label', value.ariaLabel ?? (value.description ? localize('artifactButtonDescription', "{0}. {1}", value.label, value.description) : value.label));
		if (value.disclosure) {
			this.button.element.setAttribute('aria-haspopup', 'dialog');
		}
	}
}

class ArtifactAutomationControl extends Disposable {
	readonly element = $('.artifact-automation-control');
	private readonly row = append(this.element, $('.artifact-automation-row'));
	private readonly label = append(this.row, $<HTMLLabelElement>('label.artifact-automation-label'));
	private readonly reason = append(this.element, $('.artifact-automation-reason'));
	private readonly toggle: Switch | undefined;
	private readonly picker: Button | undefined;
	private pending = false;
	private contribution: ArtifactContributionSnapshot;
	private option: ArtifactAutomationOption;
	private scope = '';

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		contribution: ArtifactContributionSnapshot,
		option: ArtifactAutomationOption,
		hoverService: IHoverService,
		private readonly quickInputService: IQuickInputService,
	) {
		super();
		this.contribution = contribution;
		this.option = option;
		this._register(toDisposable(() => this.element.remove()));
		if (option.kind === 'boolean') {
			this.toggle = this._register(new Switch({ ariaLabel: option.label }));
			append(this.row, this.toggle.domNode);
			this._register(this.toggle.onChange(value => this.save(value)));
		} else {
			this.picker = this._register(new Button(this.row, { ...defaultButtonStyles, secondary: true, small: true }));
			this._register(this.picker.onDidClick(() => this.save()));
		}
		const control = this.toggle?.domNode ?? this.picker!.element;
		control.id = generateUuid();
		this.label.htmlFor = control.id;
		this._register(hoverService.setupDelayedHover(this.label, () => ({ content: this.description })));
	}

	update(contribution: ArtifactContributionSnapshot, option: ArtifactAutomationOption, scope: string): void {
		this.contribution = contribution;
		this.option = option;
		this.scope = scope;
		const current = contribution.configuration.values[option.id];
		const enabled = isArtifactOptionEnabled(option, current);
		const available = contribution.view.automationAvailability.find(available => available.id === option.id);
		const disabled = this.pending || (!enabled && available?.available !== true);
		this.label.textContent = option.label;
		this.reason.textContent = contribution.configuration.disablements[option.id]?.reason ?? available?.unavailableReason ?? '';
		this.reason.hidden = !this.reason.textContent;
		if (this.toggle) {
			this.toggle.checked = enabled;
			this.toggle.disabled = disabled;
			this.toggle.setAriaLabel(option.label, this.description);
			this.toggle.domNode.setAttribute('aria-description', this.description);
		} else if (this.picker && option.kind === 'enum') {
			const value = option.choices.find(choice => choice.value === current)?.label ?? String(current);
			this.picker.label = value;
			this.picker.enabled = !disabled;
			this.picker.element.setAttribute('aria-label', localize('artifactEnumOption', "{0}: {1}", option.label, value));
			this.picker.element.setAttribute('aria-description', this.description);
		}
	}

	private get description(): string {
		return [
			this.option.description, this.scope,
			localize('artifactPermittedActions', "Allowed actions: {0}.", this.option.actionIds.map(id => this.contribution.actions.find(action => action.id === id)?.label ?? id).join(', ')),
			localize('artifactAttemptBudget', "At most {0} dispatched attempts per occurrence.", this.option.maxAttempts),
			this.reason.textContent,
		].filter(Boolean).join(' ');
	}

	get tabbableElement(): HTMLElement | undefined {
		return this.toggle ? (this.toggle.disabled ? undefined : this.toggle.domNode) : this.picker?.enabled ? this.picker.element : undefined;
	}

	private save(value?: boolean): void {
		if (this.pending) {
			return;
		}
		const contribution = this.contribution;
		const option = this.option;
		const control = this.toggle?.domNode ?? this.picker!.element;
		const hadFocus = getActiveElement() === control;
		this.pending = true;
		this.update(contribution, option, this.scope);
		const focusWhilePending = getActiveElement();
		this.presentation.run(async () => {
			try {
				const selected = option.kind === 'boolean' ? value
					: (await this.quickInputService.pick(option.choices.map(choice => ({ ...choice })), { placeHolder: option.description }))?.value;
				if (selected !== undefined) {
					await this.presentation.model.configure(contribution.integrationId, contribution.configuration.revision, { [option.id]: selected });
					status(localize('artifactAutomationSaved', "Artifact automation updated: {0}", option.label));
				}
			} finally {
				this.pending = false;
				if (!this._store.isDisposed) {
					this.update(this.contribution, this.option, this.scope);
					if (hadFocus && getActiveElement() === focusWhilePending) {
						const target = this.toggle?.disabled || this.picker?.enabled === false ? this.element.parentElement : control;
						target?.focus({ preventScroll: true });
					}
				}
			}
		});
	}
}

interface IArtifactActionActivity {
	/** The most relevant run of the action that has not settled. */
	readonly run: ArtifactRun | undefined;
	/** The most recent run of the action. */
	readonly latest: ArtifactRun | undefined;
	/** Whether a manual request from this panel has not been reported as a run yet. */
	readonly requested: boolean;
}

interface IArtifactUnitAction {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon | undefined;
	/** The action view offered in this scope. Without one, the unit shows no button. */
	readonly view: ArtifactActionView | undefined;
	readonly activity: IArtifactActionActivity;
	run(): void;
}

interface IArtifactActionUnitSpec {
	readonly key: string;
	readonly contribution: ArtifactContributionSnapshot;
	/** The action run once by the button; absent for automation shared by several actions. */
	readonly action: IArtifactUnitAction | undefined;
	/** Names a group of automation shared by several actions. */
	readonly caption: string | undefined;
	readonly options: readonly ArtifactAutomationOption[];
}

function isArtifactActionBusy(activity: IArtifactActionActivity): boolean {
	return !!activity.run || activity.requested;
}

function artifactActionIcon(activity: IArtifactActionActivity, fallback: ThemeIcon | undefined): ThemeIcon | undefined {
	return activity.run?.state === 'blocked' ? Codicon.watch : isArtifactActionBusy(activity) ? ThemeIcon.modify(Codicon.loading, 'spin') : fallback;
}

function artifactActionNote(view: ArtifactActionView | undefined, activity: IArtifactActionActivity): string {
	const run = activity.run;
	if (run?.state === 'blocked') {
		return run.source === 'automation'
			? localize('artifactAutomaticRunWaiting', "Waiting to run automatically: {0}", run.reason)
			: localize('artifactRunWaiting', "Waiting: {0}", run.reason);
	}
	if (run) {
		return run.source === 'automation'
			? localize({ key: 'artifactAutomaticRunState', comment: ['{0} is the state of a run that automation started, such as Running or Queued.'] }, "{0} automatically", runStateLabel(run.state))
			: runStateLabel(run.state);
	}
	if (activity.requested) {
		return runStateLabel('queued');
	}
	if (view && !view.enabled) {
		return view.disabledReason ?? '';
	}
	return activity.latest?.indeterminate ? localize('artifactRunOutcomeUnknown', "The outcome of the last run is unknown. Reconcile it in View Activity.") : '';
}

/**
 * A button that runs an action once, followed by the switches that permit it to run automatically.
 */
class ArtifactActionUnit extends Disposable {
	readonly element = $('.artifact-action-unit', { tabIndex: -1 });
	private readonly caption = append(this.element, $('.artifact-action-caption', { id: generateUuid() }));
	private readonly row = append(this.element, $('.artifact-action-row'));
	private readonly note = append(this.row, $('span.artifact-action-note', { id: generateUuid() }));
	private readonly button = this._register(new MutableDisposable<ArtifactButton>());
	private readonly controls = this._register(new DisposableMap<string, ArtifactAutomationControl>());
	private orderedControls: readonly ArtifactAutomationControl[] = [];

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		private readonly hoverService: IHoverService,
		private readonly quickInputService: IQuickInputService,
	) {
		super();
		this._register(toDisposable(() => this.element.remove()));
	}

	update(spec: IArtifactActionUnitSpec, scope: string): void {
		this.updateGroup(spec);
		this.updateAction(spec.action);
		this.updateControls(spec, scope);
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [
			...this.button.value?.reachable ? [this.button.value.button.element] : [],
			...this.orderedControls.flatMap(control => control.tabbableElement ? [control.tabbableElement] : []),
		];
	}

	private updateGroup({ action, caption, options }: IArtifactActionUnitSpec): void {
		this.caption.textContent = caption ?? '';
		this.caption.hidden = !caption;
		if (caption) {
			this.element.setAttribute('role', 'group');
			this.element.setAttribute('aria-labelledby', this.caption.id);
			this.element.removeAttribute('aria-label');
		} else if (action && options.length) {
			this.element.setAttribute('role', 'group');
			this.element.setAttribute('aria-label', action.label);
			this.element.removeAttribute('aria-labelledby');
		} else {
			this.element.removeAttribute('role');
			this.element.removeAttribute('aria-label');
			this.element.removeAttribute('aria-labelledby');
		}
	}

	private updateAction(action: IArtifactUnitAction | undefined): void {
		const note = action ? artifactActionNote(action.view, action.activity) : '';
		this.note.textContent = note;
		this.note.hidden = !note;
		const view = action?.view;
		if (action && view) {
			const value: IArtifactButton = {
				id: action.id, label: action.label, ariaLabel: action.label,
				icon: artifactActionIcon(action.activity, action.icon),
				enabled: view.enabled && !isArtifactActionBusy(action.activity),
				description: note || undefined,
				run: () => action.run(),
			};
			if (!this.button.value) {
				this.button.value = new ArtifactButton(this.row, value, this.hoverService, 'action');
				this.row.insertBefore(this.button.value.button.element, this.note);
			}
			this.button.value.update(value);
			const element = this.button.value.button.element;
			element.tabIndex = this.button.value.reachable ? 0 : -1;
			if (note) {
				element.setAttribute('aria-describedby', this.note.id);
			} else {
				element.removeAttribute('aria-describedby');
			}
		} else {
			this.button.clear();
		}
		this.row.hidden = !this.button.value && this.note.hidden;
	}

	private updateControls({ contribution, options }: IArtifactActionUnitSpec, scope: string): void {
		const key = (option: ArtifactAutomationOption) => JSON.stringify([option.id, option.kind]);
		const keys = new Set(options.map(key));
		for (const existing of this.controls.keys()) {
			if (!keys.has(existing)) {
				this.controls.deleteAndDispose(existing);
			}
		}
		let next = this.row.nextElementSibling;
		const orderedControls: ArtifactAutomationControl[] = [];
		for (const option of options) {
			let control = this.controls.get(key(option));
			if (!control) {
				control = new ArtifactAutomationControl(this.presentation, contribution, option, this.hoverService, this.quickInputService);
				this.controls.set(key(option), control);
			}
			control.update(contribution, option, scope);
			if (next !== control.element) {
				this.element.insertBefore(control.element, next);
			}
			next = control.element.nextElementSibling;
			orderedControls.push(control);
		}
		this.orderedControls = orderedControls;
	}
}

type ArtifactDetailsItem = ArtifactDetails['items'][number];

interface IArtifactDetailsItemTemplate {
	readonly row: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly store: DisposableStore;
	item?: ArtifactDetailsItem;
}

class ArtifactDetailsItemRenderer implements IListRenderer<ArtifactDetailsItem, IArtifactDetailsItemTemplate> {
	static readonly rowHeight = 28;
	readonly templateId = 'artifactDetailsItem';

	constructor(private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): IArtifactDetailsItemTemplate {
		const store = new DisposableStore();
		const row = append(container, $('.artifact-details-item'));
		const template: IArtifactDetailsItemTemplate = {
			row, icon: append(row, $('span')), label: append(row, $('span.artifact-details-item-label')), store,
		};
		store.add(this.hoverService.setupDelayedHover(row, () => ({
			content: template.item?.description
				? localize('artifactItemDescription', "{0}: {1}", template.item.label, template.item.description)
				: template.item?.label ?? '',
		})));
		return template;
	}

	renderElement(item: ArtifactDetailsItem, _index: number, template: IArtifactDetailsItemTemplate): void {
		template.item = item;
		reset(template.icon, renderArtifactIcon(icon(item.icon)));
		template.label.textContent = item.label;
	}

	disposeTemplate(template: IArtifactDetailsItemTemplate): void {
		template.store.dispose();
	}
}

export class ArtifactIntegrationPresentation extends Disposable {
	readonly inlinePill: IChatPill;
	private readonly dropdown = this._register(new MutableDisposable<ArtifactIntegrationPanel>());
	private readonly hover = {
		content: () => {
			this.dropdown.value ??= this.instantiationService.createInstance(ArtifactIntegrationPanel, this, undefined, undefined);
			this.dropdown.value.start();
			return this.dropdown.value.element;
		},
		disposable: { dispose: () => this.dropdown.clear() },
		expandable: true,
		tabThroughPanel: true,
		getTabbableElements: () => this.dropdown.value?.tabbableElements ?? [],
	};
	private entry: IChatPillEntry | undefined;
	private readonly action: Action;
	readonly snapshot: IObservable<ArtifactSnapshot>;

	constructor(
		readonly model: IArtifactModel,
		private readonly invokingChat: (reader?: IReader) => string | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notifications: INotificationService,
	) {
		super();
		this.snapshot = derived(this, reader => {
			const snapshot = model.snapshot.read(reader);
			const chat = invokingChat(reader);
			const contextualize = (action: ArtifactActionView): ArtifactActionView => ({ ...action, ...getArtifactActionAvailability(action, chat) });
			return {
				...snapshot,
				contributions: snapshot.contributions.map(contribution => ({
					...contribution,
					view: { ...contribution.view, stateActions: contribution.view.stateActions.map(contextualize), generalActions: contribution.view.generalActions.map(contextualize) },
				})),
			};
		});
		this.action = this._register(new Action(`artifactIntegration.${model.snapshot.get().artifact.id}`, model.snapshot.get().artifact.label, undefined, true, async () => this.entry?.open()));
		this.inlinePill = {
			action: this.action,
			createActionViewItem: options => this.instantiationService.createInstance(ArtifactIntegrationPill, this, this.action, options),
		};
	}

	decorate(entry: IChatPillEntry, reader: IReader): IChatPillEntry {
		this.entry = entry;
		const snapshot = this.snapshot.read(reader);
		if (snapshot.contributions.length === 0) {
			return entry;
		}
		const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main;
		return {
			...entry,
			label: main?.label ?? entry.label,
			icon: main ? icon(main.icon) : entry.icon,
			inlinePill: this.inlinePill,
			hover: this.hover,
		};
	}

	get baseEntry(): IChatPillEntry | undefined {
		return this.entry;
	}

	async invoke(integrationId: string, actionId: string): Promise<ArtifactRun> {
		const chat = this.invokingChat();
		if (!chat) {
			throw new Error(localize('artifactInvokingChatUnavailable', "The chat that invoked this artifact action is no longer available."));
		}
		const run = await this.model.invoke(integrationId, actionId, chat, generateUuid());
		status(localize('artifactActionRequested', "Artifact action requested: {0}", run.reason));
		return run;
	}

	run(operation: () => Promise<void>): void {
		void operation().catch(error => this.notifications.error(localize('artifactOperationFailed', "The artifact operation failed: {0}", toErrorMessage(error))));
	}
}

class ArtifactIntegrationPill extends ChatPillActionViewItem {
	private readonly panel = this._register(new MutableDisposable<ArtifactIntegrationPanel>());
	private readonly shownHover = this._register(new MutableDisposable<IHoverWidget>());
	private sections: ArtifactButtons | undefined;

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		action: Action,
		options: IActionViewItemOptions,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
	}

	protected override get itemModifierClass(): string { return 'artifact-integration-pill'; }
	protected override get buttonModifierClass(): string { return 'chat-dropdown-pill-button'; }

	protected override renderContent(): void {
		this.sections = this._register(new ArtifactButtons(append(this.element!, $('.chat-pill-sections.artifact-pill-sections')), this.hoverService, 'pill'));
		this._register(this.hoverService.setupDelayedHover(this.button!.element, () => this.details()));
		this._register(autorun(reader => {
			const snapshot = this.presentation.snapshot.read(reader);
			this.updateLabel();
			this.updateAriaLabel();
			const sections = snapshot.contributions.flatMap(contribution => contribution.view.sections.map(section => ({
				id: JSON.stringify([contribution.integrationId, section.id]), label: section.label, icon: icon(section.icon),
				ariaLabel: localize('artifactSectionDetails', "Show details: {0}", section.description ?? section.label),
				disclosure: true,
				hover: () => this.details([contribution.integrationId, section.detailsId]),
				run: (target: HTMLElement) => this.showDetails(target, [contribution.integrationId, section.detailsId]),
			})));
			this.sections!.update(sections);
			this.element!.classList.toggle('chat-pill-segmented', sections.length > 0);
		}));
	}

	protected override getLabelText(): string {
		const snapshot = this.presentation.snapshot.get();
		return snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main?.label
			?? this.presentation.baseEntry?.label ?? snapshot.artifact.label;
	}

	protected override getIconElement(): HTMLElement | undefined {
		const snapshot = this.presentation.snapshot.get();
		const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main;
		const themeIcon = main ? icon(main.icon) : this.presentation.baseEntry?.icon ?? Codicon.link;
		return renderArtifactIcon(themeIcon, true);
	}

	protected override getAriaLabel(): string {
		const snapshot = this.presentation.snapshot.get();
		const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main;
		return localize('artifactOpenResource', "Open {0}", main?.description ?? this.getLabelText());
	}

	protected override updateTooltip(): void { }

	override isFocused(): boolean {
		return !!this.element && isAncestorOfActiveElement(this.element);
	}

	override setFocusable(focusable: boolean): void {
		super.setFocusable(focusable);
		this.sections?.setFocusable(focusable);
	}

	override focus(): void {
		super.focus();
		this.sections?.setFocusable(true);
	}

	override blur(): void {
		super.blur();
		this.sections?.setFocusable(false);
	}

	private showDetails(target: HTMLElement, selection?: readonly [string, string]): void {
		this.shownHover.value = this.hoverService.showInstantHover({ ...this.details(selection), target }, true);
	}

	private details(selection?: readonly [string, string]): IDelayedHoverOptions {
		const panel = this.instantiationService.createInstance(ArtifactIntegrationPanel, this.presentation, selection, () => this.hoverService.hideHover(true));
		this.panel.value = panel;
		return {
			content: panel.element, trapFocus: true,
			onDidShow: () => panel.start(),
			onDidHide: () => {
				if (this.panel.value === panel) {
					this.panel.clear();
				}
			},
		};
	}
}

class ArtifactIntegrationPanel extends Disposable {
	readonly element = $('.artifact-integration-panel', { tabIndex: -1, role: 'dialog' });
	private readonly state = append(this.element, $('.artifact-details-state'));
	private readonly status = append(this.state, $('.artifact-details-status', { id: generateUuid() }));
	private readonly title = append(this.state, $('.artifact-details-title'));
	private readonly availability = append(this.state, $('p.artifact-details-availability', { id: generateUuid() }));
	private readonly description = append(this.state, $('p.artifact-details-description', { id: generateUuid() }));
	private readonly unitsContainer = append(this.element, $('.artifact-action-units'));
	private readonly units = this._register(new DisposableMap<string, ArtifactActionUnit>());
	private orderedUnits: readonly ArtifactActionUnit[] = [];
	/** Manual requests from this panel: `undefined` while dispatching, then the run ID until the snapshot reports it. */
	private readonly requests = new Map<string, string | undefined>();
	private readonly requestsChanged = observableSignal(this);
	/** Automation shown in main details, which stays until the details close. */
	private readonly shownOptions = new Set<string>();
	private readonly facts = append(this.element, $('dl'));
	private readonly itemsContainer = append(this.element, $('.artifact-details-list'));
	private readonly items: WorkbenchList<ArtifactDetailsItem>;
	private readonly details = this._register(new MutableDisposable<IArtifactDetailsModel>());
	private readonly detailsView = observableValue<ArtifactDetails | undefined>(this, undefined);
	private readonly detailsListener = this._register(new MutableDisposable());
	private readonly started = observableValue(this, false);
	private readonly generalActions: ArtifactButtons;
	private readonly more: ArtifactButtons;

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		private readonly selection: readonly [string, string] | undefined,
		dismiss: (() => void) | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
		if (dismiss) {
			// Buttons consume Escape to blur themselves, which would leave the details open without focus.
			this._register(addDisposableListener(this.element, EventType.KEY_DOWN, e => {
				if (isHTMLElement(e.target) && e.target.closest('.monaco-button') && new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
					EventHelper.stop(e, true);
					dismiss();
				}
			}, true));
		}
		const group = (label: string) => {
			const buttons = append(this.element, $('.artifact-controls', { 'aria-label': label }));
			return this._register(new ArtifactButtons(buttons, hoverService));
		};
		this.items = this._register(instantiationService.createInstance(
			WorkbenchList<ArtifactDetailsItem>,
			'ArtifactDetails',
			this.itemsContainer,
			{ getHeight: () => ArtifactDetailsItemRenderer.rowHeight, getTemplateId: () => 'artifactDetailsItem' },
			[new ArtifactDetailsItemRenderer(hoverService)],
			{
				multipleSelectionSupport: false,
				openOnSingleClick: true,
				identityProvider: { getId: item => item.id },
				accessibilityProvider: {
					getWidgetAriaLabel: () => this.detailsView.get()?.title ?? localize('artifactDetails', "Artifact Details"),
					getAriaLabel: item => item.description ? localize('artifactItemDescription', "{0}: {1}", item.label, item.description) : item.label,
				},
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.label },
			},
		));
		this._register(this.items.onDidOpen(event => {
			if (event.element) {
				const resource = event.element.resource;
				this.presentation.run(async () => {
					const uri = URI.parse(resource, true);
					if (['command', 'javascript', 'data'].includes(uri.scheme.toLowerCase())) {
						throw new Error(localize('artifactUnsafeLink', "This artifact link cannot be opened."));
					}
					await this.openerService.open(uri, { fromUserGesture: true, allowCommands: false });
				});
			}
		}));
		this.more = group(localize('artifactMoreDetails', "More Details"));
		this.generalActions = group(localize('artifactGeneralActions', "General Actions"));
		const detailsSelection = derivedOpts<readonly [string, string] | undefined>({
			owner: this,
			equalsFn: (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1],
		}, reader => {
			if (!this.started.read(reader)) {
				return undefined;
			}
			const snapshot = this.presentation.snapshot.read(reader);
			const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId);
			return this.selection ?? (main?.view.main ? [main.integrationId, main.view.main.detailsId] : undefined);
		});
		this._register(autorun(reader => {
			const selection = detailsSelection.read(reader);
			const lifetime = reader.store.add(new DisposableStore());
			this.details.clear();
			this.detailsListener.clear();
			this.detailsView.set(undefined, undefined);
			if (!selection) {
				return;
			}
			void this.presentation.model.acquireDetails(selection[0], selection[1]).then(details => {
				if (lifetime.isDisposed) {
					details.dispose();
					return;
				}
				this.details.value = details;
				this.detailsListener.value = autorun(reader => this.detailsView.set(details.details.read(reader), undefined));
			}).catch(error => {
				if (!lifetime.isDisposed) {
					this.detailsView.set({ title: this.presentation.snapshot.read(undefined).artifact.label, availability: { kind: 'error', reason: toErrorMessage(error) }, links: [], items: [], completeness: 'complete' }, undefined);
				}
			});
		}));
		this._register(autorun(reader => {
			const details = this.detailsView.read(reader);
			const selection = detailsSelection.read(reader);
			const snapshot = this.presentation.snapshot.read(reader);
			this.requestsChanged.read(reader);
			const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId);
			const contribution = snapshot.contributions.find(contribution => contribution.integrationId === selection?.[0]);
			const contributions = this.selection ? (contribution ? [contribution] : []) : snapshot.contributions;
			const scope = snapshot.authority.location === 'client'
				? localize('artifactLocalScope', "Runs on this computer while connected. Automatic prompts go to the artifact's original chat.")
				: localize('artifactHostScope', "Runs on the agent host for this session. Automatic prompts go to the artifact's original chat.");
			const title = details?.title ?? snapshot.artifact.label;
			const part = this.selection ? contribution?.view.sections.find(section => section.detailsId === this.selection?.[1]) : main?.view.main;
			const statusText = (this.selection ? part?.description ?? part?.label : part?.description) ?? '';
			reset(this.status, ...part && statusText ? [renderArtifactIcon(icon(part.icon)), $('span.artifact-details-status-label', undefined, statusText)] : []);
			this.status.hidden = !statusText;
			this.element.setAttribute('aria-label', title);
			this.title.textContent = title;
			this.title.hidden = !!this.selection && !this.status.hidden;
			this.title.classList.toggle('artifact-details-heading', this.status.hidden);
			this.availability.textContent = !details && selection ? localize('artifactDetailsLoading', "Loading details...")
				: [
					...contributions.flatMap(contribution => hasKey(contribution.view.availability, { reason: true }) ? [contribution.view.availability.reason] : []),
					...details && hasKey(details.availability, { reason: true }) ? [details.availability.reason] : [],
				].filter((reason, index, reasons) => reasons.indexOf(reason) === index).join('\n');
			this.availability.hidden = !this.availability.textContent;
			this.description.textContent = details?.description ?? '';
			this.description.hidden = !this.description.textContent;
			this.state.hidden = this.status.hidden && this.title.hidden && this.availability.hidden && this.description.hidden;
			const describedBy = [this.status, this.availability, this.description].filter(element => !element.hidden).map(element => element.id);
			if (describedBy.length) {
				this.element.setAttribute('aria-describedby', describedBy.join(' '));
			} else {
				this.element.removeAttribute('aria-describedby');
			}
			const specs = this.unitSpecs(snapshot, contributions, details);
			this.updateUnits(specs, scope);
			reset(this.facts, ...details?.facts?.flatMap(fact => [$('dt', undefined, fact.label), $('dd', undefined, fact.value)]) ?? []);
			this.facts.hidden = !details?.facts?.length;
			const items = details?.items ?? [];
			const focusedIndex = this.items.getFocus()[0];
			const hadListFocus = isAncestorOfActiveElement(this.itemsContainer);
			this.items.splice(0, this.items.length, items);
			if (hadListFocus && focusedIndex !== undefined && this.items.getFocus().length === 0 && items.length) {
				this.items.setFocus([Math.min(focusedIndex, items.length - 1)]);
			}
			if (hadListFocus && !items.length) {
				this.element.focus();
			}
			this.itemsContainer.hidden = items.length === 0;
			this.items.getHTMLElement().setAttribute('aria-label', details?.title ?? localize('artifactDetails', "Artifact Details"));
			this.items.layout(Math.min(items.length, 8) * ArtifactDetailsItemRenderer.rowHeight);
			this.more.update(details?.completeness === 'partial' && this.details.value?.loadMore ? [{
				id: 'loadMore', label: localize('artifactLoadMore', "Load More"),
				run: () => this.presentation.run(async () => this.details.value?.loadMore?.(CancellationToken.None)),
			}] : []);
			if (this.selection) {
				this.generalActions.update([]);
				return;
			}
			const unitActions = new Set(specs.flatMap(spec => spec.action?.view ? [JSON.stringify([spec.contribution.integrationId, spec.action.id])] : []));
			const entry = this.presentation.baseEntry;
			const shellActions = entry ? getChatPillEntryToolbarActions(entry) : [];
			this.generalActions.update([
				...contributions.flatMap(contribution => this.generalActionButtons(snapshot, contribution)).filter(action => !unitActions.has(action.id)),
				...shellActions.map(action => {
					const glyphClass = action.class?.split(' ').find(value => value.startsWith('codicon-'));
					return {
						id: `shell:${action.id}`, label: action.label,
						icon: glyphClass ? icon({ id: glyphClass.slice('codicon-'.length) }) : undefined,
						enabled: action.enabled,
						run: () => this.presentation.run(async () => { await action.run(); }),
					};
				}),
				...snapshot.runs.length ? [{
					id: 'history', label: localize('artifactViewActivity', "View Activity"), icon: Codicon.history,
					run: () => this.presentation.run(() => this.showHistory()),
				}] : [],
			]);
		}));
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [
			...this.unitsContainer.hidden ? [] : this.orderedUnits.flatMap(unit => unit.tabbableElements),
			...this.itemsContainer.hidden ? [] : [this.items.getHTMLElement()],
			...this.more.tabbableElements,
			...this.generalActions.tabbableElements,
		];
	}

	start(): void {
		this.started.set(true, undefined);
	}

	/**
	 * Groups each action with the automation that may run it. Automation that permits several actions
	 * is shown once, after the last of those actions, rather than being repeated or attached to one of them.
	 * Section details show the automation they link to; main details show the automation described by {@link isOptionShown}.
	 */
	private unitSpecs(snapshot: ArtifactSnapshot, contributions: readonly ArtifactContributionSnapshot[], details: ArtifactDetails | undefined): IArtifactActionUnitSpec[] {
		const linkedActions = new Set(details?.links.flatMap(link => link.kind === 'action' ? [link.actionId] : []));
		const linkedOptions = new Set(details?.links.flatMap(link => link.kind === 'automation' ? [link.optionId] : []));
		return contributions.flatMap(contribution => {
			const offered = [...contribution.view.stateActions, ...contribution.view.generalActions];
			const descriptor = (id: string) => contribution.actions.find(action => action.id === id);
			const order = (id: string) => {
				const index = contribution.actions.findIndex(action => action.id === id);
				return index === -1 ? contribution.actions.length : index;
			};
			const targets = (option: ArtifactAutomationOption) => [...new Set(option.actionIds)].sort((a, b) => order(a) - order(b));
			const options = contribution.options.filter(option => this.selection ? linkedOptions.has(option.id) : this.isOptionShown(contribution, offered, option));
			const ids = [...new Set([
				...(this.selection ? offered.filter(view => linkedActions.has(view.id)) : contribution.view.stateActions).flatMap(view => descriptor(view.id) ? [view.id] : []),
				...options.flatMap(option => {
					const ids = targets(option);
					return ids.length === 1 ? ids : [];
				}),
			])].sort((a, b) => order(a) - order(b));
			const units = ids.map((id): IArtifactActionUnitSpec => {
				const action = descriptor(id);
				return {
					key: JSON.stringify(['action', contribution.integrationId, id]), contribution, caption: undefined,
					action: {
						id, label: action?.label ?? id, icon: action ? icon({ id: action.iconId }) : undefined,
						view: action ? offered.find(view => view.id === id) : undefined,
						activity: this.activity(snapshot, contribution.integrationId, id),
						run: () => this.invoke(contribution.integrationId, id),
					},
					options: options.filter(option => {
						const ids = targets(option);
						return ids.length === 1 && ids[0] === id;
					}),
				};
			});
			const shared = new Map<string, { readonly spec: IArtifactActionUnitSpec; readonly anchor: number; readonly options: ArtifactAutomationOption[] }>();
			for (const option of options) {
				const ids = targets(option);
				if (ids.length === 1) {
					continue;
				}
				const key = JSON.stringify(['shared', contribution.integrationId, ...[...ids].sort()]);
				let group = shared.get(key);
				if (!group) {
					const groupOptions: ArtifactAutomationOption[] = [];
					group = {
						anchor: units.findLastIndex(unit => ids.includes(unit.action!.id)),
						options: groupOptions,
						spec: {
							key, contribution, action: undefined, options: groupOptions,
							caption: ids.length
								? localize('artifactSharedAutomation', "Applies to: {0}", ids.map(id => descriptor(id)?.label ?? id).join(', '))
								: localize('artifactAutomationOptions', "Automation"),
						},
					};
					shared.set(key, group);
				}
				group.options.push(option);
			}
			const specs: IArtifactActionUnitSpec[] = [];
			const place = (anchor: number) => {
				for (const group of shared.values()) {
					if (group.anchor === anchor) {
						specs.push(group.spec);
					}
				}
			};
			units.forEach((unit, index) => {
				specs.push(unit);
				place(index);
			});
			place(-1);
			return specs;
		});
	}

	/**
	 * Main details show automation next to the actions that are currently offered. Automation that is on, or
	 * that was turned off automatically, stays visible wherever its actions are, so that it can be reviewed and
	 * turned off. Once shown, a control stays until the details close so that live updates never remove it while in use.
	 */
	private isOptionShown(contribution: ArtifactContributionSnapshot, offered: readonly ArtifactActionView[], option: ArtifactAutomationOption): boolean {
		const key = JSON.stringify([contribution.integrationId, option.id]);
		if (option.actionIds.some(id => offered.some(view => view.id === id))
			|| isArtifactOptionEnabled(option, contribution.configuration.values[option.id])
			|| contribution.configuration.disablements[option.id]) {
			this.shownOptions.add(key);
		}
		return this.shownOptions.has(key);
	}

	private updateUnits(specs: readonly IArtifactActionUnitSpec[], scope: string): void {
		const active = getActiveElement();
		const activeUnit = isHTMLElement(active) ? this.orderedUnits.find(unit => unit.element.contains(active)) : undefined;
		const keys = new Set(specs.map(spec => spec.key));
		for (const key of this.units.keys()) {
			if (!keys.has(key)) {
				this.units.deleteAndDispose(key);
			}
		}
		let next = this.unitsContainer.firstElementChild;
		const orderedUnits: ArtifactActionUnit[] = [];
		for (const spec of specs) {
			let unit = this.units.get(spec.key);
			if (!unit) {
				unit = new ArtifactActionUnit(this.presentation, this.hoverService, this.quickInputService);
				this.units.set(spec.key, unit);
			}
			unit.update(spec, scope);
			if (next !== unit.element) {
				this.unitsContainer.insertBefore(unit.element, next);
			}
			next = unit.element.nextElementSibling;
			orderedUnits.push(unit);
		}
		this.orderedUnits = orderedUnits;
		this.unitsContainer.hidden = specs.length === 0;
		if (activeUnit && isHTMLElement(active)) {
			if (active.isConnected) {
				if (getActiveElement() !== active) {
					active.focus({ preventScroll: true });
				}
			} else if (orderedUnits.includes(activeUnit)) {
				(activeUnit.tabbableElements[0] ?? activeUnit.element).focus({ preventScroll: true });
			} else {
				this.element.focus();
			}
		}
	}

	private activity(snapshot: ArtifactSnapshot, integrationId: string, actionId: string): IArtifactActionActivity {
		const key = JSON.stringify([integrationId, actionId]);
		const requested = this.requests.get(key);
		if (requested && snapshot.runs.some(run => run.id === requested)) {
			this.requests.delete(key);
		}
		const bindingId = artifactBindingId(snapshot.authority.id, snapshot.session, snapshot.artifact.id, integrationId);
		const runs = snapshot.runs.filter(run => run.bindingId === bindingId && run.actionId === actionId);
		const unsettled = runs.filter(run => !isArtifactRunSettled(run));
		return { run: unsettled.find(run => run.dispatched) ?? unsettled.at(-1), latest: runs.at(-1), requested: this.requests.has(key) };
	}

	/** Runs an action once. Repeated requests are ignored until the previous run of the same action settles. */
	private invoke(integrationId: string, actionId: string): void {
		const snapshot = this.presentation.snapshot.get();
		const contribution = snapshot.contributions.find(contribution => contribution.integrationId === integrationId);
		const view = contribution && [...contribution.view.stateActions, ...contribution.view.generalActions].find(view => view.id === actionId);
		if (!view?.enabled || isArtifactActionBusy(this.activity(snapshot, integrationId, actionId))) {
			return;
		}
		const key = JSON.stringify([integrationId, actionId]);
		this.requests.set(key, undefined);
		this.requestsChanged.trigger(undefined);
		this.presentation.run(async () => {
			let runId: string | undefined;
			try {
				const run = await this.presentation.invoke(integrationId, actionId);
				runId = isArtifactRunSettled(run) ? undefined : run.id;
			} finally {
				if (runId) {
					this.requests.set(key, runId);
				} else {
					this.requests.delete(key);
				}
				if (!this._store.isDisposed) {
					this.requestsChanged.trigger(undefined);
				}
			}
		});
	}

	private async showHistory(): Promise<void> {
		let before: string | undefined;
		do {
			const page = await this.presentation.model.getRuns(before);
			const choices = page.runs.map(run => ({ label: `${run.actionId}: ${runStateLabel(run.state)}`, description: run.reason, run }));
			const more = { label: localize('artifactOlderActivity', "Earlier Activity"), description: '', run: undefined };
			const selected = await this.quickInputService.pick([...choices, ...(page.next ? [more] : [])], { placeHolder: localize('artifactActivityHistory', "Artifact Activity") });
			if (!selected) {
				return;
			}
			if (selected.run) {
				const run = selected.run;
				const label = run.indeterminate ? localize('artifactReconcileOutcome', "Reconcile Outcome") : localize('artifactCancelRun', "Cancel Action");
				if ((run.indeterminate || !isArtifactRunSettled(run)) && await this.quickInputService.pick([{ label }], { placeHolder: run.reason })) {
					await (run.indeterminate ? this.presentation.model.reconcile(run.id) : this.presentation.model.cancel(run.id));
				}
				return;
			}
			before = page.next;
		} while (before);
	}

	private generalActionButtons(snapshot: ArtifactSnapshot, contribution: ArtifactContributionSnapshot): IArtifactButton[] {
		return contribution.view.generalActions.flatMap(view => {
			const action = contribution.actions.find(action => action.id === view.id);
			if (!action) {
				return [];
			}
			const activity = this.activity(snapshot, contribution.integrationId, action.id);
			return [{
				id: JSON.stringify([contribution.integrationId, action.id]), label: action.label,
				icon: artifactActionIcon(activity, icon({ id: action.iconId })),
				enabled: view.enabled && !isArtifactActionBusy(activity), description: artifactActionNote(view, activity) || undefined,
				run: () => this.invoke(contribution.integrationId, action.id),
			}];
		});
	}
}

function runStateLabel(state: ArtifactRunState): string {
	switch (state) {
		case 'queued': return localize('artifactQueued', "Queued");
		case 'preparing': return localize('artifactPreparing', "Preparing");
		case 'blocked': return localize('artifactBlocked', "Waiting");
		case 'submitted': return localize('artifactSubmitted', "Submitted");
		case 'running': return localize('artifactRunning', "Running");
		case 'completed': return localize('artifactCompleted', "Completed");
		case 'skipped': return localize('artifactSkipped', "Skipped");
		case 'failed': return localize('artifactFailed', "Failed");
		case 'cancelled': return localize('artifactCancelled', "Cancelled");
		case 'interrupted': return localize('artifactInterrupted', "Interrupted");
	}
}
