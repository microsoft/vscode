/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { CodexSessionConfigKey } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostCodexApprovalPolicyPicker } from '../../browser/agentHostCodexApprovalPolicyPicker.js';
import { AgentHostCodexSandboxPicker } from '../../browser/agentHostCodexSandboxPicker.js';
import { AgentHostSessionEnumPicker, IAgentHostSessionEnumPickerItem } from '../../browser/agentHostModePicker.js';

// The chip CSS lives in the sessions chat-widget media. `.action-label.warning`
// (and the sizing for the bottom-row chip lane) is defined there.
import '../../../../chat/browser/media/chatWidget.css';

const PROVIDER_ID = 'local-agent-host';
const SESSION_ID = 'local-agent-host:s1';

interface CodexConfigOptions {
	readonly sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
	readonly approvalPolicy?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
}

function makeCodexConfig(values: CodexConfigOptions): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				[CodexSessionConfigKey.SandboxMode]: {
					title: 'Sandbox',
					description: '',
					type: 'string',
					enum: ['read-only', 'workspace-write', 'danger-full-access'],
					enumLabels: ['Read-Only', 'Workspace Write', 'Full Access (Dangerous)'],
					enumDescriptions: [
						'Tool calls can read the workspace but cannot modify files.',
						'Tool calls can read and write within the workspace; network is controlled separately.',
						'Tool calls have unrestricted disk and network access.',
					],
					default: 'workspace-write',
				},
				[CodexSessionConfigKey.ApprovalPolicy]: {
					title: 'Approvals',
					description: '',
					type: 'string',
					enum: ['never', 'on-request', 'on-failure', 'untrusted'],
					enumLabels: ['No Escalations', 'Ask When Needed', 'Ask on Failure', 'Ask More Often'],
					enumDescriptions: [
						'Never ask for elevated permission; commands that cannot run in the sandbox are rejected.',
						'Ask only when Codex determines a command needs elevated permission.',
						'Try commands in the sandbox first, then ask to retry with elevated permission if the sandbox blocks them.',
						'Ask before more command categories so you can review actions more closely.',
					],
					default: 'on-request',
				},
			},
		},
		values: {
			[CodexSessionConfigKey.SandboxMode]: values.sandboxMode ?? 'workspace-write',
			[CodexSessionConfigKey.ApprovalPolicy]: values.approvalPolicy ?? 'on-request',
		},
	};
}

class FakeCodexProvider implements Pick<IAgentHostSessionsProvider,
	'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'setSessionConfigValue' | 'isSessionConfigResolving'> {
	readonly id = PROVIDER_ID;
	readonly onDidChangeSessionConfig: Event<string> = Event.None;
	constructor(private readonly _values: CodexConfigOptions) { }
	getSessionConfig(_sessionId: string): ResolveSessionConfigResult { return makeCodexConfig(this._values); }
	isSessionConfigResolving(_sessionId: string) { return constObservable(false); }
	async setSessionConfigValue(): Promise<void> { /* no-op for fixture */ }
}

interface PickerRenderOptions extends CodexConfigOptions {
	readonly showPickerOpen?: boolean;
}

