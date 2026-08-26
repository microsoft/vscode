/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPermissions.css';
import * as DOM from '../../../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { formatPermissionRuleText } from '../../../common/permissions/chatPermissionRuleSyntax.js';
import {
	CHAT_PERMISSION_SCOPE_ORDER,
	ChatPermissionEffect,
	ChatPermissionManagedChannel,
	ChatPermissionScope,
	ChatPermissionSnapshot,
	ChatPermissionUnavailableReason,
	IChatPermissionCeiling,
	IChatPermissionProviderFailure,
	IChatPermissionProvisionalInfo,
	IChatPermissionRule,
	filterRulesForDomain,
} from '../../../common/permissions/chatPermissions.js';
import { IChatPermissionSnapshotService } from '../../../common/permissions/chatPermissionSnapshotService.js';
import { IChatPermissionDomain } from './chatPermissionDomainRegistry.js';

const $ = DOM.$;

/** Presentation for one scope group header. */
interface IScopePresentation {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
}

function scopePresentation(scope: ChatPermissionScope): IScopePresentation {
	switch (scope) {
		case ChatPermissionScope.Managed:
			return {
				label: localize('chatPermissions.scope.managed', "Managed"),
				icon: Codicon.lock,
				description: localize('chatPermissions.scope.managedDescription', "Set by your organization and cannot be changed here."),
			};
		case ChatPermissionScope.Config:
			return {
				label: localize('chatPermissions.scope.config', "Configured"),
				icon: Codicon.settingsGear,
				description: localize('chatPermissions.scope.configDescription', "Rules from your Copilot configuration."),
			};
		case ChatPermissionScope.Location:
			return {
				label: localize('chatPermissions.scope.location', "Project"),
				icon: Codicon.folderActive,
				description: localize('chatPermissions.scope.locationDescription', "Approvals saved for this project location."),
			};
		case ChatPermissionScope.Session:
			return {
				label: localize('chatPermissions.scope.session', "Session"),
				icon: Codicon.history,
				description: localize('chatPermissions.scope.sessionDescription', "Approvals that last only for the current session."),
			};
		case ChatPermissionScope.Editor:
			return {
				label: localize('chatPermissions.scope.editor', "Editor"),
				icon: Codicon.vscode,
				description: localize('chatPermissions.scope.editorDescription', "Auto-approve settings from VS Code, applied only to requests the agent asks about."),
			};
	}
}

function effectLabel(effect: ChatPermissionEffect): string {
	switch (effect) {
		case ChatPermissionEffect.Allow: return localize('chatPermissions.effect.allow', "Allow");
		case ChatPermissionEffect.Ask: return localize('chatPermissions.effect.ask', "Ask");
		case ChatPermissionEffect.Deny: return localize('chatPermissions.effect.deny', "Deny");
	}
}

function effectIcon(effect: ChatPermissionEffect): ThemeIcon {
	switch (effect) {
		case ChatPermissionEffect.Allow: return Codicon.passFilled;
		case ChatPermissionEffect.Ask: return Codicon.question;
		case ChatPermissionEffect.Deny: return Codicon.circleSlash;
	}
}

/** Optional initial state, so a filtered view can be rendered directly rather than typed into. */
export interface IChatPermissionsSectionOptions {
	readonly initialFilter?: string;
}

/**
 * Renders one permission domain: the ceiling banner, the rules grouped by the scope that declared
 * them, and the layers the source could not read.
 *
 * The chrome deliberately mirrors the customization sections — same title/description/learn-more
 * header, same search row, same collapsible group headers — so both sidebar groups read as one
 * editor. What differs is what a row *is*: a permission rule is a read-only statement of what the
 * runtime enforces, not something the user authors here, so there is no create button and
 * uneditable rows carry a lock.
 *
 * The widget is generic — it knows nothing about terminals, files or URLs. A domain contributes
 * only labels, and every rule comes from {@link IChatPermissionSnapshotService}, so this widget
 * never decides what is permitted.
 */
export class ChatPermissionsSectionWidget extends Disposable {

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly container: HTMLElement;
	private readonly listContainer: HTMLElement;
	private readonly filterInput: InputBox;
	private filterText: string;
	/** Scopes the user has collapsed. View-only state; deliberately not persisted. */
	private readonly collapsedScopes = new Set<ChatPermissionScope>();

