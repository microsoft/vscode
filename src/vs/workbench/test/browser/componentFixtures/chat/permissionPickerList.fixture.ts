/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, ActionListWidget, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

interface PermissionPickerListFixtureOptions {
	/** Whether the inline "Sandboxing for terminal" toggle is shown on the Default option. */
	readonly showSandboxToggle?: boolean;
	/** Whether the inline toggle renders in the on (checked) state. */
	readonly sandboxingEnabled?: boolean;
}

function buildItems(options: PermissionPickerListFixtureOptions): IActionListItem<IActionWidgetDropdownAction>[] {
	const showToggle = !!options.showSandboxToggle;
	const sandboxOn = !!options.sandboxingEnabled;

	const makeItem = (action: IActionWidgetDropdownAction): IActionListItem<IActionWidgetDropdownAction> => ({
		item: action,
		tooltip: action.tooltip,
		detail: action.detail,
		hover: action.hover,
		toolbarActions: action.toolbarActions,
		inlineToggle: action.inlineToggle,
		className: action.className,
		kind: ActionListItemKind.Action,
		canPreview: false,
		group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
		disabled: !action.enabled,
		hideIcon: false,
		label: action.label,
	});

	const actionTemplate = { class: undefined, enabled: true, tooltip: '', run: async () => { } } as const;

	const items: IActionListItem<IActionWidgetDropdownAction>[] = [
		makeItem({
			...actionTemplate,
			id: 'chat.permissions.default',
			label: localize('permissions.default', "Default Approvals"),
			detail: localize('permissions.default.subtext', "Asks when approval settings don't apply"),
			icon: ThemeIcon.fromId(Codicon.shield.id),
			checked: true,
			inlineToggle: showToggle ? {
				label: localize('permissions.default.sandbox.toggle', "Sandboxing for terminal"),
				checked: sandboxOn,
				onChange: () => { },
			} : undefined,
		}),
		makeItem({
			...actionTemplate,
			id: 'chat.permissions.autoApprove',
			label: localize('permissions.autoApprove', "Bypass Approvals"),
			detail: localize('permissions.autoApprove.subtext', "Runs tool calls without asking"),
			icon: ThemeIcon.fromId(Codicon.warning.id),
			checked: false,
		}),
		makeItem({
			...actionTemplate,
			id: 'chat.permissions.autopilot',
			label: localize('permissions.autopilot', "Autopilot (Preview)"),
			detail: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
			icon: ThemeIcon.fromId(Codicon.rocket.id),
			checked: false,
		}),
		{
			label: '',
			kind: ActionListItemKind.Separator,
			canPreview: false,
			disabled: false,
			hideIcon: false,
		},
		makeItem({
			...actionTemplate,
			id: 'chat.permissions.learnMore',
			label: localize('permissions.learnMore', "Learn more about permissions"),
			icon: ThemeIcon.fromId(Codicon.blank.id),
			checked: false,
		}),
	];
	return items;
}

function renderPermissionPickerList(context: ComponentFixtureContext, options: PermissionPickerListFixtureOptions = {}): void {
	const { container, disposableStore } = context;
	const instantiationService = createEditorServices(disposableStore, { colorTheme: context.theme });

	const items = buildItems(options);
	const delegate: IActionListDelegate<IActionWidgetDropdownAction> = {
		onHide: () => { },
		onSelect: () => { },
	};

	const widget = disposableStore.add(instantiationService.createInstance(
		ActionListWidget<IActionWidgetDropdownAction>,
		'PermissionPickerListFixture',
		false,
		items,
		delegate,
		undefined,
		{ minWidth: 255, detailItemHeight: 44, inlineToggleItemHeight: 70, reserveSubmenuSpace: false, hideDefaultKeybindingTooltip: true },
	));

	container.classList.add('monaco-workbench');
	container.style.width = '320px';
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';

	// Render inside an .action-widget wrapper so the popup-scoped CSS applies.
	const wrapper = document.createElement('div');
	wrapper.classList.add('action-widget');
	wrapper.appendChild(widget.domNode);
	container.appendChild(wrapper);

	// Item heights: Default = 70 with inline toggle (inlineToggleItemHeight), else 44 (detail).
	// Bypass + Autopilot with detail = 44 each. Separator = 8. Learn more = 24.
	const defaultItemHeight = options.showSandboxToggle ? 70 : 44;
	const actionHeight = defaultItemHeight + 44 * 2 + 24;
	const totalHeight = actionHeight + 8;
	widget.layout(totalHeight, 320);
}

export default defineThemedFixtureGroup({ path: 'chat/input/permissionPickerList' }, {
	Default: defineComponentFixture({ render: context => renderPermissionPickerList(context) }),
	SandboxToggleOff: defineComponentFixture({ render: context => renderPermissionPickerList(context, { showSandboxToggle: true }) }),
	SandboxToggleOn: defineComponentFixture({ render: context => renderPermissionPickerList(context, { showSandboxToggle: true, sandboxingEnabled: true }) }),
});
