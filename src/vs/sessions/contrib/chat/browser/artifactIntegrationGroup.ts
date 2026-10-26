/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/artifactIntegrationGroup.css';
import { $, addDisposableListener, append, EventHelper, EventType, getActiveElement, getWindow, isAncestorOfActiveElement, isHTMLElement, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { HoverStyle, IHoverLifecycleOptions } from '../../../../base/browser/ui/hover/hover.js';
import { Action, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { AnchorPosition } from '../../../../base/common/layout.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ArtifactGroupPresentation, ArtifactIcon, ArtifactSnapshot, getArtifactMainContribution } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { getArtifactThemeIcon, renderArtifactIcon } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IContextViewService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ChatPillActionViewItem, getChatPillEntryToolbarActions, IChatPill, IChatPillAction, IChatPillEntry } from '../../../../workbench/browser/chatPills.js';
import { ArtifactButtons, IArtifactButton } from './artifactButtons.js';
import { ArtifactDetailsSelection } from './artifactDetailsView.js';
import { ArtifactIntegrationPresentation, countEnabledArtifactAutomations, getArtifactStatusButtons, IArtifactDetailsHost } from './artifactIntegrationPresentation.js';

/** One artifact listed by an {@link ArtifactIntegrationGroup}. */
export interface IArtifactIntegrationGroupMember {
	readonly presentation: ArtifactIntegrationPresentation;
	/** The artifact's undecorated entry, supplying its title, open target and entry actions such as Copy Link and Remove. */
	readonly entry: IChatPillEntry;
	/** Moves the artifact out of the group into a pill of its own. */
	readonly pinAction?: IChatPillAction;
}

export interface IArtifactIntegrationGroupSummary {
	readonly icon: ThemeIcon;
	/** The integration's name for its artifacts, such as "Pull Requests". */
	readonly title: string;
	/** The title with the number of artifacts, such as "4 Pull Requests". */
	readonly label: string;
	readonly enabledAutomations: number;
}

/**
 * Summarizes a group of artifacts sharing a main integration. The icon is the one with the highest group priority
 * the integration assigned to any artifact, keeping the earlier artifact on ties, so a group of pull requests shows
 * a failing pull request's icon over an open one's. The label is the integration's fixed group label.
 */
export function getArtifactIntegrationGroupSummary(snapshots: readonly ArtifactSnapshot[]): IArtifactIntegrationGroupSummary {
	let group: ArtifactGroupPresentation | undefined;
	let fallbackIcon: ArtifactIcon | undefined;
	let groupLabel: string | undefined;
	let integrationLabel: string | undefined;
	let enabledAutomations = 0;
	for (const snapshot of snapshots) {
		const main = getArtifactMainContribution(snapshot);
		groupLabel ??= main?.groupLabel;
		integrationLabel ??= main?.label;
		fallbackIcon ??= main?.view.main?.icon;
		const candidate = main?.view.group;
		if (candidate && (!group || candidate.priority > group.priority)) {
			group = candidate;
		}
		enabledAutomations += countEnabledArtifactAutomations(snapshot);
	}
	const icon = group?.icon ?? fallbackIcon;
	const count = snapshots.length;
	const title = groupLabel ?? integrationLabel ?? localize('artifactGroup.artifacts', "Artifacts");
	return {
		icon: icon ? getArtifactThemeIcon(icon) : Codicon.link,
		title,
		label: groupLabel
			? localize('artifactGroup.label', "{0} {1}", count, groupLabel)
			: localize('artifactGroup.fallbackLabel', "{0} ({1})", title, count),
		enabledAutomations,
	};
}

/**
 * Several artifacts sharing a main integration, presented as one pill whose dropdown lists each artifact with the
 * same main part and status sections its own pill would show.
 */
export class ArtifactIntegrationGroup extends Disposable {
	readonly pill: IChatPill;
	readonly summary: IObservable<IArtifactIntegrationGroupSummary>;

	constructor(
		id: string,
		readonly members: IObservable<readonly IArtifactIntegrationGroupMember[]>,
		readonly detailsHost: IArtifactDetailsHost,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.summary = derived(this, reader => getArtifactIntegrationGroupSummary(members.read(reader).map(member => member.presentation.snapshot.read(reader))));
		const action = this._register(new Action(`artifactIntegrationGroup.${id}`, this.summary.get().label));
		this._register(autorun(reader => {
			action.label = this.summary.read(reader).label;
		}));
		this.pill = {
			action,
			createActionViewItem: options => instantiationService.createInstance(ArtifactIntegrationGroupPill, this, action, options),
		};
	}
}

class ArtifactIntegrationGroupPill extends ChatPillActionViewItem {
	private readonly hoverLifecycleOptions = { groupId: generateUuid() };
	private sections: ArtifactButtons | undefined;
	private readonly dropdown = this._register(new MutableDisposable<ArtifactIntegrationGroupDropdown>());

	constructor(
		private readonly group: ArtifactIntegrationGroup,
		action: Action,
		options: IActionViewItemOptions,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
	}

	protected override get itemModifierClass(): string { return 'artifact-integration-group-pill'; }
	protected override get buttonModifierClass(): string { return 'chat-dropdown-pill-button'; }

	protected override renderContent(): void {
		this.sections = this._register(new ArtifactButtons(append(this.element!, $('.chat-pill-sections.artifact-pill-sections')), this.hoverService, 'pill', this.hoverLifecycleOptions));
		this._register(this.hoverService.setupDelayedHover(this.button!.element, () => ({
			content: this.hoverContent(),
			style: HoverStyle.Pointer,
		}), this.hoverLifecycleOptions));
		const button = this.button!.element;
		button.setAttribute('aria-haspopup', 'dialog');
		button.setAttribute('aria-expanded', 'false');
		// Moving from a member's details to the group dropdown is not an outside click that only dismisses the details.
		button.dataset.artifactDetailsOwner = this.group.detailsHost.id;
		this._register(autorun(reader => {
			const summary = this.group.summary.read(reader);
			const selected = this.group.detailsHost.selected.read(reader);
			this.element!.classList.toggle('artifact-pill-selected', !!selected && this.group.members.read(reader).some(member => member.presentation === selected));
			this.updateLabel();
			this.updateAriaLabel();
			const sections: IArtifactButton[] = summary.enabledAutomations ? [{
				id: 'artifact-automations', label: String(summary.enabledAutomations), icon: Codicon.robot,
				description: summary.enabledAutomations === 1
					? localize('artifactGroup.automationEnabled', "1 Autopilot rule enabled across {0}", summary.label)
					: localize('artifactGroup.automationsEnabled', "{0} Autopilot rules enabled across {1}", summary.enabledAutomations, summary.label),
				ariaLabel: localize('artifactGroup.showAutomations', "Show {0}: {1} Autopilot rules enabled", summary.label, summary.enabledAutomations),
				run: () => this.toggleDropdown(),
			}] : [];
			this.sections!.update(sections);
			this.element!.classList.toggle('chat-pill-segmented', sections.length > 0);
		}));
	}

	protected override onDidClickButton(): void {
		this.toggleDropdown();
	}

	protected override hasOpenDropdown(): boolean {
		return !!this.dropdown.value;
	}

	private toggleDropdown(): void {
		if (this.dropdown.value) {
			this.dropdown.clear();
			this.updateExpanded();
			return;
		}
		const button = this.button?.element;
		if (!button?.isConnected || !this.element) {
			return;
		}
		const dropdown = this.instantiationService.createInstance(ArtifactIntegrationGroupDropdown, this.group, this.element, button, restoreFocus => {
			if (this.dropdown.value === dropdown) {
				this.dropdown.clear();
			}
			this.updateExpanded();
			if (restoreFocus && button.isConnected) {
				button.focus();
			}
		});
		this.dropdown.value = dropdown;
		this.hoverService.hideHover(true);
		dropdown.show();
		this.updateExpanded();
	}

	private updateExpanded(): void {
		this.button?.element.setAttribute('aria-expanded', String(!!this.dropdown.value));
	}

	protected override getIconElement(): HTMLElement | undefined {
		return renderArtifactIcon(this.group.summary.get().icon, 'chat-pill-icon');
	}

	protected override getLabelText(): string {
		return this.group.summary.get().label;
	}

	protected override getAdditionalLabelContent(): Array<HTMLElement | string> {
		return [$(`span.chat-pill-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDownCompact)}`, { 'aria-hidden': 'true' })];
	}

	protected override getAriaLabel(): string {
		return localize('artifactGroup.show', "Show {0}", this.group.summary.get().label);
	}

	private hoverContent(): HTMLElement {
		const content = $('.artifact-group-pill-hover');
		append(content, $('div.artifact-group-pill-hover-title', undefined, this.group.summary.get().label));
		for (const member of this.group.members.get()) {
			const main = getArtifactMainContribution(member.presentation.snapshot.get())?.view.main;
			append(content, $('div', undefined, main?.description ?? main?.label ?? member.entry.label));
		}
		return content;
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
}

/** An action of a group dropdown row, and whether the dropdown stays open when it runs. */
export interface IArtifactGroupRowAction {
	readonly action: IChatPillAction;
	/** Actions that change the group's members, such as Pin and Remove, keep the dropdown open to continue with it. */
	readonly keepOpen: boolean;
}

/**
 * The actions a group dropdown row offers for its artifact: Open, then the entry's own actions in the order the other
 * pill dropdowns show them, with Pin before the entry's promoted action, such as Remove.
 */
export function getArtifactGroupRowActions(member: Pick<IArtifactIntegrationGroupMember, 'entry' | 'pinAction'>): readonly IArtifactGroupRowAction[] {
	const { entry, pinAction } = member;
	const open = toAction({
		id: `artifactGroup.open.${entry.id}`,
		label: entry.ariaLabel ?? localize('artifactGroup.open', "Open {0}", entry.label),
		class: ThemeIcon.asClassName(Codicon.linkExternal),
		run: () => entry.open(),
	});
	const entryActions = getChatPillEntryToolbarActions({ ...entry, toolbarActions: [...entry.toolbarActions ?? [], ...pinAction ? [pinAction] : []] });
	return [open, ...entryActions].map(action => ({ action, keepOpen: action === pinAction || action === entry.promotedAction }));
}

/** Marks the focusable controls of a dropdown row, in their visual order. */
const controlAttribute = 'data-artifact-group-control';

/**
 * Lists a group's artifacts above its pill. Each row is a toolbar: the artifact's main part opens its details,
 * each status section opens the matching list, and the trailing actions open, copy, pin or remove the artifact.
 */
class ArtifactIntegrationGroupDropdown extends Disposable {
	private readonly element: HTMLElement;
	private readonly header: HTMLElement;
	private readonly list: HTMLElement;
	private readonly rows = this._register(new DisposableMap<string, ArtifactIntegrationGroupRow>());
	private orderedRows: readonly ArtifactIntegrationGroupRow[] = [];
	private readonly hoverLifecycleOptions: IHoverLifecycleOptions = { groupId: generateUuid() };
	private view: IOpenContextView | undefined;
	private restoreFocus = false;
	private disposing = false;

	/**
	 * @param pill The group pill, which positions the dropdown and toggles it itself.
	 * @param button The pill's button, which receives focus back and anchors the artifact details.
	 */
	constructor(
		private readonly group: ArtifactIntegrationGroup,
		private readonly pill: HTMLElement,
		private readonly button: HTMLElement,
		private readonly onDidHide: (restoreFocus: boolean) => void,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		const headerId = `artifact-group-${generateUuid()}`;
		this.element = $('.action-widget.action-widget-dropdown.artifact-group-dropdown', { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': headerId, tabindex: '-1' });
		this.header = append(this.element, $('.artifact-group-header', { id: headerId }));
		this.list = append(this.element, $('.artifact-group-rows'));
		this._register(addDisposableListener(this.element, EventType.KEY_DOWN, event => this.onKeyDown(event)));
		this._register(autorun(reader => {
			const members = this.group.members.read(reader);
			const summary = this.group.summary.read(reader);
			const selected = this.group.detailsHost.selected.read(reader);
			this.header.textContent = summary.title;
			this.element.setAttribute('aria-label', summary.label);
			const active = getActiveElement();
			const focusedRow = this.orderedRows.findIndex(row => isHTMLElement(active) && row.element.contains(active));
			const ids = new Set(members.map(member => member.entry.id));
			for (const id of [...this.rows.keys()]) {
				if (!ids.has(id)) {
					this.rows.deleteAndDispose(id);
				}
			}
			let next = this.list.firstElementChild;
			this.orderedRows = members.map((member, index) => {
				let row = this.rows.get(member.entry.id);
				if (!row) {
					row = new ArtifactIntegrationGroupRow(this.hoverService, this.hoverLifecycleOptions, {
						openDetails: (presentation, selection) => this.openDetails(presentation, selection),
						run: (action, keepOpen) => this.runAction(action, keepOpen),
					});
					this.rows.set(member.entry.id, row);
				}
				row.update(member, member.presentation.snapshot.read(reader), member.presentation === selected, index, members.length);
				if (next !== row.element) {
					this.list.insertBefore(row.element, next);
				}
				next = row.element.nextElementSibling;
				return row;
			});
			if (focusedRow >= 0 && !isAncestorOfActiveElement(this.element)) {
				// The focused artifact left the group, for example after pinning or removing it.
				this.orderedRows[Math.min(focusedRow, this.orderedRows.length - 1)]?.focus();
			}
			if (this.view) {
				this.contextViewService.layout();
			}
		}));
	}

	show(): void {
		const targetWindow = getWindow(this.pill);
		this.view = this.contextViewService.showContextView({
			getAnchor: () => this.pill,
			anchorPosition: AnchorPosition.ABOVE,
			anchorAlignment: AnchorAlignment.LEFT,
			// Context views start at 2575; Quick Input must remain above this dropdown at 2550.
			layer: -50,
			render: container => {
				append(container, this.element);
				const store = new DisposableStore();
				const isOwn = (target: EventTarget | null) => isHTMLElement(target) && (this.element.contains(target) || this.pill.contains(target));
				store.add(addDisposableListener(targetWindow.document, EventType.POINTER_DOWN, event => {
					const path = event.composedPath();
					// The pill toggles its own dropdown; a click there must not close it first.
					if (!path.includes(this.element) && !path.includes(this.pill)) {
						this.hide(false);
					}
				}, true));
				store.add(addDisposableListener(targetWindow, EventType.BLUR, () => this.hide(false)));
				// Close when focus moves elsewhere, such as through a keyboard shortcut, since keys no longer reach the
				// dropdown then. The check waits a moment, as pinning or removing the focused row hands focus to a neighbour.
				const focusCheck = store.add(new MutableDisposable());
				store.add(addDisposableListener(this.element, EventType.FOCUS_OUT, event => {
					if (!isOwn(event.relatedTarget)) {
						focusCheck.value = disposableTimeout(() => {
							if (!isOwn(getActiveElement())) {
								this.hide(false);
							}
						}, 0);
					}
				}));
				return toDisposable(() => {
					store.dispose();
					this.element.remove();
				});
			},
			onHide: () => {
				this.view = undefined;
				if (!this.disposing) {
					this.onDidHide(this.restoreFocus);
				}
			},
		}, this.layoutService.getContainer(targetWindow));
		const selected = this.group.detailsHost.selected.get();
		(this.orderedRows.find(row => row.presentation === selected) ?? this.orderedRows[0])?.focus();
	}

	private hide(restoreFocus: boolean): void {
		this.restoreFocus = restoreFocus;
		this.view?.close();
	}

	private openDetails(presentation: ArtifactIntegrationPresentation, selection: ArtifactDetailsSelection | undefined): void {
		const button = this.button;
		const host = this.group.detailsHost;
		this.hide(false);
		if (button.isConnected) {
			host.toggle(presentation, button, selection);
		}
	}

	private runAction(action: IChatPillAction, keepOpen: boolean): void {
		if (!keepOpen) {
			this.hide(true);
		}
		if (action.enabled) {
			Promise.resolve(action.run()).catch(onUnexpectedError);
		}
	}

	private onKeyDown(browserEvent: KeyboardEvent): void {
		const event = new StandardKeyboardEvent(browserEvent);
		const active = getActiveElement();
		const rowIndex = this.orderedRows.findIndex(row => isHTMLElement(active) && row.element.contains(active));
		const row = this.orderedRows[rowIndex];
		if (event.equals(KeyCode.Escape)) {
			EventHelper.stop(browserEvent, true);
			this.hide(true);
			return;
		}
		if (event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow)) {
			EventHelper.stop(browserEvent, true);
			const count = this.orderedRows.length;
			const target = rowIndex < 0 ? 0 : (rowIndex + (event.equals(KeyCode.DownArrow) ? 1 : -1) + count) % count;
			this.orderedRows[target]?.focus();
			return;
		}
		if (event.equals(KeyCode.Home) || event.equals(KeyCode.End)) {
			EventHelper.stop(browserEvent, true);
			(event.equals(KeyCode.Home) ? this.orderedRows[0] : this.orderedRows.at(-1))?.focus();
			return;
		}
		if ((event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow)) && row && isHTMLElement(active)) {
			EventHelper.stop(browserEvent, true);
			row.focusSibling(active, event.equals(KeyCode.RightArrow) ? 1 : -1);
			return;
		}
		if (event.equals(KeyCode.Tab) || event.equals(KeyMod.Shift | KeyCode.Tab)) {
			// Keep focus in the dropdown, moving through every control in order.
			EventHelper.stop(browserEvent, true);
			const controls = this.orderedRows.flatMap(row => row.controlElements.map(control => ({ row, control })));
			if (controls.length) {
				const index = controls.findIndex(({ control }) => control === active);
				const step = event.shiftKey ? -1 : 1;
				const target = controls[index < 0 ? 0 : (index + step + controls.length) % controls.length];
				target.row.focus(target.control);
			}
			return;
		}
		if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) && isHTMLElement(active) && active.hasAttribute(controlAttribute)) {
			EventHelper.stop(browserEvent, true);
			active.click();
		}
	}

	override dispose(): void {
		this.disposing = true;
		this.view?.close();
		super.dispose();
	}
}

interface IArtifactIntegrationGroupRowDelegate {
	openDetails(presentation: ArtifactIntegrationPresentation, selection: ArtifactDetailsSelection | undefined): void;
	run(action: IChatPillAction, keepOpen: boolean): void;
}

class ArtifactIntegrationGroupRow extends Disposable {
	readonly element: HTMLElement;
	private readonly main: HTMLElement;
	private readonly icon: HTMLElement;
	private readonly label: HTMLElement;
	private readonly statuses: HTMLElement;
	private readonly title: HTMLElement;
	private readonly actions: HTMLElement;
	private readonly content = this._register(new DisposableStore());
	private member: IArtifactIntegrationGroupMember | undefined;
	/** The row's focusable controls in visual order, by a key that survives updates. */
	private controls = new Map<string, HTMLElement>();

	constructor(
		private readonly hoverService: IHoverService,
		private readonly hoverLifecycleOptions: IHoverLifecycleOptions,
		private readonly delegate: IArtifactIntegrationGroupRowDelegate,
	) {
		super();
		this.element = $('.artifact-group-row', { role: 'toolbar', 'aria-orientation': 'horizontal' });
		this.main = append(this.element, $('.artifact-group-row-main', { role: 'button', tabindex: '-1', [controlAttribute]: '', 'aria-haspopup': 'dialog' }));
		this.icon = append(this.main, $('span.artifact-group-row-icon'));
		this.label = append(this.main, $('span.artifact-group-row-label'));
		this.statuses = append(this.element, $('.artifact-group-row-statuses'));
		this.title = append(this.element, $('span.artifact-group-row-title', { 'aria-hidden': 'true' }));
		this.actions = append(this.element, $('.artifact-group-row-actions'));
		this._register(toDisposable(() => this.element.remove()));
		this._register(this.hoverService.setupDelayedHover(this.main, () => ({ content: this.mainDescription(), style: HoverStyle.Pointer }), this.hoverLifecycleOptions));
		this._register(this.hoverService.setupDelayedHover(this.title, () => ({ content: this.member?.entry.label ?? '', style: HoverStyle.Pointer }), this.hoverLifecycleOptions));
		// The row's free space, such as its title, opens the artifact's details like its main part.
		this._register(addDisposableListener(this.element, EventType.CLICK, event => {
			const target = event.target;
			if (isHTMLElement(target) && (target.closest('.artifact-group-row-statuses') || target.closest('.artifact-group-row-actions'))) {
				return;
			}
			EventHelper.stop(event, true);
			if (this.member) {
				this.delegate.openDetails(this.member.presentation, undefined);
			}
		}));
	}

	get presentation(): ArtifactIntegrationPresentation | undefined {
		return this.member?.presentation;
	}

	update(member: IArtifactIntegrationGroupMember, snapshot: ArtifactSnapshot, selected: boolean, index: number, count: number): void {
		this.member = member;
		const active = getActiveElement();
		const focusedKey = isHTMLElement(active) ? [...this.controls].find(([, control]) => control === active)?.[0] : undefined;
		this.content.clear();
		const main = getArtifactMainContribution(snapshot)?.view.main;
		const label = main?.label ?? member.entry.pillLabel ?? member.entry.label;
		const description = main?.description ?? label;
		this.element.classList.toggle('selected', selected);
		this.element.setAttribute('aria-label', localize('artifactGroup.row', "{0}, {1} of {2}", description, index + 1, count));
		reset(this.icon, renderArtifactIcon(main ? getArtifactThemeIcon(main.icon) : member.entry.icon ?? Codicon.link));
		this.label.textContent = label;
		this.main.setAttribute('aria-label', localize('artifactGroup.showDetails', "Show artifact details: {0}", description));
		this.main.setAttribute('aria-expanded', String(selected));
		this.main.setAttribute('aria-controls', member.presentation.detailsHost.id);
		const title = member.entry.label !== label ? member.entry.label : '';
		this.title.textContent = title;
		this.title.hidden = !title;

		const statuses = getArtifactStatusButtons(member.presentation, snapshot, selected, (_target, selection) => this.delegate.openDetails(member.presentation, selection));

		const actions = getArtifactGroupRowActions(member);

		const statusElements = statuses.map(status => [`status:${status.id}`, this.renderStatus(status)] as const);
		reset(this.statuses, ...statusElements.map(([, element]) => element));
		this.statuses.hidden = statuses.length === 0;
		const actionElements = actions.map(({ action, keepOpen }) => [`action:${action.id}`, this.renderAction(action, keepOpen)] as const);
		reset(this.actions, ...actionElements.map(([, element]) => element));
		this.controls = new Map([['main', this.main], ...statusElements, ...actionElements]);

		if (focusedKey !== undefined) {
			this.focus(this.controls.get(focusedKey));
		}
	}

	/** The row's focusable controls in visual order. */
	get controlElements(): readonly HTMLElement[] {
		return [...this.controls.values()];
	}

	/** Focuses a control of this row, its main part by default. */
	focus(control: HTMLElement = this.main): void {
		// The row's actions are hidden until the row has focus, and a hidden element cannot take it.
		if (!this.element.contains(getActiveElement())) {
			this.main.focus();
		}
		control.focus();
	}

	/** Moves focus to the previous or next control of this row, staying on its first or last one. */
	focusSibling(active: HTMLElement, step: 1 | -1): void {
		const controls = this.controlElements;
		const index = controls.indexOf(active);
		controls[Math.max(0, Math.min(controls.length - 1, index + step))]?.focus();
	}

	private mainDescription(): string {
		const member = this.member;
		if (!member) {
			return '';
		}
		const main = getArtifactMainContribution(member.presentation.snapshot.get())?.view.main;
		return main?.description ?? main?.label ?? member.entry.label;
	}

	private renderStatus(status: IArtifactButton): HTMLElement {
		const element = $('.artifact-group-row-status', { role: 'button', tabindex: '-1', [controlAttribute]: '', 'aria-haspopup': 'dialog' });
		if (status.icon) {
			append(element, renderArtifactIcon(status.icon));
		}
		append(element, $('span.artifact-group-row-status-label', undefined, status.label));
		element.setAttribute('aria-label', status.ariaLabel ?? status.description ?? status.label);
		if (status.controls) {
			element.setAttribute('aria-controls', status.controls);
		}
		this.content.add(this.hoverService.setupDelayedHover(element, () => ({ content: status.description ?? status.label, style: HoverStyle.Pointer }), this.hoverLifecycleOptions));
		this.content.add(addDisposableListener(element, EventType.CLICK, event => {
			EventHelper.stop(event, true);
			status.run(element);
		}));
		return element;
	}

	private renderAction(action: IChatPillAction, keepOpen: boolean): HTMLElement {
		const element = $(`.artifact-group-row-action${action.class ? `.${action.class.split(/\s+/).filter(Boolean).join('.')}` : ''}`, {
			role: 'button', tabindex: '-1', [controlAttribute]: '', 'aria-label': action.label,
		});
		element.setAttribute('aria-disabled', String(!action.enabled));
		this.content.add(this.hoverService.setupDelayedHover(element, () => ({ content: action.tooltip || action.label, style: HoverStyle.Pointer }), this.hoverLifecycleOptions));
		// Leave focus where it is until the action runs, so removing the row cannot strand it.
		this.content.add(addDisposableListener(element, EventType.MOUSE_DOWN, event => event.preventDefault()));
		this.content.add(addDisposableListener(element, EventType.CLICK, event => {
			EventHelper.stop(event, true);
			this.delegate.run(action, keepOpen);
		}));
		return element;
	}
}