	constructor(
		parent: HTMLElement,
		private readonly domain: IChatPermissionDomain,
		options: IChatPermissionsSectionOptions | undefined,
		@IChatPermissionSnapshotService private readonly snapshotService: IChatPermissionSnapshotService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();

		this.filterText = options?.initialFilter?.trim().toLowerCase() ?? '';
		this.container = DOM.append(parent, $('.chat-permissions-section'));
		this.createTitleHeader();
		this.filterInput = this.createSearchRow();
		this.listContainer = DOM.append(this.container, $('.chat-permissions-list'));
		this.listContainer.setAttribute('role', 'list');

		this._register(autorun(reader => this.render(this.snapshotService.snapshot.read(reader))));

		// Opening the section is the moment the user expects current data, and the service has no
		// way to observe policy changing underneath it. Skip when a probe is already running so
		// first-open does not immediately re-issue the one the service just started.
		if (this.snapshotService.snapshot.get().state !== 'loading') {
			void this.snapshotService.refresh();
		}
	}

	layout(): void {
		this.container.classList.toggle('narrow', this.container.clientWidth < 560);
	}

	focus(): void {
		this.filterInput.focus();
	}

	/** Title, description and inline "Learn more", matching the customization sections. */
	private createTitleHeader(): void {
		const header = DOM.append(this.container, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		DOM.append(titleRow, $('h2.section-title')).textContent = this.domain.label;

		const description = DOM.append(header, $('p.section-title-description'));
		DOM.append(description, $('span.section-title-description-text')).textContent = this.domain.description;

		const learnMoreUrl = this.domain.learnMoreUrl;
		if (learnMoreUrl) {
			// A real whitespace node rather than a margin, so the gap collapses when the link wraps.
			description.appendChild(document.createTextNode(' '));
			const link = DOM.append(description, $('a.section-title-link')) as HTMLAnchorElement;
			link.textContent = this.domain.learnMoreLabel ?? localize('chatPermissions.learnMore', "Learn more");
			link.href = learnMoreUrl;
			this._register(DOM.addDisposableListener(link, 'click', e => {
				e.preventDefault();
				this.openerService.open(URI.parse(learnMoreUrl));
			}));
		}
	}

	private createSearchRow(): InputBox {
		const searchRow = DOM.append(this.container, $('.list-search-and-button-container'));
		const searchContainer = DOM.append(searchRow, $('.list-search-container'));
		// Registered on the widget, not on `renderDisposables`: that store is cleared on every
		// render, which would dispose the input the user is typing into.
		const input = this._register(new InputBox(searchContainer, this.contextViewService, {
			placeholder: localize('chatPermissions.searchPlaceholder', "Type to search..."),
			ariaLabel: this.domain.filterAriaLabel,
			inputBoxStyles: defaultInputBoxStyles,
		}));
		if (this.filterText) {
			input.value = this.filterText;
		}
		this._register(input.onDidChange(value => {
			this.filterText = value.trim().toLowerCase();
			this.render(this.snapshotService.snapshot.get());
		}));

		// The customization sections put their primary action here. Permissions are read-only, so
		// the equivalent action is re-reading them: resolution is a slow probe that does not
		// observe policy changes, so without this the view can only go stale.
		const buttonContainer = DOM.append(searchRow, $('.list-add-button-container'));
		const refreshButton = this._register(new Button(buttonContainer, {
			...defaultButtonStyles,
			supportIcons: true,
			title: localize('chatPermissions.refreshTooltip', "Re-read the effective permissions from the agent"),
		}));
		refreshButton.element.classList.add('list-add-button');
		refreshButton.label = `$(${Codicon.refresh.id}) ${localize('chatPermissions.refresh', "Refresh")}`;
		this._register(refreshButton.onDidClick(() => this.snapshotService.refresh()));

		return input;
	}

	private render(snapshot: ChatPermissionSnapshot): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.listContainer);

		switch (snapshot.state) {
			case 'loading':
				this.renderEmptyState(
					localize('chatPermissions.loading', "Resolving effective permissions\u2026"),
					localize('chatPermissions.loadingDetail', "Reading the rules the agent enforces."),
				);
				return;
			case 'unavailable':
				this.renderEmptyState(unavailableTitle(snapshot.reason), unavailableDetail(snapshot.reason));
				return;
			case 'error':
				this.renderEmptyState(
					localize('chatPermissions.errorTitle', "Permissions could not be read"),
					snapshot.message,
				);
				return;
		}