function renderPicker(
	context: ComponentFixtureContext,
	options: PickerRenderOptions,
	createPicker: (instantiationService: ReturnType<typeof createEditorServices>) => AgentHostSessionEnumPicker,
): void {
	const { container, disposableStore } = context;
	const provider = new FakeCodexProvider(options);

	// Capture any action-widget invocation so the "open" variants can render
	// the popup list inline without needing the real action-widget service.
	let actionWidgetItems: IActionListItem<IAgentHostSessionEnumPickerItem>[] = [];

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.defineInstance(IActionWidgetService, new class extends mock<IActionWidgetService>() {
				override isVisible = false;
				override hide() { }
				override show<T>(_id: string, _supportsPreview: boolean, items: IActionListItem<T>[]) {
					actionWidgetItems = items as unknown as IActionListItem<IAgentHostSessionEnumPickerItem>[];
				}
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly activeSession = observableValue<IActiveSession | undefined>(
					'activeSession',
					new class extends mock<IActiveSession>() {
						override readonly providerId = PROVIDER_ID;
						override readonly sessionId = SESSION_ID;
					}(),
				);
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders(): ISessionsProvider[] { return [provider as unknown as ISessionsProvider]; }
				override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
					return id === provider.id ? provider as unknown as T : undefined;
				}
			}());
		},
	});

	// Recreate the production ancestor chain so the bottom-row chip CSS
	// rules (`.new-chat-widget-container .new-chat-bottom-container ...`)
	// apply: chip height/padding, codicon size and chevron hiding.
	// Width is set above the 330px @container threshold so labels render
	// (production session-create container is wider than this threshold).
	container.style.padding = '12px';
	container.style.width = '440px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	const widgetContainer = dom.append(container, dom.$('.new-chat-widget-container'));
	const bottomContainer = dom.append(widgetContainer, dom.$('.new-chat-bottom-container'));
	bottomContainer.style.display = 'flex';
	bottomContainer.style.alignItems = 'center';
	bottomContainer.style.gap = '4px';
	const chipHost = dom.append(bottomContainer, dom.$('div'));
	chipHost.style.display = 'flex';
	chipHost.style.alignItems = 'center';

	const picker = disposableStore.add(createPicker(instantiationService));
	picker.render(chipHost);

	if (options.showPickerOpen) {
		// Trigger the picker to populate `actionWidgetItems`, then render a
		// minimal inline preview so the fixture screenshot captures the
		// option list as it would appear in the real action widget.
		chipHost.querySelector<HTMLElement>('a.action-label')?.click();
		if (actionWidgetItems.length > 0) {
			renderOptionListPreview(container, actionWidgetItems);
		}
	}
}

function renderOptionListPreview(
	container: HTMLElement,
	items: readonly IActionListItem<IAgentHostSessionEnumPickerItem>[],
): void {
	const list = dom.append(container, dom.$('div.codex-picker-option-list-preview'));
	list.style.marginTop = '8px';
	list.style.padding = '4px';
	list.style.background = 'var(--vscode-menu-background, var(--vscode-editorWidget-background))';
	list.style.color = 'var(--vscode-menu-foreground, var(--vscode-editorWidget-foreground))';
	list.style.border = '1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border))';
	list.style.borderRadius = '4px';
	list.style.fontSize = '12px';
	list.style.minWidth = '240px';
	for (const item of items) {
		if (!item.label) {
			continue;
		}
		const row = dom.append(list, dom.$('div'));
		row.style.padding = '4px 8px';
		row.style.display = 'flex';
		row.style.flexDirection = 'column';
		row.style.gap = '2px';
		const title = dom.append(row, dom.$('span'));
		title.textContent = item.label;
		if (item.description) {
			const desc = dom.append(row, dom.$('span'));
			desc.textContent = typeof item.description === 'string' ? item.description : item.description.value;
			desc.style.opacity = '0.7';
			desc.style.fontSize = '11px';
		}
	}
}

const sandboxRender = (sandboxMode: CodexConfigOptions['sandboxMode'], showPickerOpen = false) =>
	(ctx: ComponentFixtureContext) => renderPicker(
		ctx,
		{ sandboxMode, showPickerOpen },
		(instantiationService) => instantiationService.createInstance(AgentHostCodexSandboxPicker),
	);

const approvalRender = (approvalPolicy: CodexConfigOptions['approvalPolicy'], showPickerOpen = false) =>
	(ctx: ComponentFixtureContext) => renderPicker(
		ctx,
		{ approvalPolicy, showPickerOpen },
		(instantiationService) => instantiationService.createInstance(AgentHostCodexApprovalPolicyPicker),
	);

export default defineThemedFixtureGroup({ path: 'sessions/agentHost/codexChips/' }, {
	SandboxReadOnly: defineComponentFixture({ render: sandboxRender('read-only') }),
	SandboxWorkspaceWrite: defineComponentFixture({ render: sandboxRender('workspace-write') }),
	SandboxDangerFullAccess: defineComponentFixture({ render: sandboxRender('danger-full-access') }),
	SandboxPickerOpenFromWorkspaceWrite: defineComponentFixture({ render: sandboxRender('workspace-write', true) }),

	ApprovalNoEscalations: defineComponentFixture({ render: approvalRender('never') }),
	ApprovalAskWhenNeeded: defineComponentFixture({ render: approvalRender('on-request') }),
	ApprovalAskOnFailure: defineComponentFixture({ render: approvalRender('on-failure') }),
	ApprovalAskMoreOften: defineComponentFixture({ render: approvalRender('untrusted') }),
	ApprovalPickerOpenFromOnRequest: defineComponentFixture({ render: approvalRender('on-request', true) }),
});
