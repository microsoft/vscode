/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CHAT_PERMISSION_DOMAINS } from '../../../../contrib/chat/browser/aiCustomization/permissions/chatPermissionDomains.js';
import { IChatPermissionDomain } from '../../../../contrib/chat/browser/aiCustomization/permissions/chatPermissionDomainRegistry.js';
import { ChatPermissionsSectionWidget } from '../../../../contrib/chat/browser/aiCustomization/permissions/chatPermissionsSectionWidget.js';
import { IChatPermissionSnapshotService } from '../../../../contrib/chat/common/permissions/chatPermissionSnapshotService.js';
import {
	ChatPermissionDomainId,
	ChatPermissionManagedChannel,
	ChatPermissionEffect,
	ChatPermissionScope,
	ChatPermissionSnapshot,
	ChatPermissionUnavailableReason,
	IChatPermissionCeiling,
	IChatPermissionRule,
} from '../../../../contrib/chat/common/permissions/chatPermissions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

/**
 * Fixtures for the Permissions sections of the Chat Customizations editor.
 *
 * The real domain definitions are used rather than hand-written stand-ins, so a change to a
 * label, description or docs link is reflected here instead of drifting.
 */
function domain(id: ChatPermissionDomainId): IChatPermissionDomain {
	const found = CHAT_PERMISSION_DOMAINS.find(candidate => candidate.id === id);
	if (!found) {
		throw new Error(`No registered permission domain for ${id}`);
	}
	return found;
}

let nextRuleId = 0;

function rule(
	domainId: ChatPermissionDomainId,
	kind: string,
	argument: string | undefined,
	effect: ChatPermissionEffect,
	scope: ChatPermissionScope,
	extra?: { editable?: boolean; shadowedBy?: { scope: ChatPermissionScope; effect: ChatPermissionEffect } },
): IChatPermissionRule {
	return {
		id: `rule-${nextRuleId++}`,
		domain: domainId,
		kind,
		...(argument === undefined ? {} : { argument }),
		effect,
		scope,
		// Managed rules are never editable; every other layer is, once the runtime can report it.
		editable: extra?.editable ?? scope !== ChatPermissionScope.Managed,
		...(extra?.shadowedBy ? { shadowedBy: extra.shadowedBy } : {}),
	};
}

const openCeiling: IChatPermissionCeiling = { mode: 'manual', bypassRestriction: undefined, failClosed: false, allowIntersected: false };

function available(
	rules: readonly IChatPermissionRule[],
	resolvedScopes: readonly ChatPermissionScope[],
	overrides?: Partial<Pick<Extract<ChatPermissionSnapshot, { state: 'available' }>, 'ceiling' | 'failedProviders'>>,
): ChatPermissionSnapshot {
	return {
		state: 'available',
		rules,
		ceiling: overrides?.ceiling ?? openCeiling,
		resolvedScopes,
		failedProviders: overrides?.failedProviders ?? [],
	};
}

// ---- Terminal -------------------------------------------------------------

/** What ships today: only the managed layer is readable, so the rest is named as unread. */
const terminalManagedOnly = available(
	[
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'rm -rf *', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'sudo *', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'git push *', ChatPermissionEffect.Ask, ChatPermissionScope.Managed),
	],
	[ChatPermissionScope.Managed],
	{ ceiling: { ...openCeiling, bypassRestriction: 'disable' } },
);

/** The shape the UI takes once the runtime reports every layer, including a shadowed rule. */
const terminalAllScopes = available(
	[
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'rm -rf *', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'git push *', ChatPermissionEffect.Ask, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'npm run *', ChatPermissionEffect.Allow, ChatPermissionScope.Config),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'git push *', ChatPermissionEffect.Allow, ChatPermissionScope.Config, {
			shadowedBy: { scope: ChatPermissionScope.Managed, effect: ChatPermissionEffect.Ask },
		}),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'git status', ChatPermissionEffect.Allow, ChatPermissionScope.Location),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'ls', ChatPermissionEffect.Allow, ChatPermissionScope.Session),
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'echo *', ChatPermissionEffect.Allow, ChatPermissionScope.Editor),
	],
	[
		ChatPermissionScope.Managed,
		ChatPermissionScope.Config,
		ChatPermissionScope.Location,
		ChatPermissionScope.Session,
		ChatPermissionScope.Editor,
	],
	{ ceiling: { ...openCeiling, bypassRestriction: 'allowAutoOnly', allowIntersected: true } },
);

/** One provider answered and one did not: rules are shown, but flagged as incomplete. */
const terminalPartialFailure = available(
	terminalManagedOnly.state === 'available' ? terminalManagedOnly.rules : [],
	[ChatPermissionScope.Managed],
	{ failedProviders: [{ provider: 'claude', message: 'probe timed out' }] },
);

/** Read from VS Code's own channels while the agent is being asked — a stand-in, not the answer. */
const terminalProvisional: ChatPermissionSnapshot = {
	...(terminalManagedOnly as Extract<ChatPermissionSnapshot, { state: 'available' }>),
	provisional: { channels: [ChatPermissionManagedChannel.Server, ChatPermissionManagedChannel.File] },
};

