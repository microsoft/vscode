/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Presentation model for the effective agent permission state.
 *
 * The Copilot runtime is the single authority for permission decisions: it owns the rule DSL, the
 * matcher, and the precedence between managed policy, configured rules, location grants and
 * session grants. Everything in this file exists to *render* the provenance the runtime reports —
 * no type here may be used to decide whether an operation is permitted, and nothing in this
 * directory re-implements the runtime's matching.
 */

/** The verdict a rule contributes for a matching operation. */
export const enum ChatPermissionEffect {
	/** The operation proceeds without prompting. */
	Allow = 'allow',
	/** The operation requires human approval. */
	Ask = 'ask',
	/** The operation is blocked outright. */
	Deny = 'deny',
}

/**
 * Where a rule comes from, ordered from most to least authoritative. The order mirrors the
 * runtime's own layering (`PermissionInner`), with {@link ChatPermissionScope.Editor} appended for
 * VS Code's host-side auto-approve settings, which the runtime consults last and which are skipped
 * entirely when managed policy already requires an approval.
 */
export const enum ChatPermissionScope {
	/** Enterprise managed policy — device MDM, the GitHub server, or an SDK-injected layer. */
	Managed = 'managed',
	/** Rules configured by the user and supplied to the runtime when a session starts. */
	Config = 'config',
	/** Grants persisted for a project location. */
	Location = 'location',
	/** Grants that live only for the current session. */
	Session = 'session',
	/** VS Code's own auto-approve settings, the lowest layer in the stack. */
	Editor = 'editor',
}

/** Scopes in descending authority, for grouping and for explaining what shadows what. */
export const CHAT_PERMISSION_SCOPE_ORDER: readonly ChatPermissionScope[] = [
	ChatPermissionScope.Managed,
	ChatPermissionScope.Config,
	ChatPermissionScope.Location,
	ChatPermissionScope.Session,
	ChatPermissionScope.Editor,
];

/**
 * The permission areas the runtime's rule DSL can express. These are exactly the rule families
 * `parse_managed_rule` accepts — `Shell`/`Bash`/`PowerShell`, `Read`, `Edit`/`Write` and `Domain`.
 * Other agent capabilities (MCP servers, built-in tools) are governed by different contracts and
 * deliberately have no domain here until one exists.
 */
export const enum ChatPermissionDomainId {
	Terminal = 'permissions.terminal',
	Files = 'permissions.files',
	Network = 'permissions.network',
}

/** A rule as displayed: what it matches, what it does, and who declared it. */
export interface IChatPermissionRule {
	/** Stable identity for list diffing; unique within a snapshot. */
	readonly id: string;
	readonly domain: ChatPermissionDomainId;
	/** The rule family as authored, e.g. `Shell`, `Read`, `Domain`. */
	readonly kind: string;
	/** The matched argument, absent for family-wide rules such as a bare `Read`. */
	readonly argument?: string;
	readonly effect: ChatPermissionEffect;
	readonly scope: ChatPermissionScope;
	/**
	 * Set when a higher-authority scope declares a rule for the same pattern, so this one cannot
	 * take effect. Reported by the source of truth rather than computed here.
	 */
	readonly shadowedBy?: {
		readonly scope: ChatPermissionScope;
		readonly effect: ChatPermissionEffect;
	};
	/** Whether this layer can be edited from this client. Managed rules are never editable. */
	readonly editable: boolean;
}

/**
 * Session-wide escalation state that sits above individual rules. A capped ceiling overrides every
 * allow rule, so it is surfaced as a banner rather than as a row.
 */
export interface IChatPermissionCeiling {
	/** Blanket approval mode currently in force. */
	readonly mode: 'manual' | 'assisted' | 'allowAll';
	/**
	 * Whether enterprise policy blocks bypass-permissions escalation. `disable` blocks every
	 * escalation including advisory auto-approval; `allowAutoOnly` still permits the assisted mode.
	 */
	readonly bypassRestriction?: 'disable' | 'allowAutoOnly';
	/** Whether managed policy could not be determined and the restrictive fallback is in force. */
	readonly failClosed: boolean;
	/**
	 * Whether two or more managed sources supplied allowlists. The runtime then intersects them and
	 * omits the resolved allow list, so an absent allow group must not be read as "nothing allowed".
	 */
	readonly allowIntersected: boolean;
}

/** Why an effective permission view could not be produced. */
export const enum ChatPermissionUnavailableReason {
	/** No agent host in this window (for example, VS Code for the Web). */
	NoAgentHost = 'noAgentHost',
	/** The agent host is present but disabled. */
	AgentHostDisabled = 'agentHostDisabled',
	/** The connected runtime does not expose the effective-permissions projection. */
	NotSupported = 'notSupported',
}

/**
 * The effective permission state, or an explanation of why it is not known.
 *
 * `unavailable` is a distinct state on purpose: rendering an empty rule list when the runtime was
 * never consulted would assert "nothing governs this agent", which is the opposite of the truth in
 * a fail-closed enterprise deployment.
 */
export type ChatPermissionSnapshot =
	| { readonly state: 'loading' }
	| { readonly state: 'unavailable'; readonly reason: ChatPermissionUnavailableReason }
	| { readonly state: 'error'; readonly message: string }
	| {
		readonly state: 'available';
		readonly rules: readonly IChatPermissionRule[];
		readonly ceiling: IChatPermissionCeiling;
		/** Scopes the source could actually resolve; others are omitted rather than shown empty. */
		readonly resolvedScopes: readonly ChatPermissionScope[];
		/**
		 * Providers that failed to report, when at least one other succeeded. Their rules are
		 * missing from {@link rules}, so this must be surfaced rather than silently dropped — a
		 * partial list that looks complete is the failure mode this whole model exists to avoid.
		 */
		readonly failedProviders: readonly IChatPermissionProviderFailure[];
		/**
		 * Set when these rules were read from VS Code's own managed-settings channels rather than
		 * reported by the agent. The agent remains authoritative — it runs its own resolution and
		 * composes layers this client cannot see — so a provisional snapshot is a fast stand-in
		 * that must be labelled as unconfirmed and replaced once the agent answers.
		 */
		readonly provisional?: IChatPermissionProvisionalInfo;
	};

/** Why a snapshot is provisional, and what it was able to read. */
export interface IChatPermissionProvisionalInfo {
	/** Managed-settings channels the local read covered. */
	readonly channels: readonly ChatPermissionManagedChannel[];
	/** Set once the agent has been asked and failed, so the stand-in is all there is. */
	readonly confirmationFailed?: string;
}

/** A managed-settings delivery channel VS Code can read directly. */
export const enum ChatPermissionManagedChannel {
	Server = 'server',
	File = 'file',
}

/** A provider that could not report its managed permissions. */
export interface IChatPermissionProviderFailure {
	readonly provider: string;
	readonly message: string;
}

/** Rules for `domain`, ordered by descending scope authority. */
export function filterRulesForDomain(rules: readonly IChatPermissionRule[], domain: ChatPermissionDomainId): IChatPermissionRule[] {
	return rules
		.filter(rule => rule.domain === domain)
		.sort((a, b) => CHAT_PERMISSION_SCOPE_ORDER.indexOf(a.scope) - CHAT_PERMISSION_SCOPE_ORDER.indexOf(b.scope));
}