		this.renderCeiling(snapshot.ceiling);
		this.renderProvisional(snapshot.provisional);
		this.renderFailedProviders(snapshot.failedProviders);

		const rules = filterRulesForDomain(snapshot.rules, this.domain.id).filter(rule => this.matchesFilter(rule));
		let isFirstGroup = true;
		for (const scope of CHAT_PERMISSION_SCOPE_ORDER) {
			if (!snapshot.resolvedScopes.includes(scope)) {
				continue;
			}
			this.renderScopeGroup(scope, rules.filter(rule => rule.scope === scope), isFirstGroup);
			isFirstGroup = false;
		}

		// Layers the source could not consult are called out rather than omitted, so an empty
		// section is never mistaken for "nothing governs this".
		const unresolved = CHAT_PERMISSION_SCOPE_ORDER.filter(scope => !snapshot.resolvedScopes.includes(scope));
		if (unresolved.length > 0) {
			this.renderStatus(localize(
				'chatPermissions.unresolvedScopes',
				"Only the layers above could be read. These are not shown and may still apply: {0}.",
				unresolved.map(scope => scopePresentation(scope).label).join(', '),
			));
		}
	}

	private matchesFilter(rule: IChatPermissionRule): boolean {
		if (!this.filterText) {
			return true;
		}
		return formatPermissionRuleText(rule.kind, rule.argument).toLowerCase().includes(this.filterText);
	}

	private renderCeiling(ceiling: IChatPermissionCeiling): void {
		const messages: string[] = [];
		if (ceiling.failClosed) {
			messages.push(localize('chatPermissions.ceiling.failClosed', "Enterprise policy could not be confirmed, so the most restrictive behavior is in force."));
		}
		if (ceiling.bypassRestriction === 'disable') {
			messages.push(localize('chatPermissions.ceiling.bypassDisabled', "Your organization blocks approving all requests at once."));
		} else if (ceiling.bypassRestriction === 'allowAutoOnly') {
			messages.push(localize('chatPermissions.ceiling.bypassAutoOnly', "Your organization allows assisted approval, but not approving all requests at once."));
		}
		if (ceiling.allowIntersected) {
			messages.push(localize('chatPermissions.ceiling.allowIntersected', "More than one managed source supplies an allow list, so only requests every source allows are permitted. The combined list is not shown."));
		}
		if (messages.length === 0) {
			return;
		}

		const banner = DOM.append(this.listContainer, $('.chat-permissions-banner'));
		DOM.append(banner, $('span.chat-permissions-banner-icon')).classList.add(...ThemeIcon.asClassNameArray(Codicon.lock));
		DOM.append(banner, $('span.chat-permissions-banner-text')).textContent = messages.join(' ');
	}

	/**
	 * Marks rules that VS Code read from the managed-settings documents itself, before the agent
	 * has confirmed them. The agent composes layers this client cannot see, so an unconfirmed
	 * reading must never be presented as the effective policy.
	 */
	private renderProvisional(provisional: IChatPermissionProvisionalInfo | undefined): void {
		if (!provisional) {
			return;
		}
		const channels = provisional.channels.map(channel => channel === ChatPermissionManagedChannel.Server
			? localize('chatPermissions.channel.server', "your organization")
			: localize('chatPermissions.channel.file', "a policy file on this device"));

		const banner = DOM.append(this.listContainer, $('.chat-permissions-banner'));
		const isFailed = !!provisional.confirmationFailed;
		banner.classList.toggle('is-warning', isFailed);
		DOM.append(banner, $('span.chat-permissions-banner-icon')).classList.add(
			...ThemeIcon.asClassNameArray(isFailed ? Codicon.warning : Codicon.info));
		DOM.append(banner, $('span.chat-permissions-banner-text')).textContent = isFailed
			? localize(
				'chatPermissions.provisional.unconfirmed',
				"Showing the policy delivered by {0}. The agent could not confirm what it enforces ({1}), so this may not be complete.",
				channels.join(' and '),
				provisional.confirmationFailed,
			)
			: localize(
				'chatPermissions.provisional.checking',
				"Showing the policy delivered by {0}. Confirming with the agent\u2026",
				channels.join(' and '),
			);
	}

	/**
	 * Warns that a provider could not report. Its rules are missing from the list below, so
	 * staying silent would present a partial policy as if it were the whole one.
	 */
	private renderFailedProviders(failures: readonly IChatPermissionProviderFailure[]): void {
		if (failures.length === 0) {
			return;
		}
		const banner = DOM.append(this.listContainer, $('.chat-permissions-banner.is-warning'));
		DOM.append(banner, $('span.chat-permissions-banner-icon')).classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
		DOM.append(banner, $('span.chat-permissions-banner-text')).textContent = localize(
			'chatPermissions.failedProviders',
			"Some rules may be missing. These agents could not report their permissions: {0}.",
			failures.map(failure => `${failure.provider} (${failure.message})`).join(', '),
		);
	}

	/**
	 * Renders a collapsible scope group using the shared customization group-header markup, so a
	 * permission group and a customization group are visually the same control.
	 */
	private renderScopeGroup(scope: ChatPermissionScope, rules: readonly IChatPermissionRule[], isFirst: boolean): void {
		const presentation = scopePresentation(scope);
		const collapsed = this.collapsedScopes.has(scope);

		const header = DOM.append(this.listContainer, $('.ai-customization-group-header'));
		header.classList.toggle('collapsed', collapsed);
		header.classList.toggle('has-previous-group', !isFirst);
		header.tabIndex = 0;
		header.setAttribute('role', 'button');
		header.setAttribute('aria-expanded', String(!collapsed));
		header.setAttribute('aria-label', localize('chatPermissions.groupAriaLabel', "{0}, {1} rules", presentation.label, rules.length));

		DOM.append(header, $('.group-chevron')).classList.add(...ThemeIcon.asClassNameArray(collapsed ? Codicon.chevronRight : Codicon.chevronDown));
		const labelGroup = DOM.append(header, $('.group-label-group'));
		DOM.append(labelGroup, $('.group-label')).textContent = presentation.label;
		DOM.append(header, $('.group-count')).textContent = String(rules.length);
		const info = DOM.append(header, $('.group-info'));
		info.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
		this.renderDisposables.add(this.hoverService.setupDelayedHover(info, () => ({
			content: presentation.description,
			appearance: { compact: true, skipFadeInAnimation: true },
		})));

		const toggle = () => {
			if (this.collapsedScopes.has(scope)) {
				this.collapsedScopes.delete(scope);
			} else {
				this.collapsedScopes.add(scope);
			}
			this.render(this.snapshotService.snapshot.get());
		};
		this.renderDisposables.add(DOM.addDisposableListener(header, 'click', toggle));
		this.renderDisposables.add(DOM.addDisposableListener(header, 'keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		}));

		if (collapsed) {
			return;
		}
		if (rules.length === 0) {
			// While filtering, an empty group means "nothing matched", not "no policy exists".
			// Saying the wrong one here would imply the scope is unrestricted.
			DOM.append(this.listContainer, $('.chat-permissions-empty-group')).textContent = this.filterText
				? localize('chatPermissions.noMatchingRulesInScope', "No matching rules.")
				: localize('chatPermissions.noRulesInScope', "No rules.");
			return;
		}
		for (const rule of rules) {
			this.renderRule(rule);
		}
	}

	private renderRule(rule: IChatPermissionRule): void {
		const row = DOM.append(this.listContainer, $('.chat-permissions-rule'));
		row.classList.toggle('shadowed', !!rule.shadowedBy);

		const pattern = DOM.append(row, $('.chat-permissions-rule-pattern'));
		if (!rule.editable) {
			DOM.append(pattern, $('span.chat-permissions-rule-lock')).classList.add(...ThemeIcon.asClassNameArray(Codicon.lock));
		}
		DOM.append(pattern, $('span.chat-permissions-rule-kind')).textContent = rule.kind;
		if (rule.argument === undefined) {
			// A family-wide rule matches every request in its family. Naming that keeps the row
			// from looking like a rule whose pattern failed to render.
			DOM.append(pattern, $('span.chat-permissions-rule-all')).textContent = this.domain.allRequestsLabel;
		} else {
			DOM.append(pattern, $('span.chat-permissions-rule-argument')).textContent = rule.argument;
		}

		if (rule.shadowedBy) {
			// Name the layer that wins, with its icon, so the row explains why it has no effect.
			const winner = scopePresentation(rule.shadowedBy.scope);
			const override = DOM.append(pattern, $('span.chat-permissions-rule-override'));
			DOM.append(override, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowRight));
			DOM.append(override, $('span')).classList.add(...ThemeIcon.asClassNameArray(winner.icon));
			DOM.append(override, $('span')).textContent = localize(
				'chatPermissions.shadowedBy',
				"{0} {1}",
				winner.label,
				effectLabel(rule.shadowedBy.effect),
			);
		}

		const effect = DOM.append(row, $('.chat-permissions-rule-effect'));
		effect.classList.add(`chat-permissions-effect-${rule.effect}`);
		DOM.append(effect, $('span')).classList.add(...ThemeIcon.asClassNameArray(effectIcon(rule.effect)));
		DOM.append(effect, $('span')).textContent = effectLabel(rule.effect);

		row.setAttribute('role', 'listitem');
		row.setAttribute('aria-label', this.ruleAriaLabel(rule));
		this.renderDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'),
			row,
			this.ruleTooltip(rule),
		));
	}

	/**
	 * The canonical rule text, plus the domain's plain-language reading when it has one. The
	 * canonical form stays first because it is what an administrator actually authored.
	 */
	private ruleTooltip(rule: IChatPermissionRule): string {
		const canonical = formatPermissionRuleText(rule.kind, rule.argument);
		const described = rule.argument === undefined ? undefined : this.domain.describeArgument?.(rule.argument);
		return described ? `${canonical} — ${described}` : canonical;
	}

	private ruleAriaLabel(rule: IChatPermissionRule): string {
		// Prefer the domain's plain-language reading, so a screen reader is not left to interpret
		// path anchors such as `//` versus `/`.
		const described = rule.argument === undefined
			? this.domain.allRequestsLabel
			: this.domain.describeArgument?.(rule.argument) ?? formatPermissionRuleText(rule.kind, rule.argument);
		const base = localize(
			'chatPermissions.ruleAriaLabel',
			"{0}, {1}, from {2}",
			described,
			effectLabel(rule.effect),
			scopePresentation(rule.scope).label,
		);
		if (!rule.shadowedBy) {
			return base;
		}
		return localize(
			'chatPermissions.ruleAriaLabelShadowed',
			"{0}, overridden by a {1} rule that is set to {2}",
			base,
			scopePresentation(rule.shadowedBy.scope).label,
			effectLabel(rule.shadowedBy.effect),
		);
	}

	/** Centered title + detail, matching the customization sections' empty state. */
	private renderEmptyState(title: string, detail: string): void {
		const empty = DOM.append(this.listContainer, $('.list-empty-state'));
		DOM.append(empty, $('.empty-state-text')).textContent = title;
		DOM.append(empty, $('.empty-state-subtext')).textContent = detail;
	}

	private renderStatus(message: string): void {
		DOM.append(this.listContainer, $('.chat-permissions-status')).textContent = message;
	}
}

