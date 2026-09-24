/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/artifactIntegrations.css';
import { $, append, isHTMLElement, reset } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IDelayedHoverOptions, IHoverWidget } from '../../../../base/browser/ui/hover/hover.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IReader, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ArtifactContributionSnapshot, ArtifactDetails, ArtifactIcon, ArtifactRunState, IArtifactDetailsModel, IArtifactModel, isArtifactOptionEnabled, isArtifactRunSettled } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, getColorRegistry } from '../../../../platform/theme/common/colorUtils.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { ChatPillActionViewItem, getChatPillEntryToolbarActions, IChatPill, IChatPillEntry } from '../../../../workbench/browser/chatPills.js';

function icon(value: ArtifactIcon): ThemeIcon {
	const id = getIconRegistry().getIcon(value.id) ? value.id : Codicon.link.id;
	const color = value.colorId && Object.hasOwn(getColorRegistry().getColorSchema().properties ?? {}, value.colorId) ? { id: value.colorId } : undefined;
	return { id, color };
}

interface IArtifactButton {
	readonly id: string;
	readonly label: string;
	readonly icon?: ThemeIcon;
	readonly enabled?: boolean;
	readonly description?: string;
	readonly pressed?: boolean;
	readonly hover?: () => IDelayedHoverOptions;
	run(target: HTMLElement): void;
}

class ArtifactButtons extends Disposable {
	private readonly buttons = this._register(new DisposableMap<string, ArtifactButton>());
	private focusable = true;

	constructor(readonly element: HTMLElement, private readonly hoverService: IHoverService) {
		super();
		element.setAttribute('role', 'group');
	}

	update(items: readonly IArtifactButton[]): void {
		const active = this.element.ownerDocument.activeElement;
		const hadFocus = !!active && this.element.contains(active);
		const ids = new Set(items.map(item => item.id));
		for (const id of this.buttons.keys()) {
			if (!ids.has(id)) {
				this.buttons.deleteAndDispose(id);
			}
		}
		let next = this.element.firstElementChild;
		for (const item of items) {
			let slot = this.buttons.get(item.id);
			if (!slot) {
				slot = new ArtifactButton(this.element, item, this.hoverService);
				this.buttons.set(item.id, slot);
			}
			slot.update(item);
			slot.button.element.tabIndex = this.focusable && slot.button.enabled ? 0 : -1;
			if (next !== slot.button.element) {
				this.element.insertBefore(slot.button.element, next);
			}
			next = slot.button.element.nextElementSibling;
		}
		if (hadFocus && isHTMLElement(active)) {
			if (active.isConnected) {
				if (this.element.ownerDocument.activeElement !== active) {
					active.focus({ preventScroll: true });
				}
			} else {
				const first = items.find(item => item.enabled !== false);
				if (first) {
					this.buttons.get(first.id)?.button.focus();
				} else {
					this.element.parentElement?.focus();
				}
			}
		}
		this.element.hidden = items.length === 0;
		const heading = this.element.previousElementSibling;
		if (isHTMLElement(heading) && heading.tagName === 'H4') {
			heading.hidden = items.length === 0;
		}
	}

	setFocusable(focusable: boolean): void {
		this.focusable = focusable;
		for (const slot of this.buttons.values()) {
			slot.button.element.tabIndex = focusable && slot.button.enabled ? 0 : -1;
		}
	}

	focus(id: string): void {
		this.buttons.get(id)?.button.focus();
	}
}

class ArtifactButton extends Disposable {
	readonly button: Button;

	constructor(container: HTMLElement, private value: IArtifactButton, hoverService: IHoverService) {
		super();
		this.button = this._register(new Button(container, { ...defaultButtonStyles, secondary: true, small: true }));
		this._register(this.button.onDidClick(() => this.value.run(this.button.element)));
		this._register(hoverService.setupDelayedHover(this.button.element, () => this.value.hover?.() ?? { content: this.value.description ?? this.value.label }));
	}

	update(value: IArtifactButton): void {
		this.value = value;
		const glyph = value.icon ? renderIcon(value.icon) : undefined;
		if (glyph) {
			glyph.setAttribute('aria-hidden', 'true');
			glyph.style.color = value.icon?.color ? asCssVariable(value.icon.color.id) : '';
		}
		reset(this.button.element, ...(glyph ? [glyph] : []), $('span.artifact-button-label', undefined, value.label));
		this.button.enabled = value.enabled !== false;
		this.button.element.setAttribute('aria-label', value.description ? `${value.label}. ${value.description}` : value.label);
		if (value.pressed === undefined) {
			this.button.element.removeAttribute('aria-pressed');
		} else {
			this.button.element.setAttribute('aria-pressed', String(value.pressed));
		}
	}
}

