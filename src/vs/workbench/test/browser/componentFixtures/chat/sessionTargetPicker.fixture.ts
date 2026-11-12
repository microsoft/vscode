/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ActionListItemKind, ActionListWidget, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { AgentSessionProviders, getAgentSessionProviderDescription, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../../../../contrib/chat/browser/agentSessions/agentSessions.js';
import { SessionTypeAvailability } from '../../../../contrib/chat/browser/agentSessions/sessionTypeAvailability.js';
import { createSessionTypePickerAction } from '../../../../contrib/chat/browser/widget/input/sessionTargetPickerActionItem.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../../platform/actionWidget/browser/actionWidget.css';

function renderPicker(context: ComponentFixtureContext, localDisabled: boolean): void {
	const { container, disposableStore, theme } = context;
	const instantiation = createEditorServices(disposableStore, { colorTheme: theme });
	const items: IActionListItem<IActionWidgetDropdownAction>[] = [AgentSessionProviders.AgentHostCopilot, AgentSessionProviders.Local].map(type => {
		const action = createSessionTypePickerAction(
			{ id: type, label: type, tooltip: '', class: undefined, enabled: true, run: async () => { } },
			{
				type, label: getAgentSessionProviderName(type),
				hoverDescription: getAgentSessionProviderDescription(type),
				commandId: `open.${type}`,
			},
			AgentSessionProviders.AgentHostCopilot,
			type === AgentSessionProviders.Local && localDisabled ? SessionTypeAvailability.DisabledByPolicy : SessionTypeAvailability.Available,
			true, { label: 'Agent Types', order: 1 }, undefined, getAgentSessionProviderIcon(type), () => { },
		);
		return {
			item: action, kind: ActionListItemKind.Action, label: action.label,
			group: { title: '', icon: action.icon }, disabled: !action.enabled,
			description: action.description, ariaDescription: action.ariaDescription, hover: action.hover,
		};
	});
	const widget = disposableStore.add(instantiation.createInstance(
		ActionListWidget<IActionWidgetDropdownAction>, 'SessionTargetPickerFixture', false, items,
		{ onHide: () => { }, onSelect: () => { } }, undefined,
		{ reserveSubmenuSpace: false, hideDefaultKeybindingTooltip: true },
	));
	container.style.width = '400px';
	container.style.padding = '8px';
	const wrapper = dom.append(container, dom.$('.action-widget'));
	wrapper.appendChild(widget.domNode);
	widget.layout(48, 400);
}

export default defineThemedFixtureGroup({ path: 'chat/input/sessionTargetPicker' }, {
	LocalDisabledByPolicy: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderPicker(context, true),
	}),
	LocalAvailable: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderPicker(context, false),
	}),
});
