/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { localize } from '../../../../../nls.js';
import { ChatPermissionsSectionWidget } from '../../../../contrib/chat/browser/aiCustomization/permissions/chatPermissionsSectionWidget.js';
import { IChatPermissionDomain } from '../../../../contrib/chat/browser/aiCustomization/permissions/chatPermissionDomainRegistry.js';
import { IChatPermissionSnapshotService } from '../../../../contrib/chat/common/permissions/chatPermissionSnapshotService.js';
import {
	ChatPermissionDomainId,
	ChatPermissionEffect,
	ChatPermissionScope,
	ChatPermissionSnapshot,
	ChatPermissionUnavailableReason,
} from '../../../../contrib/chat/common/permissions/chatPermissions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

const terminalDomain: IChatPermissionDomain = {
	id: ChatPermissionDomainId.Terminal,
	label: localize('fixture.terminal', "Terminal"),
	icon: Codicon.terminal,
	description: localize('fixture.terminalDescription', "Controls which terminal commands the agent may run, and which need your approval first."),
	filterAriaLabel: localize('fixture.terminalFilter', "Search terminal rules"),
	learnMoreLabel: localize('fixture.learnMore', "Learn more about agent permissions"),
	learnMoreUrl: 'https://code.visualstudio.com/docs/agents/run/security',
};

function rule(id: string, kind: string, argument: string, effect: ChatPermissionEffect, scope: ChatPermissionScope, extra?: Partial<{ editable: boolean; shadowedBy: { scope: ChatPermissionScope; effect: ChatPermissionEffect } }>) {
	return {
		id,
		domain: ChatPermissionDomainId.Terminal,
		kind,
		argument,
		effect,
		scope,
		editable: extra?.editable ?? false,
		...(extra?.shadowedBy ? { shadowedBy: extra.shadowedBy } : {}),
	};
}

const managedOnly: ChatPermissionSnapshot = {
	state: 'available',
	rules: [
		rule('1', 'Shell', 'rm -rf *', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule('2', 'Shell', 'sudo *', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule('3', 'Shell', 'git push *', ChatPermissionEffect.Ask, ChatPermissionScope.Managed),
	],
	ceiling: { mode: 'manual', bypassRestriction: 'disable', failClosed: false, allowIntersected: false },
	resolvedScopes: [ChatPermissionScope.Managed],
	failedProviders: [],
};

/** The shape the UI takes once the runtime can report every layer, including a shadowed rule. */
const allScopes: ChatPermissionSnapshot = {
	state: 'available',
	rules: [
		rule('1', 'Shell', 'rm -rf *', ChatPermissionEffect.Deny, ChatPermissionScope.Managed),
		rule('2', 'Shell', 'git push *', ChatPermissionEffect.Ask, ChatPermissionScope.Managed),
		rule('3', 'Shell', 'npm run *', ChatPermissionEffect.Allow, ChatPermissionScope.Config, { editable: true }),
		rule('4', 'Shell', 'git push *', ChatPermissionEffect.Allow, ChatPermissionScope.Config, {
			editable: true,
			shadowedBy: { scope: ChatPermissionScope.Managed, effect: ChatPermissionEffect.Ask },
		}),
		rule('5', 'Shell', 'git status', ChatPermissionEffect.Allow, ChatPermissionScope.Location, { editable: true }),
		rule('6', 'Shell', 'ls', ChatPermissionEffect.Allow, ChatPermissionScope.Session, { editable: true }),
	],
	ceiling: { mode: 'manual', bypassRestriction: 'allowAutoOnly', failClosed: false, allowIntersected: true },
	resolvedScopes: [
		ChatPermissionScope.Managed,
		ChatPermissionScope.Config,
		ChatPermissionScope.Location,
		ChatPermissionScope.Session,
	],
	failedProviders: [],
};

const partialFailure: ChatPermissionSnapshot = {
	...managedOnly,
	failedProviders: [{ provider: 'claude', message: 'probe timed out' }],
};

const unavailable: ChatPermissionSnapshot = {
	state: 'unavailable',
	reason: ChatPermissionUnavailableReason.NotSupported,
};

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	PermissionsSectionManagedOnly: defineComponentFixture({ render: ctx => render(ctx, managedOnly) }),
	PermissionsSectionAllScopes: defineComponentFixture({ render: ctx => render(ctx, allScopes) }),
	PermissionsSectionPartialFailure: defineComponentFixture({ render: ctx => render(ctx, partialFailure) }),
	PermissionsSectionUnavailable: defineComponentFixture({ render: ctx => render(ctx, unavailable) }),
});

function render({ container, disposableStore, theme }: ComponentFixtureContext, snapshot: ChatPermissionSnapshot): void {
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

	disposableStore.add(instantiationService.createInstance(ChatPermissionsSectionWidget, container, terminalDomain));
}