function unavailableTitle(reason: ChatPermissionUnavailableReason): string {
	switch (reason) {
		case ChatPermissionUnavailableReason.NoAgentHost:
			return localize('chatPermissions.unavailable.noAgentHostTitle', "Permissions are not available here");
		case ChatPermissionUnavailableReason.AgentHostDisabled:
			return localize('chatPermissions.unavailable.agentHostDisabledTitle', "The agent host is disabled");
		case ChatPermissionUnavailableReason.NotSupported:
			return localize('chatPermissions.unavailable.notSupportedTitle', "Permissions cannot be read yet");
	}
}

function unavailableDetail(reason: ChatPermissionUnavailableReason): string {
	switch (reason) {
		case ChatPermissionUnavailableReason.NoAgentHost:
			return localize('chatPermissions.unavailable.noAgentHost', "This window cannot reach an agent, so the rules that govern it cannot be shown.");
		case ChatPermissionUnavailableReason.AgentHostDisabled:
			return localize('chatPermissions.unavailable.agentHostDisabled', "Enable the agent host to see the rules that govern the agent.");
		case ChatPermissionUnavailableReason.NotSupported:
			return localize('chatPermissions.unavailable.notSupported', "The connected agent does not report its effective permissions yet. Rules may still be enforced.");
	}
}
