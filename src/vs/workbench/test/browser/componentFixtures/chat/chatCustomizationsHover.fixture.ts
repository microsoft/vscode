/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { HoverWidget } from '../../../../../platform/hover/browser/hoverWidget.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { IAgentHostCustomizationService } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { ChatCustomizationsHover } from '../../../../contrib/chat/browser/aiCustomization/chatCustomizationsHover.js';
import { AgentHostMcpServer } from '../../../../contrib/chat/browser/aiCustomization/mcpServerCount.js';
import { IAICustomizationWorkspaceService } from '../../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../../contrib/chat/common/customizationHarnessService.js';
import { CustomizationMigrationType, ICustomizationMigrationHint, ICustomizationMigrationService } from '../../../../contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { IMcpService } from '../../../../contrib/mcp/common/mcpTypes.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

interface IHoverState {
	readonly migrationCount?: number;
	readonly authRequiredCount?: number;
	readonly serverNames?: readonly string[];
}

const sessionResource = URI.parse('agent-host-copilotcli:/fixture-session');
const descriptor: IHarnessDescriptor = { id: sessionResource.scheme, label: 'Copilot', icon: Codicon.copilot };
const sectionCounts: Record<ItemsModelSection, number> = { agents: 4, skills: 77, instructions: 41, prompts: 0, hooks: 2 };
const serverNames = ['GitHub', 'Figma', 'Azure DevOps', 'Documentation', 'PostgreSQL', 'Workspace Tools'];

async function renderHover({ container, disposableStore, theme }: ComponentFixtureContext, state: IHoverState = {}): Promise<void> {
	const servers = (state.serverNames ?? serverNames).map((name, index) => new class extends mock<AgentHostMcpServer>() {
		override readonly id = `fixture/server-${index}`;
		override readonly name = name;
		override readonly enabled = true;
		override readonly status = index < (state.authRequiredCount ?? 0) ? McpServerStatus.AuthRequired : McpServerStatus.Ready;
	}());
	const migration: ICustomizationMigrationHint | undefined = state.migrationCount ? {
		migrationFlowId: 'fixture-migration',
		message: 'Customizations need migration.',
		counts: [{ type: CustomizationMigrationType.UserData, count: state.migrationCount }],
	} : undefined;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registry => {
			registerWorkbenchServices(registry);
			registry.define(IMarkdownRendererService, MarkdownRendererService);
			registry.defineInstance(IAICustomizationItemsModel, new class extends mock<IAICustomizationItemsModel>() {
				override async whenSectionLoaded(): Promise<void> { }
				override getPluginCount() { return constObservable(4); }
				override getCount(section: ItemsModelSection) { return constObservable(sectionCounts[section]); }
			});
			registry.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeSessionResource = constObservable(sessionResource);
				override getActiveDescriptor() { return descriptor; }
			});
			registry.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly activeProjectRoot = constObservable(URI.file('/workspace/project'));
				override readonly activeProjectLabel = constObservable('project');
			});
			registry.defineInstance(IMcpService, new class extends mock<IMcpService>() {
				override readonly servers = constObservable([]);
			});
			registry.defineInstance(IAgentHostCustomizationService, new class extends mock<IAgentHostCustomizationService>() {
				override getMcpServers() { return servers; }
			});
			registry.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override getAllWidgets() { return []; }
			});
			registry.defineInstance(ICustomizationMigrationService, new class extends mock<ICustomizationMigrationService>() {
				override async computeMigrationHint() { return migration; }
			});
		},
	});

	container.style.width = 'fit-content';
	container.style.padding = '20px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';

	const content = await instantiationService.createInstance(ChatCustomizationsHover).getContent(CancellationToken.None);
	if (!content) {
		throw new Error('The session customizations hover fixture did not finish discovery.');
	}
	const hover = disposableStore.add(instantiationService.createInstance(HoverWidget, {
		content,
		target: container,
		additionalClasses: ['chat-customizations-hover'],
		appearance: { compact: true, skipFadeInAnimation: true },
	}));
	hover.domNode.style.position = 'relative';
	hover.domNode.style.display = 'inline-block';
	container.appendChild(hover.domNode);
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Default: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: [
			'A compact Session Customizations hover has breathing room above its title and a muted Copilot and project context line, followed by five icon-labelled inventory rows with right-aligned counts, no visible table header, and no Needs attention section.',
			'The footer shows a plus icon vertically centered with Browse Additional on the left and a settings gear aligned with the counts on the right.',
		],
		render: context => renderHover(context),
	}),
	Migrations: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Below the five inventory rows, Needs attention contains a link for 3 customizations needing migration and no MCP sign-in warning.'],
		render: context => renderHover(context, { migrationCount: 3 }),
	}),
	McpAuthentication: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Needs attention reports 2 MCP servers requiring sign-in, lists GitHub and Figma as individual sign-in links below it, and has no migration warning.'],
		render: context => renderHover(context, { authRequiredCount: 2 }),
	}),
	MigrationsAndMcpAuthentication: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'Needs attention contains both a 3-customization migration warning and a 4-MCP-server sign-in warning below the inventory and above the footer.',
			'Only GitHub and Figma are named as individual sign-in links, followed by +2 more. The settings gear is right-aligned with the inventory counts.',
		],
		render: context => renderHover(context, { migrationCount: 3, authRequiredCount: 4 }),
	}),
	LongMcpServerNames: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Both long server-name links under the sign-in warning are individually truncated with ellipses, followed by +1 more, without widening the compact hover or displacing the settings gear.'],
		render: context => renderHover(context, {
			authRequiredCount: 3,
			serverNames: ['Company GitHub Enterprise Integration', 'Workspace Design and Collaboration Service', 'Documentation'],
		}),
	}),
});
