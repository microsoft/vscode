/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/artifactIntegrations.css';
import { $, append, isAncestorOfActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { HoverStyle, IDelayedHoverOptions, isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { Action, toAction } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ArtifactActionView, ArtifactContributionSnapshot, ArtifactJsonValue, ArtifactRun, ArtifactSnapshot, getArtifactActionAvailability, getArtifactMainContribution, IArtifactModel, isArtifactOptionEnabled } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { getArtifactThemeIcon as icon, renderArtifactIcon } from '../../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ChatPillActionViewItem, getChatPillEntryHoverOptions, IChatInlinePillViewItemOptions, IChatPill, IChatPillAction, IChatPillEntry } from '../../../../browser/chatPills.js';
import { ArtifactButtons, IArtifactButton } from './artifactButtons.js';
import { ArtifactDetailsSelection, ArtifactDetailsViewState, IArtifactActionViewData } from './artifactDetailsView.js';

export interface IArtifactDetailsHost {
	readonly id: string;
	readonly selected: IObservable<ArtifactIntegrationPresentation | undefined>;
	/** The ID of the selected artifact's pill section that shows its details, if a section showed them. */
	readonly activeSection: IObservable<string | undefined>;
	/**
	 * Shows an artifact's details, or hides them when activating what already shows them: the artifact without a
	 * section, or its active section. Another section of the shown artifact keeps them open and becomes active.
	 * @param target The control that shows the details, which receives focus back when they close. Defaults to the
	 * focused element, such as a dropdown's pill after the dropdown closes.
	 * @param selection The list, action or Autopilot to focus in the details.
	 * @param sectionId The pill section that shows the details, which becomes the active section.
	 */
	toggle(presentation: ArtifactIntegrationPresentation, target?: HTMLElement, selection?: ArtifactDetailsSelection, sectionId?: string): void;
	release(presentation: ArtifactIntegrationPresentation): void;
	/**
	 * Hides the details while another overlay that shares their context view, such as a group dropdown, takes their
	 * place. They keep their artifact and active section, so activating that section again closes them. Disposing the
	 * result closes the hidden details unless they were shown again.
	 */
	suspend(): IDisposable;
}

/** The number of Autopilot rules enabled across an artifact's integrations. */
export function countEnabledArtifactAutomations(snapshot: ArtifactSnapshot): number {
	return snapshot.contributions.reduce((count, contribution) =>
		count + contribution.options.filter(option => isArtifactOptionEnabled(option, contribution.configuration.values[option.id])).length, 0);
}

/** Opens an artifact's resource from a list where activating the artifact opens its details instead. */
export function createArtifactOpenAction(entry: IChatPillEntry): IChatPillAction {
	return toAction({
		id: `artifactIntegration.open.${entry.id}`,
		label: entry.ariaLabel ?? localize('artifactOpen', "Open {0}", entry.label),
		class: ThemeIcon.asClassName(Codicon.linkExternal),
		run: () => entry.open(),
	});
}

/** The accessible name of an artifact's main part, which opens its resource. */
export function getArtifactOpenAriaLabel(label: string): string {
	return localize('artifactOpenMain', "Open {0}", label);
}

/**
 * The status sections an artifact shows beside its main part, which opens its resource: each integration section, a
 * Sign In section while authentication is required, and the number of enabled Autopilot rules. Activating one opens
 * the artifact's details on the matching list, action or Autopilot. Without any, a Details section toggles the
 * artifact's details, so they stay reachable. Only the active section, which shows the details, is expanded.
 */
export function getArtifactStatusButtons(presentation: ArtifactIntegrationPresentation, snapshot: ArtifactSnapshot, activeSection: string | undefined, open: (target: HTMLElement, selection: ArtifactDetailsSelection | undefined, sectionId: string) => void): IArtifactButton[] {
	const controls = presentation.detailsHost.id;
	const toggle = (id: string, selection: ArtifactDetailsSelection | undefined) => ({
		id, expanded: id === activeSection, controls,
		run: (target: HTMLElement) => open(target, selection, id),
	});
	const buttons: IArtifactButton[] = snapshot.contributions.flatMap(contribution => contribution.view.sections.map(section => ({
		label: section.label, icon: icon(section.icon),
		description: section.description,
		ariaLabel: localize('artifactSectionDetails', "Show details: {0}", section.description ?? section.label),
		...toggle(JSON.stringify([contribution.integrationId, section.id]), [contribution.integrationId, section.detailsId]),
	})));
	for (const contribution of snapshot.contributions) {
		const authentication = presentation.authenticationButton(contribution);
		if (authentication) {
			buttons.push({ ...authentication, enabled: true, ...toggle(authentication.id, [contribution.integrationId]) });
		}
	}
	const enabledAutomations = countEnabledArtifactAutomations(snapshot);
	if (enabledAutomations) {
		buttons.push({
			label: String(enabledAutomations), icon: Codicon.robot,
			description: enabledAutomations === 1
				? localize('artifactAutomationEnabled', "1 Autopilot rule enabled")
				: localize('artifactAutomationsEnabled', "{0} Autopilot rules enabled", enabledAutomations),
			ariaLabel: localize('artifactShowAutomations', "Show Autopilot: {0} enabled", enabledAutomations),
			...toggle('artifact-automations', 'autopilot'),
		});
	}
	if (buttons.length === 0) {
		const main = getArtifactMainContribution(snapshot)?.view.main;
		buttons.push({
			label: localize('artifactDetails', "Details"), icon: Codicon.info, iconOnly: true,
			description: localize('artifactDetailsDescription', "Show Details"),
			ariaLabel: localize('artifactShowDetails', "Show artifact details: {0}", main?.description ?? main?.label ?? snapshot.artifact.label),
			...toggle('artifact-details', undefined),
		});
	}
	return buttons;
}

export class ArtifactIntegrationPresentation extends Disposable {
	readonly inlinePill: IChatPill;
	readonly viewState = new ArtifactDetailsViewState();
	private entry: IChatPillEntry | undefined;
	private readonly action: Action;
	readonly snapshot: IObservable<ArtifactSnapshot>;

	constructor(
		readonly model: IArtifactModel,
		private readonly invokingChat: (reader?: IReader) => string | undefined,
		readonly detailsHost: IArtifactDetailsHost,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notifications: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
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
		this.action = this._register(new Action(`artifactIntegration.${model.snapshot.get().artifact.id}`, model.snapshot.get().artifact.label, undefined, true, async () => this.open()));
		this.inlinePill = this.createPill(constObservable(undefined));
		this._register(toDisposable(() => detailsHost.release(this)));
	}

	/**
	 * A pill for this artifact, with a trailing action button such as Unpin. The surface placing the pill owns that
	 * action, so pills with different trailing actions can show the same artifact.
	 */
	createPill(trailingAction: IObservable<IChatPillAction | undefined>): IChatPill {
		return {
			action: this.action,
			createActionViewItem: options => this.instantiationService.createInstance(ArtifactIntegrationPill, this, this.action, trailingAction, options),
		};
	}

	/**
	 * Lists this artifact in the dropdown of the pill for its kind, such as Artifacts, with its main part's icon and
	 * label. Selecting the entry opens the artifact's details, and its first row action opens the resource; as the
	 * pill's only entry, it renders as this artifact's own pill. Entries that identify their resource with a badge,
	 * such as pull requests and issues, keep their own label beside it.
	 */
	decorate<T extends IChatPillEntry>(entry: T, reader: IReader): T {
		this.entry = entry;
		const snapshot = this.snapshot.read(reader);
		if (snapshot.contributions.length === 0) {
			return entry;
		}
		const main = getArtifactMainContribution(snapshot)?.view.main;
		const label = entry.badge || !main ? entry.label : main.label;
		return {
			...entry, label, icon: main ? icon(main.icon) : entry.icon,
			// A resource renders its file icon in place of the integration's; the base entry keeps it to open the resource.
			...(main ? { resource: undefined } : {}),
			dropdownAriaLabel: localize('artifactShowDetails', "Show artifact details: {0}", main?.description ?? label),
			toolbarActions: [createArtifactOpenAction(entry), ...entry.toolbarActions ?? []],
			inlinePill: this.inlinePill, hover: undefined,
			open: () => this.detailsHost.toggle(this),
		};
	}

	get baseEntry(): IChatPillEntry | undefined {
		return this.entry;
	}

	/**
	 * Opens the artifact's resource through its undecorated entry, which records the open; before an entry is known,
	 * opens the recorded resource directly.
	 */
	open(): void {
		const entry = this.entry;
		if (entry) {
			entry.open();
			return;
		}
		const resource = this.model.snapshot.get().artifact.resource;
		void this.run(async () => {
			await this.openerService.open(resource, { openExternal: true, allowContributedOpeners: true, fromUserGesture: true });
		});
	}

	/** `input` is passed to the action, for example the details item it runs for. */
	async invoke(integrationId: string, actionId: string, input?: ArtifactJsonValue): Promise<ArtifactRun> {
		const chat = this.invokingChat();
		if (!chat) {
			throw new Error(localize('artifactInvokingChatUnavailable', "The chat that invoked this artifact action is no longer available."));
		}
		const run = await this.model.invoke(integrationId, actionId, chat, generateUuid(), undefined, input);
		status(localize('artifactActionRequested', "Artifact action requested: {0}", run.reason));
		return run;
	}

	authenticationButton(contribution: ArtifactContributionSnapshot): IArtifactActionViewData | undefined {
		if (!contribution.authentication) {
			return undefined;
		}
		const availability = contribution.view.availability;
		// Signing in again would not grant what the page grants the current credential, such as single sign-on access.
		const authorizationUrl = availability.kind === 'authenticationRequired' ? availability.authorizationUrl : undefined;
		return {
			id: JSON.stringify([contribution.integrationId, 'authentication', 'request']),
			label: localize('artifactSignIn', "Sign In"), icon: Codicon.signIn,
			enabled: contribution.authentication.enabled,
			description: contribution.authentication.disabledReason ?? (availability.kind === 'authenticationRequired' ? availability.reason : undefined),
			run: () => this.run(async () => {
				if (authorizationUrl) {
					await this.openerService.open(authorizationUrl, { openExternal: true });
				} else {
					await this.model.requestAuthentication(contribution.integrationId);
				}
			}),
		};
	}

	async run(operation: () => Promise<void>): Promise<void> {
		try {
			await operation();
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notifications.error(localize('artifactOperationFailed', "The artifact operation failed: {0}", toErrorMessage(error)));
			}
		}
	}
}

