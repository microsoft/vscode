/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPermissions.css';
import * as DOM from '../../../../../../base/browser/dom.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Link } from '../../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { formatPermissionRuleText } from '../../../common/permissions/chatPermissionRuleSyntax.js';
import {
	CHAT_PERMISSION_SCOPE_ORDER,
	ChatPermissionEffect,
	ChatPermissionScope,
	ChatPermissionSnapshot,
	ChatPermissionUnavailableReason,
	IChatPermissionCeiling,
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

/**
 * Renders one permission domain: the ceiling banner, the rules grouped by the scope that declared
 * them, and a footer explaining the domain.
 *
 * The widget is deliberately generic — it knows nothing about terminals, files or URLs. A domain
 * contributes only labels, and every rule comes from {@link IChatPermissionSnapshotService}, so
 * this widget never decides what is permitted.
 */
export class ChatPermissionsSectionWidget extends Disposable {

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly container: HTMLElement;
	private readonly listContainer: HTMLElement;
	private filterText = '';
	private filterInput: InputBox | undefined;

	constructor(
		parent: HTMLElement,
		private readonly domain: IChatPermissionDomain,
		@IChatPermissionSnapshotService private readonly snapshotService: IChatPermissionSnapshotService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();

		this.container = DOM.append(parent, $('.chat-permissions-section'));
		this.createHeader();
		this.listContainer = DOM.append(this.container, $('.chat-permissions-list'));
		this.listContainer.setAttribute('role', 'list');
		this.createFooter();

		this._register(autorun(reader => this.render(this.snapshotService.snapshot.read(reader))));
	}

	layout(): void {
		this.container.classList.toggle('narrow', this.container.clientWidth < 560);
	}

	focus(): void {
		this.filterInput?.focus();
	}

	private createHeader(): void {
		const header = DOM.append(this.container, $('.chat-permissions-header'));

		const title = DOM.append(header, $('.chat-permissions-title'));
		DOM.append(title, $('span')).classList.add(...ThemeIcon.asClassNameArray(this.domain.icon));
		DOM.append(title, $('h2.chat-permissions-title-label')).textContent = this.domain.label;

		const filterContainer = DOM.append(header, $('.chat-permissions-filter'));
		// Registered on the widget, not on `renderDisposables`: that store is cleared on every
		// render, which would dispose the input the user is typing into.
		this.filterInput = this._register(new InputBox(filterContainer, undefined, {
			placeholder: this.domain.filterPlaceholder,
			ariaLabel: this.domain.filterPlaceholder,
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.filterInput.onDidChange(value => {
			this.filterText = value.trim().toLowerCase();
			this.render(this.snapshotService.snapshot.get());
		}));
	}

	private createFooter(): void {
		const footer = DOM.append(this.container, $('.chat-permissions-footer'));
		DOM.append(footer, $('span.chat-permissions-footer-text')).textContent = this.domain.description;
		if (this.domain.learnMoreUrl) {
			this._register(this.instantiationService.createInstance(
				Link,
				footer,
				{ label: localize('chatPermissions.learnMore', "Learn more"), href: this.domain.learnMoreUrl },
				{ opener: href => this.openerService.open(href) },
			));
		}
	}

	private render(snapshot: ChatPermissionSnapshot): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.listContainer);

		switch (snapshot.state) {
			case 'loading':
				this.renderStatus(localize('chatPermissions.loading', "Resolving effective permissions\u2026"));
				return;
			case 'unavailable':
				this.renderStatus(unavailableMessage(snapshot.reason));
				return;
			case 'error':
				this.renderStatus(localize('chatPermissions.error', "Effective permissions could not be resolved: {0}", snapshot.message));
				return;
		}

		this.renderCeiling(snapshot.ceiling);

		const rules = filterRulesForDomain(snapshot.rules, this.domain.id).filter(rule => this.matchesFilter(rule));
		for (const scope of CHAT_PERMISSION_SCOPE_ORDER) {
			if (!snapshot.resolvedScopes.includes(scope)) {
				continue;
			}
			this.renderScopeGroup(scope, rules.filter(rule => rule.scope === scope));
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

	private renderScopeGroup(scope: ChatPermissionScope, rules: readonly IChatPermissionRule[]): void {
		const presentation = scopePresentation(scope);

		const header = DOM.append(this.listContainer, $('.chat-permissions-scope-header'));
		DOM.append(header, $('span.chat-permissions-scope-icon')).classList.add(...ThemeIcon.asClassNameArray(presentation.icon));
		DOM.append(header, $('span.chat-permissions-scope-label')).textContent = presentation.label;
		DOM.append(header, $('span.chat-permissions-scope-count')).textContent = String(rules.length);
		this.renderDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), header, presentation.description));

		if (rules.length === 0) {
			DOM.append(this.listContainer, $('.chat-permissions-empty-group')).textContent =
				localize('chatPermissions.noRulesInScope', "No rules.");
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
		DOM.append(pattern, $('span.chat-permissions-rule-argument')).textContent = rule.argument ?? '';

		if (rule.shadowedBy) {
			const override = DOM.append(pattern, $('span.chat-permissions-rule-override'));
			DOM.append(override, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowRight));
			DOM.append(override, $('span')).textContent = localize(
				'chatPermissions.shadowedBy',
				"{0} {1}",
				scopePresentation(rule.shadowedBy.scope).label,
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
			formatPermissionRuleText(rule.kind, rule.argument),
		));
	}

	private ruleAriaLabel(rule: IChatPermissionRule): string {
		const base = localize(
			'chatPermissions.ruleAriaLabel',
			"{0}, {1}, from {2}",
			formatPermissionRuleText(rule.kind, rule.argument),
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

	private renderStatus(message: string): void {
		DOM.append(this.listContainer, $('.chat-permissions-status')).textContent = message;
	}
}

function unavailableMessage(reason: ChatPermissionUnavailableReason): string {
	switch (reason) {
		case ChatPermissionUnavailableReason.NoAgentHost:
			return localize('chatPermissions.unavailable.noAgentHost', "Effective permissions are not available in this window.");
		case ChatPermissionUnavailableReason.AgentHostDisabled:
			return localize('chatPermissions.unavailable.agentHostDisabled', "The agent host is disabled, so effective permissions cannot be read.");
		case ChatPermissionUnavailableReason.NotSupported:
			return localize('chatPermissions.unavailable.notSupported', "The connected agent does not report effective permissions yet.");
	}
}