export class ArtifactIntegrationPresentation extends Disposable {
	readonly inlinePill: IChatPill;
	private readonly dropdown = this._register(new MutableDisposable<ArtifactIntegrationPanel>());
	private readonly hover = {
		content: () => {
			this.dropdown.value ??= this.instantiationService.createInstance(ArtifactIntegrationPanel, this, undefined);
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

	constructor(
		readonly model: IArtifactModel,
		private readonly invokingChat: () => string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notifications: INotificationService,
	) {
		super();
		this.action = this._register(new Action(`artifactIntegration.${model.snapshot.get().artifact.id}`, model.snapshot.get().artifact.label, undefined, true, async () => this.entry?.open()));
		this.inlinePill = {
			action: this.action,
			createActionViewItem: options => this.instantiationService.createInstance(ArtifactIntegrationPill, this, this.action, options),
		};
	}

	decorate(entry: IChatPillEntry, reader: IReader): IChatPillEntry {
		this.entry = entry;
		const snapshot = this.model.snapshot.read(reader);
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

	async invoke(integrationId: string, actionId: string): Promise<void> {
		const chat = this.invokingChat();
		const run = await this.model.invoke(integrationId, actionId, chat, generateUuid());
		status(localize('artifactActionRequested', "Artifact action requested: {0}", run.reason));
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

	protected override renderContent(): void {
		this.sections = this._register(new ArtifactButtons(append(this.element!, $('.artifact-pill-sections')), this.hoverService));
		this._register(this.hoverService.setupDelayedHover(this.button!.element, () => this.details()));
		this._register(autorun(reader => {
			const snapshot = this.presentation.model.snapshot.read(reader);
			this.updateLabel();
			this.updateAriaLabel();
			this.sections!.update([
				...snapshot.contributions.flatMap(contribution => contribution.view.sections.map(section => ({
					id: JSON.stringify([contribution.integrationId, section.id]), label: section.label, icon: icon(section.icon),
					hover: () => this.details([contribution.integrationId, section.detailsId]),
					run: (target: HTMLElement) => this.showDetails(target, [contribution.integrationId, section.detailsId]),
				}))),
				{ id: 'actions', label: localize('artifactActions', "Actions"), icon: Codicon.ellipsis, run: target => this.showDetails(target) },
			]);
		}));
	}

	protected override getLabelText(): string {
		const snapshot = this.presentation.model.snapshot.get();
		return snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main?.label
			?? this.presentation.baseEntry?.label ?? snapshot.artifact.label;
	}

	protected override getIconElement(): HTMLElement | undefined {
		const snapshot = this.presentation.model.snapshot.get();
		const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main;
		const themeIcon = main ? icon(main.icon) : this.presentation.baseEntry?.icon ?? Codicon.link;
		const glyph = renderIcon(themeIcon);
		glyph.setAttribute('aria-hidden', 'true');
		if (themeIcon.color) {
			glyph.style.color = asCssVariable(themeIcon.color.id);
		}
		return glyph;
	}

	protected override getAriaLabel(): string {
		return localize('artifactOpenResource', "Open {0}", this.getLabelText());
	}

	protected override updateTooltip(): void { }

	override isFocused(): boolean {
		return !!this.element?.contains(this.element.ownerDocument.activeElement);
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
		const panel = this.instantiationService.createInstance(ArtifactIntegrationPanel, this.presentation, selection);
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
	readonly element = $('.artifact-integration-panel', { tabIndex: -1 });
	private readonly title = append(this.element, $('h3'));
	private readonly resource = append(this.element, $('p'));
	private readonly scope = append(this.element, $('p.artifact-scope'));
	private readonly availability = append(this.element, $('p'));
	private readonly description = append(this.element, $('p'));
	private readonly facts = append(this.element, $('dl'));
	private readonly details = this._register(new MutableDisposable<IArtifactDetailsModel>());
	private readonly detailsView = observableValue<ArtifactDetails | undefined>(this, undefined);
	private readonly detailsListener = this._register(new MutableDisposable());
	private readonly selected = observableValue<readonly [string, string] | undefined>(this, undefined);
	private readonly started = observableValue(this, false);
	private readonly sections: ArtifactButtons;
	private readonly stateActions: ArtifactButtons;
	private readonly generalActions: ArtifactButtons;
	private readonly options: ArtifactButtons;
	private readonly items: ArtifactButtons;
	private readonly history: ArtifactButtons;

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		selection: readonly [string, string] | undefined,
		@IHoverService hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
		this.selected.set(selection, undefined);
		const group = (label: string) => {
			append(this.element, $('h4', undefined, label));
			const buttons = append(this.element, $('.artifact-controls', { 'aria-label': label }));
			return this._register(new ArtifactButtons(buttons, hoverService));
		};
		this.sections = group(localize('artifactSections', "Details"));
		this.items = group(localize('artifactRelatedItems', "Related Items"));
		this.stateActions = group(localize('artifactStateActions', "Actions"));
		this.generalActions = group(localize('artifactGeneralActions', "General Actions"));
		this.options = group(localize('artifactAutomationOptions', "Automation"));
		this.history = group(localize('artifactRecentActivity', "Recent Activity"));
		this._register(autorun(reader => {
			const snapshot = this.presentation.model.snapshot.read(reader);
			const selected = this.selected.read(reader);
			this.title.textContent = snapshot.artifact.label;
			this.resource.textContent = snapshot.artifact.resource;
			this.scope.textContent = snapshot.authority.location === 'client'
				? localize('artifactLocalScope', "Runs on this computer while connected. Automation is off until you enable it here.")
				: localize('artifactHostScope', "Runs on the agent host. Automation is off until you enable it for this session.");
			this.availability.textContent = snapshot.contributions.flatMap(contribution => 'reason' in contribution.view.availability
				? [localize('artifactIntegrationStatus', "{0}: {1}", contribution.label, contribution.view.availability.reason)] : []).join('\n');
			this.sections.update(snapshot.contributions.flatMap(contribution => [
				...contribution.view.main ? [{ ...contribution.view.main, id: 'main' }] : [],
				...contribution.view.sections.map(section => ({ ...section, id: `section:${section.id}` })),
			].map(section => ({
				id: JSON.stringify([contribution.integrationId, section.id]),
				label: section.label, icon: icon(section.icon),
				pressed: selected?.[0] === contribution.integrationId && selected[1] === section.detailsId,
				run: () => this.selected.set([contribution.integrationId, section.detailsId], undefined),
			}))));
			this.stateActions.update(snapshot.contributions.flatMap(contribution => this.actions(contribution, 'stateActions')));
			const entry = this.presentation.baseEntry;
			const shellActions = entry ? getChatPillEntryToolbarActions(entry) : [];
			this.generalActions.update([
				...snapshot.contributions.flatMap(contribution => this.actions(contribution, 'generalActions')),
				...shellActions.map(action => {
					const glyphClass = action.class?.split(' ').find(value => value.startsWith('codicon-'));
					return {
						id: `shell:${action.id}`, label: action.label,
						icon: glyphClass ? icon({ id: glyphClass.slice('codicon-'.length) }) : undefined,
						enabled: action.enabled,
						run: () => this.presentation.run(async () => { await action.run(); }),
					};
				}),
			]);
			this.options.update(snapshot.contributions.flatMap(contribution => contribution.options.map(option => {
				const current = contribution.configuration.values[option.id];
				const enabled = isArtifactOptionEnabled(option, current);
				const available = contribution.view.automationAvailability.find(available => available.id === option.id);
				const label = option.kind === 'boolean'
					? localize('artifactBooleanOption', "{0}: {1}", option.label, enabled ? localize('artifactOn', "On") : localize('artifactOff', "Off"))
					: localize('artifactEnumOption', "{0}: {1}", option.label, option.choices.find(choice => choice.value === current)?.label ?? String(current));
				return {
					id: JSON.stringify([contribution.integrationId, option.id]), label,
					pressed: option.kind === 'boolean' ? enabled : undefined,
					enabled: enabled || available?.available === true,
					description: [
						option.description,
						localize('artifactPermittedActions', "Allowed actions: {0}.", option.actionIds.map(id => contribution.actions.find(action => action.id === id)?.label ?? id).join(', ')),
						localize('artifactAttemptBudget', "At most {0} dispatched attempts per occurrence.", option.maxAttempts),
						contribution.configuration.disablements[option.id]?.reason ?? available?.unavailableReason,
					].filter(Boolean).join(' '),
					run: () => this.presentation.run(async () => {
						const value = option.kind === 'boolean' ? !enabled
							: (await this.quickInputService.pick(option.choices.map(choice => ({ ...choice })), { placeHolder: option.description }))?.value;
						if (value !== undefined) {
							await this.presentation.model.configure(contribution.integrationId, contribution.configuration.revision, { [option.id]: value });
							status(localize('artifactAutomationSaved', "Artifact automation updated: {0}", option.label));
						}
					}),
				};
			})));
			this.history.update([...snapshot.runs.slice(-10).reverse().map(run => ({
				id: run.id, label: run.indeterminate ? localize('artifactReconcileRun', "Reconcile {0}: {1}", run.actionId, runStateLabel(run.state))
					: !isArtifactRunSettled(run) ? localize('artifactCancelActivity', "Cancel {0}: {1}", run.actionId, runStateLabel(run.state))
						: localize('artifactRunStatus', "{0}: {1}", run.actionId, runStateLabel(run.state)),
				description: run.reason,
				enabled: run.indeterminate || !isArtifactRunSettled(run),
				icon: run.indeterminate ? Codicon.refresh : isArtifactRunSettled(run) ? Codicon.info : Codicon.closeCompact,
				run: () => this.presentation.run(() => run.indeterminate ? this.presentation.model.reconcile(run.id) : this.presentation.model.cancel(run.id)),
			})), ...snapshot.runs.length ? [{
				id: 'history', label: localize('artifactViewActivity', "View Activity"),
				run: () => this.presentation.run(() => this.showHistory()),
			}] : []]);
		}));
		const detailsSelection = derivedOpts<readonly [string, string] | undefined>({
			owner: this,
			equalsFn: (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1],
		}, reader => {
			if (!this.started.read(reader)) {
				return undefined;
			}
			const snapshot = this.presentation.model.snapshot.read(reader);
			const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId);
			return this.selected.read(reader) ?? (main?.view.main ? [main.integrationId, main.view.main.detailsId] : undefined);
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
					this.detailsView.set({ title: this.presentation.model.snapshot.get().artifact.label, availability: { kind: 'error', reason: toErrorMessage(error) }, links: [], items: [], completeness: 'complete' }, undefined);
				}
			});
		}));
		this._register(autorun(reader => {
			const details = this.detailsView.read(reader);
			const selection = detailsSelection.read(reader);
			const contribution = this.presentation.model.snapshot.read(reader).contributions.find(contribution => contribution.integrationId === selection?.[0]);
			this.description.textContent = details ? [details.title, details.description, 'reason' in details.availability ? details.availability.reason : undefined].filter(Boolean).join('\n')
				: detailsSelection.read(reader) ? localize('artifactDetailsLoading', "Loading details...") : '';
			reset(this.facts, ...details?.facts?.flatMap(fact => [$('dt', undefined, fact.label), $('dd', undefined, fact.value)]) ?? []);
			this.items.update([
				...details?.links.flatMap(link => {
					if (!contribution) {
						return [];
					}
					if (link.kind === 'action') {
						return [...this.actions(contribution, 'stateActions'), ...this.actions(contribution, 'generalActions')].filter(action => action.id === JSON.stringify([contribution.integrationId, link.actionId]));
					}
					const option = contribution.options.find(option => option.id === link.optionId);
					return option ? [{
						id: `option:${option.id}`, label: option.label, icon: Codicon.settingsGear,
						run: () => this.options.focus(JSON.stringify([contribution.integrationId, option.id])),
					}] : [];
				}) ?? [],
				...details?.items.map(item => ({
					id: `item:${item.id}`, label: item.label, icon: icon(item.icon), description: item.description,
					run: () => this.presentation.run(async () => {
						const resource = URI.parse(item.resource, true);
						if (['command', 'javascript', 'data'].includes(resource.scheme.toLowerCase())) {
							throw new Error(localize('artifactUnsafeLink', "This artifact link cannot be opened."));
						}
						await this.openerService.open(resource, { fromUserGesture: true, allowCommands: false });
					}),
				})) ?? [],
				...details?.completeness === 'partial' && this.details.value?.loadMore ? [{
					id: 'loadMore', label: localize('artifactLoadMore', "Load More"),
					run: () => this.presentation.run(async () => this.details.value?.loadMore?.(CancellationToken.None)),
				}] : [],
			]);
		}));
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [...this.element.querySelectorAll<HTMLElement>('a[tabindex="0"], button:not([disabled]), [role="button"][tabindex="0"]')];
	}

	start(): void {
		this.started.set(true, undefined);
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

	private actions(contribution: ArtifactContributionSnapshot, kind: 'stateActions' | 'generalActions'): IArtifactButton[] {
		return contribution.view[kind].flatMap(view => {
			const action = contribution.actions.find(action => action.id === view.id);
			return action ? [{
				id: JSON.stringify([contribution.integrationId, action.id]), label: action.label, icon: icon({ id: action.iconId }),
				enabled: view.enabled, description: view.disabledReason,
				run: () => this.presentation.run(() => this.presentation.invoke(contribution.integrationId, action.id)),
			}] : [];
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