class ArtifactIntegrationPill extends ChatPillActionViewItem {
	private readonly hoverLifecycleOptions = { groupId: generateUuid() };
	/** Identifies the rich hover, whose element content has no identity of its own, so moving within the main part keeps it. */
	private readonly richHoverId = generateUuid();
	private sections: ArtifactButtons | undefined;

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		action: Action,
		private readonly trailingAction: IObservable<IChatPillAction | undefined>,
		private readonly inlineOptions: IChatInlinePillViewItemOptions,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action, inlineOptions);
	}

	protected override get itemModifierClass(): string { return 'artifact-integration-pill'; }
	protected override get buttonModifierClass(): string { return 'chat-dropdown-pill-button'; }

	protected override renderContent(): void {
		this.sections = this._register(new ArtifactButtons(append(this.element!, $('.chat-pill-sections.artifact-pill-sections')), this.hoverService, 'pill', this.hoverLifecycleOptions));
		this._register(this.hoverService.setupDelayedHover(this.button!.element, () => this.richHoverOptions() ?? {
			content: this.mainDescription(),
			style: HoverStyle.Pointer,
		}, this.hoverLifecycleOptions));
		this._register(autorun(reader => {
			const snapshot = this.presentation.snapshot.read(reader);
			const host = this.presentation.detailsHost;
			const selected = host.selected.read(reader) === this.presentation;
			this.updateLabel();
			this.updateAriaLabel();
			const description = this.mainDescription();
			if (description !== this.getLabelText()) {
				this.button!.element.setAttribute('aria-description', description);
			} else {
				this.button!.element.removeAttribute('aria-description');
			}
			this.element!.classList.toggle('artifact-pill-selected', selected);
			// Autopilot and Details can disappear while the details they opened are shown, so those return focus to the main part.
			const sections = getArtifactStatusButtons(this.presentation, snapshot, selected ? host.activeSection.read(reader) : undefined, (target, selection, sectionId) =>
				host.toggle(this.presentation, selection === 'autopilot' || selection === undefined ? this.button!.element : target, selection, sectionId));
			this.sections!.update(sections);
			this.element!.classList.toggle('chat-pill-segmented', sections.length > 0);
			// Its own surface's trailing action, else that of the pill showing it as a lone entry, such as a pinned entry's Unpin.
			const trailing = this.trailingAction.read(reader);
			this.updatePromotedAction(trailing ?? this.inlineOptions.promotedAction?.read(reader), trailing ? Codicon.unpin : this.inlineOptions.promotedActionIcon, this.hoverService);
		}));
	}

	protected override getLabelText(): string {
		const snapshot = this.presentation.snapshot.get();
		return getArtifactMainContribution(snapshot)?.view.main?.label ?? this.presentation.baseEntry?.label ?? snapshot.artifact.label;
	}

	protected override getIconElement(): HTMLElement | undefined {
		const main = getArtifactMainContribution(this.presentation.snapshot.get())?.view.main;
		return renderArtifactIcon(main ? icon(main.icon) : this.presentation.baseEntry?.icon ?? Codicon.link, 'chat-pill-icon');
	}

	private mainDescription(): string {
		return getArtifactMainContribution(this.presentation.snapshot.get())?.view.main?.description ?? this.getLabelText();
	}

	/**
	 * The rich hover of the entry the pill shows, such as a pull request's card, which the main part shows in place of
	 * the integration's description. Like the other pills' rich hovers, its footer leaves out the entry's promoted action.
	 */
	private richHoverOptions(): IDelayedHoverOptions | undefined {
		const entry = this.presentation.baseEntry;
		const hover = entry?.pillHover;
		const content = isManagedHoverTooltipHTMLElement(hover) ? hover.element(CancellationToken.None) : hover;
		if (!entry || !isHTMLElement(content)) {
			return undefined;
		}
		return {
			...getChatPillEntryHoverOptions({ ...entry, promotedAction: undefined }),
			id: this.richHoverId,
			content,
			...(isManagedHoverTooltipHTMLElement(hover) && hover.contentOwnsPadding ? { additionalClasses: ['managed-hover-content-owns-padding'] } : {}),
			appearance: { showPointer: true },
		};
	}

	protected override getAriaLabel(): string {
		return getArtifactOpenAriaLabel(this.getLabelText());
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