/** The agent never answered, so the local reading is all there is — and must say so. */
const terminalProvisionalUnconfirmed: ChatPermissionSnapshot = {
	...(terminalManagedOnly as Extract<ChatPermissionSnapshot, { state: 'available' }>),
	provisional: {
		channels: [ChatPermissionManagedChannel.Server],
		confirmationFailed: 'Copilot runtime diagnostics exceeded 4.5 seconds',
	},
};

/** Policy could not be confirmed, so the most restrictive behavior applies. */
const terminalFailClosed = available(
	[],
	[ChatPermissionScope.Managed],
	{ ceiling: { mode: 'manual', bypassRestriction: 'disable', failClosed: true, allowIntersected: false } },
);

/** Long arguments must ellipsize rather than push the effect pill out of view. */
const terminalLongPatterns = available(
	[
		rule(ChatPermissionDomainId.Terminal, 'Shell', 'docker run --rm -it --volume /very/long/host/path:/container/path --env-file ./config/.env.production ghcr.io/example/image:latest', ChatPermissionEffect.Ask, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Terminal, 'Shell', undefined, ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
	],
	[ChatPermissionScope.Managed],
);

// ---- Files ----------------------------------------------------------------

/** Every path anchor the rule DSL understands, plus the read/write split. */
const filesAllRoots = available(
	[
		rule(ChatPermissionDomainId.Files, 'Read', '//etc/hosts', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Files, 'Read', '**/.env*', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Files, 'Write', '/src/**', ChatPermissionEffect.Allow, ChatPermissionScope.Config),
		rule(ChatPermissionDomainId.Files, 'Read', '~/Notes/**', ChatPermissionEffect.Allow, ChatPermissionScope.Config),
		rule(ChatPermissionDomainId.Files, 'Write', './build/**', ChatPermissionEffect.Ask, ChatPermissionScope.Location),
	],
	[ChatPermissionScope.Managed, ChatPermissionScope.Config, ChatPermissionScope.Location],
);

// ---- Network --------------------------------------------------------------

const networkRules = available(
	[
		rule(ChatPermissionDomainId.Network, 'Domain', '*.internal.corp', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Network, 'Domain', '*.prod.corp', ChatPermissionEffect.Ask, ChatPermissionScope.Managed),
		rule(ChatPermissionDomainId.Network, 'Domain', 'github.com/*', ChatPermissionEffect.Allow, ChatPermissionScope.Config),
	],
	[ChatPermissionScope.Managed, ChatPermissionScope.Config],
);

// ---- Non-rule states ------------------------------------------------------

const loading: ChatPermissionSnapshot = { state: 'loading' };
const failed: ChatPermissionSnapshot = { state: 'error', message: 'copilot: Copilot runtime diagnostics exceeded 4.5 seconds while querying native MDM.' };
const unavailableNotSupported: ChatPermissionSnapshot = { state: 'unavailable', reason: ChatPermissionUnavailableReason.NotSupported };
const unavailableDisabled: ChatPermissionSnapshot = { state: 'unavailable', reason: ChatPermissionUnavailableReason.AgentHostDisabled };
const unavailableNoAgentHost: ChatPermissionSnapshot = { state: 'unavailable', reason: ChatPermissionUnavailableReason.NoAgentHost };

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	// Terminal — the reference domain, covering the rule-list states.
	PermissionsTerminalManagedOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalManagedOnly),
	}),
	PermissionsTerminalAllScopes: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalAllScopes),
	}),
	PermissionsTerminalPartialFailure: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalPartialFailure),
	}),
	/** Local read shown while the agent is being asked. */
	PermissionsTerminalProvisional: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalProvisional),
	}),
	/** Local read the agent never confirmed. */
	PermissionsTerminalProvisionalUnconfirmed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalProvisionalUnconfirmed),
	}),
	/** A resolved scope with no rules — distinct from a scope that could not be read. */
	PermissionsTerminalEmptyScope: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalFailClosed),
	}),
	/** Filtering with no matches must not read as "no policy exists". */
	PermissionsTerminalNoMatches: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalManagedOnly, { initialFilter: 'kubectl' }),
	}),
	PermissionsTerminalLongPatterns: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, terminalLongPatterns),
	}),

	// The other two domains, whose arguments render differently.
	PermissionsFilesAllRoots: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Files, filesAllRoots),
	}),
	PermissionsNetwork: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Network, networkRules),
	}),

	// States that replace the rule list entirely.
	PermissionsLoading: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, loading),
	}),
	PermissionsError: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, failed),
	}),
	PermissionsUnavailableNotSupported: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, unavailableNotSupported),
	}),
	PermissionsUnavailableAgentHostDisabled: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, unavailableDisabled),
	}),
	PermissionsUnavailableNoAgentHost: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => render(ctx, ChatPermissionDomainId.Terminal, unavailableNoAgentHost),
	}),
});

function render(
	{ container, disposableStore, theme }: ComponentFixtureContext,
	domainId: ChatPermissionDomainId,
	snapshot: ChatPermissionSnapshot,
	options?: { initialFilter?: string },
): void {
	container.style.width = '760px';
	container.style.height = '520px';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IChatPermissionSnapshotService, new class extends mock<IChatPermissionSnapshotService>() {
				override readonly snapshot = constObservable(snapshot);
				override async refresh(): Promise<void> { }
			});
		},
	});

	disposableStore.add(instantiationService.createInstance(ChatPermissionsSectionWidget, container, domain(domainId), options));
}
