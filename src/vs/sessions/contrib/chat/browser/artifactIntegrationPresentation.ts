/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/artifactIntegrations.css';
import { $, append, isAncestorOfActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ArtifactActionView, ArtifactContributionSnapshot, ArtifactRun, ArtifactSnapshot, getArtifactActionAvailability, IArtifactModel, isArtifactOptionEnabled } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { getArtifactThemeIcon as icon, renderArtifactIcon } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatPillActionViewItem, IChatPill, IChatPillEntry } from '../../../../workbench/browser/chatPills.js';
import { ArtifactButtons, IArtifactButton } from './artifactButtons.js';
import { ArtifactDetailsSelection, ArtifactDetailsViewState, IArtifactActionViewData } from './artifactDetailsView.js';

export interface IArtifactDetailsHost {
	readonly id: string;
	readonly selected: IObservable<ArtifactIntegrationPresentation | undefined>;
	toggle(presentation: ArtifactIntegrationPresentation, target: HTMLElement, section?: ArtifactDetailsSelection): void;
	release(presentation: ArtifactIntegrationPresentation): void;
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
		@IInstantiationService instantiationService: IInstantiationService,
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
		this.action = this._register(new Action(`artifactIntegration.${model.snapshot.get().artifact.id}`, model.snapshot.get().artifact.label, undefined, true,
			async target => {
				if (!isHTMLElement(target)) {
					throw new Error(localize('artifactDetailsTargetUnavailable', "The artifact details button is no longer available."));
				}
				detailsHost.toggle(this, target);
			}));
		this.inlinePill = {
			action: this.action,
			createActionViewItem: options => instantiationService.createInstance(ArtifactIntegrationPill, this, this.action, options),
		};
		this._register(toDisposable(() => detailsHost.release(this)));
	}

	decorate(entry: IChatPillEntry, reader: IReader): IChatPillEntry {
		this.entry = entry;
		const snapshot = this.snapshot.read(reader);
		if (snapshot.contributions.length === 0) {
			return entry;
		}
		const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main;
		return {
			...entry, label: main?.label ?? entry.label, icon: main ? icon(main.icon) : entry.icon,
			inlinePill: this.inlinePill, hover: undefined,
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

	authenticationButton(contribution: ArtifactContributionSnapshot): IArtifactActionViewData | undefined {
		if (!contribution.authentication) {
			return undefined;
		}
		return {
			id: JSON.stringify([contribution.integrationId, 'authentication', 'request']),
			label: localize('artifactSignIn', "Sign In"), icon: Codicon.signIn,
			enabled: contribution.authentication.enabled,
			description: contribution.authentication.disabledReason ?? (contribution.view.availability.kind === 'authenticationRequired' ? contribution.view.availability.reason : undefined),
			run: () => this.run(async () => { await this.model.requestAuthentication(contribution.integrationId); }),
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
	private sections: ArtifactButtons | undefined;

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		action: Action,
		options: IActionViewItemOptions,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action, options);
	}

	protected override get itemModifierClass(): string { return 'artifact-integration-pill'; }
	protected override get buttonModifierClass(): string { return 'chat-dropdown-pill-button'; }

	protected override renderContent(): void {
		this.sections = this._register(new ArtifactButtons(append(this.element!, $('.chat-pill-sections.artifact-pill-sections')), this.hoverService, 'pill'));
		this._register(this.hoverService.setupDelayedHover(this.button!.element, () => ({
			content: this.mainDescription(),
		})));
		this._register(autorun(reader => {
			const snapshot = this.presentation.snapshot.read(reader);
			const host = this.presentation.detailsHost;
			const selected = host.selected.read(reader) === this.presentation;
			this.updateLabel();
			this.updateAriaLabel();
			this.element!.classList.toggle('artifact-pill-selected', selected);
			this.button!.element.setAttribute('aria-haspopup', 'dialog');
			this.button!.element.setAttribute('aria-expanded', String(selected));
			this.button!.element.setAttribute('aria-controls', host.id);
			this.button!.element.dataset.artifactDetailsOwner = host.id;
			const sections: IArtifactButton[] = snapshot.contributions.flatMap(contribution => contribution.view.sections.map(section => ({
				id: JSON.stringify([contribution.integrationId, section.id]), label: section.label, icon: icon(section.icon),
				description: section.description,
				ariaLabel: localize('artifactSectionDetails', "Show details: {0}", section.description ?? section.label),
				expanded: selected, controls: host.id,
				run: target => host.toggle(this.presentation, target, [contribution.integrationId, section.detailsId]),
			})));
			for (const contribution of snapshot.contributions) {
				const authentication = this.presentation.authenticationButton(contribution);
				if (authentication) {
					sections.push({
						...authentication, enabled: true, expanded: selected, controls: host.id,
						run: target => host.toggle(this.presentation, target, [contribution.integrationId]),
					});
				}
			}
			const enabledAutomations = snapshot.contributions.reduce((count, contribution) =>
				count + contribution.options.filter(option => isArtifactOptionEnabled(option, contribution.configuration.values[option.id])).length, 0);
			if (enabledAutomations) {
				sections.push({
					id: 'artifact-automations', label: String(enabledAutomations), icon: Codicon.robot,
					description: enabledAutomations === 1
						? localize('artifactAutomationEnabled', "1 Autopilot rule enabled")
						: localize('artifactAutomationsEnabled', "{0} Autopilot rules enabled", enabledAutomations),
					ariaLabel: localize('artifactShowAutomations', "Show Autopilot: {0} enabled", enabledAutomations),
					expanded: selected, controls: host.id,
					run: () => host.toggle(this.presentation, this.button!.element, 'autopilot'),
				});
			}
			this.sections!.update(sections);
			this.element!.classList.toggle('chat-pill-segmented', sections.length > 0);
		}));
	}

	protected override onDidClickButton(): void {
		void this.actionRunner.run(this._action, this.button!.element);
	}

	protected override hasOpenDropdown(): boolean {
		return this.presentation.detailsHost.selected.get() === this.presentation;
	}

	protected override getLabelText(): string {
		const snapshot = this.presentation.snapshot.get();
		return snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main?.label
			?? this.presentation.baseEntry?.label ?? snapshot.artifact.label;
	}

	protected override getIconElement(): HTMLElement | undefined {
		const snapshot = this.presentation.snapshot.get();
		const main = snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main;
		return renderArtifactIcon(main ? icon(main.icon) : this.presentation.baseEntry?.icon ?? Codicon.link, 'chat-pill-icon');
	}

	private mainDescription(): string {
		const snapshot = this.presentation.snapshot.get();
		return snapshot.contributions.find(contribution => contribution.integrationId === snapshot.mainIntegrationId)?.view.main?.description ?? this.getLabelText();
	}

	protected override getAriaLabel(): string {
		return localize('artifactShowDetails', "Show artifact details: {0}", this.mainDescription());
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
