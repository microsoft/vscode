/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { CustomizationLoadStatus, CustomizationType, type ChildCustomization, type Customization, type DirectoryCustomization, type PluginCustomization } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { AgentCustomizationItemProvider } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { NullAgentHostCustomizationService } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationItemsModel, IAICustomizationItemsModel } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { AICustomizationListWidget } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationListWidget.js';
import { AICustomizationManagementSection } from '../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { IAICustomizationWorkspaceService } from '../../../../contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { createVSCodeHarnessDescriptor, ICustomizationHarnessService, IHarnessDescriptor } from '../../../../contrib/chat/common/customizationHarnessService.js';
import { emptyCustomizationMarketplaceInstallationSnapshot, ICustomizationMarketplaceInstallService } from '../../../../contrib/chat/common/customizationMarketplaceInstallService.js';
import { getChatSessionType, LocalChatSessionUri } from '../../../../contrib/chat/common/model/chatUri.js';
import { IAgentPlugin, IAgentPluginService } from '../../../../contrib/chat/common/plugins/agentPluginService.js';
import { IMarketplacePlugin } from '../../../../contrib/chat/common/plugins/pluginMarketplaceService.js';
import { PromptFileSource, PromptsType, Target } from '../../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { IAgentSkill, ICustomAgent, IInstructionFile, IPromptPath, IPromptPathBase, IPromptsService, PromptsStorage } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// Ensure color registrations are loaded
import '../../../../../platform/theme/common/colors/inputColors.js';
import '../../../../../platform/theme/common/colors/listColors.js';

// Fixtures for how customizations are organized into groups. Each variant
// feeds the real items model and list widget through the same provider
// inputs production uses: prompts-service discovery for the local harness and
// Agent Host Protocol customizations for a remote Copilot agent host harness.

const CHAT_EXTENSION_ID = 'GitHub.copilot-chat';
const userHome = URI.file('/home/dev');
const workspaceRoot = URI.file('/workspace');
const pluginsHome = URI.file('/home/dev/.vscode/agent-plugins/awesome-copilot/plugins');
const chatExtensionStorage = URI.file('/home/dev/.vscode/globalStorage/github.copilot-chat');

// #region Local harness data

interface ILocalFixtureData {
	readonly agents?: readonly ICustomAgent[];
	readonly agentFiles?: readonly IPromptPath[];
	readonly skills?: readonly IAgentSkill[];
	readonly skillFiles?: readonly IPromptPath[];
	readonly builtinSkills?: readonly IPromptPath[];
	readonly instructions?: readonly { readonly uri: URI; readonly name: string; readonly description?: string; readonly storage: PromptsStorage; readonly pattern?: string; readonly extension?: IExtensionDescription; readonly pluginUri?: URI }[];
	readonly workspaceFolders?: readonly URI[];
}

function extension(id: string, displayName: string): IExtensionDescription {
	return upcastPartial<IExtensionDescription>({ identifier: new ExtensionIdentifier(id), displayName });
}

const chatExtension = extension(CHAT_EXTENSION_ID, 'GitHub Copilot Chat');
const acmeExtension = extension('acme.tools', 'Acme Tools');
const azurePluginUri = joinPath(pluginsHome, 'azure');
const apifyPluginUri = joinPath(pluginsHome, 'apify');

function skill(uri: URI, storage: PromptsStorage, name: string, description: string, origin?: { readonly extension?: IExtensionDescription; readonly pluginUri?: URI; readonly pluginLabel?: string }): IAgentSkill {
	return {
		uri,
		storage,
		name,
		description,
		disableModelInvocation: false,
		userInvocable: true,
		extension: origin?.extension,
		pluginUri: origin?.pluginUri,
		pluginLabel: origin?.pluginLabel,
	};
}

function skillFile(entry: IAgentSkill): IPromptPath {
	return upcastPartial<IPromptPathBase>({
		uri: entry.uri,
		storage: entry.storage,
		type: PromptsType.skill,
		name: entry.name,
		description: entry.description,
		extension: entry.extension,
		pluginUri: entry.pluginUri,
		pluginLabel: entry.pluginLabel,
		source: entry.storage === PromptsStorage.plugin ? PromptFileSource.Plugin : entry.storage === PromptsStorage.extension ? PromptFileSource.ExtensionContribution : undefined,
	}) as IPromptPath;
}

function agent(uri: URI, name: string, description: string, source: ICustomAgent['source']): ICustomAgent {
	return {
		id: uri.toString(),
		uri,
		name,
		description,
		source,
		target: Target.Undefined,
		visibility: { userInvocable: true, agentInvocable: true },
		agentInstructions: { content: '', toolReferences: [] },
		enabled: true,
	};
}

function agentFile(uri: URI, storage: PromptsStorage, extensionDescription?: IExtensionDescription): IPromptPath {
	return upcastPartial<IPromptPath>({ uri, storage, type: PromptsType.agent, extension: extensionDescription });
}


const localSkills: readonly IAgentSkill[] = [
	skill(joinPath(workspaceRoot, '.github/skills/deploy/SKILL.md'), PromptsStorage.local, 'deploy', 'Deploy the service to staging'),
	skill(joinPath(workspaceRoot, '.github/skills/review/SKILL.md'), PromptsStorage.local, 'review', 'Review pull requests with the team checklist'),
	skill(joinPath(workspaceRoot, '.github/skills/release-notes/SKILL.md'), PromptsStorage.local, 'release-notes', 'Draft release notes from merged pull requests'),
	skill(joinPath(userHome, '.copilot/skills/triage/SKILL.md'), PromptsStorage.user, 'triage', 'Triage new issues and apply labels'),
	skill(joinPath(userHome, '.copilot/skills/summarize/SKILL.md'), PromptsStorage.user, 'summarize', 'Summarize a long thread in my preferred format'),
	skill(joinPath(azurePluginUri, 'skills/azure-deploy/SKILL.md'), PromptsStorage.plugin, 'azure-deploy', 'Deploy apps to Azure', { pluginUri: azurePluginUri, pluginLabel: 'azure' }),
	skill(joinPath(azurePluginUri, 'skills/azure-diagnostics/SKILL.md'), PromptsStorage.plugin, 'azure-diagnostics', 'Diagnose Azure resource health', { pluginUri: azurePluginUri, pluginLabel: 'azure' }),
	skill(joinPath(apifyPluginUri, 'skills/apify-scrape/SKILL.md'), PromptsStorage.plugin, 'apify-scrape', 'Scrape a website with Apify actors', { pluginUri: apifyPluginUri, pluginLabel: 'apify' }),
	skill(URI.file('/extensions/acme.tools/skills/acme-lint/SKILL.md'), PromptsStorage.extension, 'acme-lint', 'Run the Acme lint rules', { extension: acmeExtension }),
	skill(URI.file('/extensions/github.copilot-chat/skills/setup-tests/SKILL.md'), PromptsStorage.extension, 'setup-tests', 'Set up a test framework for this project', { extension: chatExtension }),
];

const localBuiltinSkills: readonly IPromptPath[] = [
	upcastPartial<IPromptPath>({ uri: URI.file('/app/skills/init/SKILL.md'), storage: PromptsStorage.builtIn, type: PromptsType.skill, name: 'init', description: 'Create an AGENTS.md file for this project' }),
	upcastPartial<IPromptPath>({ uri: URI.file('/app/skills/summarize/SKILL.md'), storage: PromptsStorage.builtIn, type: PromptsType.skill, name: 'summarize', description: 'Summarize the conversation' }),
];

const localSkillsData: ILocalFixtureData = {
	skills: localSkills,
	skillFiles: localSkills.map(skillFile),
	builtinSkills: localBuiltinSkills,
};

const orgAgentUri = joinPath(chatExtensionStorage, 'github/contoso/agents/release-captain.agent.md');
const localAgentsData: ILocalFixtureData = {
	agents: [
		agent(joinPath(workspaceRoot, '.github/agents/reviewer.agent.md'), 'Reviewer', 'Reviews changes against team conventions', { storage: PromptsStorage.local }),
		agent(joinPath(workspaceRoot, '.github/agents/tester.agent.md'), 'Tester', 'Writes and runs tests', { storage: PromptsStorage.local }),
		agent(joinPath(userHome, '.copilot/agents/planner.agent.md'), 'Planner', 'Plans multi-step work', { storage: PromptsStorage.user }),
		agent(joinPath(azurePluginUri, 'agents/azure-architect.agent.md'), 'Azure Architect', 'Designs Azure architectures', { storage: PromptsStorage.plugin, pluginUri: azurePluginUri }),
		agent(URI.file('/extensions/github.copilot-chat/assets/agents/Plan.agent.md'), 'Plan', 'Researches and outlines multi-step plans', { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(CHAT_EXTENSION_ID) }),
		agent(orgAgentUri, 'Release Captain', 'Runs the Contoso release checklist', { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(CHAT_EXTENSION_ID) }),
		agent(URI.file('/extensions/acme.tools/agents/api-helper.agent.md'), 'API Helper', 'Answers questions about Acme APIs', { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier('acme.tools') }),
	],
	agentFiles: [
		agentFile(URI.file('/extensions/github.copilot-chat/assets/agents/Plan.agent.md'), PromptsStorage.extension, chatExtension),
		agentFile(orgAgentUri, PromptsStorage.extension, chatExtension),
		agentFile(URI.file('/extensions/acme.tools/agents/api-helper.agent.md'), PromptsStorage.extension, acmeExtension),
	],
};

const localInstructionsData: ILocalFixtureData = {
	instructions: [
		{ uri: joinPath(workspaceRoot, '.github/instructions/testing.instructions.md'), name: 'testing', description: 'Testing conventions', storage: PromptsStorage.local, pattern: '**/*.test.ts' },
		{ uri: joinPath(workspaceRoot, '.github/instructions/api-design.instructions.md'), name: 'api-design', description: 'REST API design conventions', storage: PromptsStorage.local },
		{ uri: joinPath(userHome, '.copilot/instructions/my-style.instructions.md'), name: 'my-style', description: 'Personal coding style', storage: PromptsStorage.user, pattern: '**' },
		{ uri: joinPath(azurePluginUri, 'rules/bicep.instructions.md'), name: 'bicep', description: 'Bicep authoring rules', storage: PromptsStorage.plugin, pattern: '**/*.bicep', pluginUri: azurePluginUri },
		{ uri: joinPath(chatExtensionStorage, 'github/contoso/instructions/security.instructions.md'), name: 'security', description: 'Contoso security requirements', storage: PromptsStorage.extension, extension: chatExtension },
		{ uri: URI.file('/extensions/acme.tools/instructions/team.instructions.md'), name: 'team', description: 'Acme team conventions', storage: PromptsStorage.extension, extension: acmeExtension },
	],
};

const apiRoot = URI.file('/repos/api');
const webRoot = URI.file('/repos/web');
const multiRootSkills: readonly IAgentSkill[] = [
	skill(joinPath(apiRoot, '.github/skills/deploy/SKILL.md'), PromptsStorage.local, 'deploy', 'Deploy the API service'),
	skill(joinPath(apiRoot, '.github/skills/migrate-db/SKILL.md'), PromptsStorage.local, 'migrate-db', 'Run database migrations'),
	skill(joinPath(webRoot, '.github/skills/storybook/SKILL.md'), PromptsStorage.local, 'storybook', 'Add Storybook stories for a component'),
	skill(joinPath(userHome, '.copilot/skills/triage/SKILL.md'), PromptsStorage.user, 'triage', 'Triage new issues and apply labels'),
	skill(joinPath(azurePluginUri, 'skills/azure-deploy/SKILL.md'), PromptsStorage.plugin, 'azure-deploy', 'Deploy apps to Azure', { pluginUri: azurePluginUri, pluginLabel: 'azure' }),
];
const multiRootSkillsData: ILocalFixtureData = {
	skills: multiRootSkills,
	skillFiles: multiRootSkills.map(skillFile),
	builtinSkills: localBuiltinSkills.slice(0, 1),
	workspaceFolders: [apiRoot, webRoot],
};

const manyPluginNames = ['azure', 'apify', 'playwright', 'figma', 'sentry', 'stripe'];
const manyPluginSkills: readonly IAgentSkill[] = [
	skill(joinPath(userHome, '.copilot/skills/triage/SKILL.md'), PromptsStorage.user, 'triage', 'Triage new issues and apply labels'),
	...manyPluginNames.flatMap(name => {
		const pluginUri = joinPath(pluginsHome, name);
		return [
			skill(joinPath(pluginUri, `skills/${name}-setup/SKILL.md`), PromptsStorage.plugin, `${name}-setup`, `Configure ${name} for this project`, { pluginUri, pluginLabel: name }),
			skill(joinPath(pluginUri, `skills/${name}-debug/SKILL.md`), PromptsStorage.plugin, `${name}-debug`, `Investigate ${name} failures`, { pluginUri, pluginLabel: name }),
		];
	}),
];
const manyPluginsSkillsData: ILocalFixtureData = {
	skills: manyPluginSkills,
	skillFiles: manyPluginSkills.map(skillFile),
};

function createLocalPromptsService(data: ILocalFixtureData): IPromptsService {
	return new class extends mock<IPromptsService>() {
		override readonly onDidChangeCustomAgents = Event.None;
		override readonly onDidChangeSlashCommands = Event.None;
		override readonly onDidChangeSkills = Event.None;
		override readonly onDidChangeInstructions = Event.None;
		override readonly onDidChangeAgentInstructions = Event.None;
		override readonly onDidChangeHooks = Event.None;
		override getDisabledPromptFiles(): ResourceSet { return new ResourceSet(); }
		override async listPromptFiles(type: PromptsType) {
			switch (type) {
				case PromptsType.agent: return [...data.agentFiles ?? []];
				case PromptsType.skill: return [...data.skillFiles ?? []];
				default: return [];
			}
		}
		override async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage) {
			return type === PromptsType.skill && storage === PromptsStorage.builtIn ? [...data.builtinSkills ?? []] : [];
		}
		override async getCustomAgents() { return [...data.agents ?? []]; }
		override async findAgentSkills() { return [...data.skills ?? []]; }
		override async getPromptSlashCommands() { return []; }
		override async getHooks() { return undefined; }
		override async listAgentInstructions() { return []; }
		override async getInstructionFiles(): Promise<readonly IInstructionFile[]> { return (data.instructions ?? []).map(file => ({ ...file, description: file.description, pattern: file.pattern })); }
		override async getSourceFolders() { return []; }
	}();
}

// #endregion

// #region Agent host data

const AGENT_HOST_SESSION_TYPE = 'remote-devbox-copilotcli';
const AGENT_HOST_SESSION = URI.from({ scheme: AGENT_HOST_SESSION_TYPE, path: '/fixture-session' });
const CLIENT_ID = 'vscode-fixture-client';
const clientHome = URI.file('/Users/me');

function directory(uri: URI, contents: CustomizationType.Agent | CustomizationType.Skill, writable: boolean, children: readonly { readonly uri: URI; readonly name: string; readonly description: string; readonly meta?: Record<string, unknown> }[], options?: { readonly clientId?: string; readonly meta?: Record<string, unknown> }): DirectoryCustomization {
	return {
		type: CustomizationType.Directory,
		id: uri.toString(),
		uri: uri.toString(),
		name: uri.path.split('/').pop() ?? '',
		enabled: true,
		contents,
		writable,
		clientId: options?.clientId,
		load: { kind: CustomizationLoadStatus.Loaded },
		...(options?.meta ? { _meta: options.meta } : {}),
		children: children.map((child): ChildCustomization => contents === CustomizationType.Agent
			? { type: CustomizationType.Agent, id: child.uri.toString(), uri: child.uri.toString(), name: child.name, description: child.description, ...(child.meta ? { _meta: child.meta } : {}) }
			: { type: CustomizationType.Skill, id: child.uri.toString(), uri: child.uri.toString(), name: child.name, description: child.description, ...(child.meta ? { _meta: child.meta } : {}) }),
	};
}

function plugin(uri: URI, name: string, options?: { readonly clientId?: string; readonly degraded?: string }): PluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: uri.toString(),
		uri: uri.toString(),
		name,
		clientId: options?.clientId,
		load: options?.degraded ? { kind: CustomizationLoadStatus.Degraded, message: options.degraded } : { kind: CustomizationLoadStatus.Loaded },
	};
}

const hostAzurePlugin = URI.file('/home/dev/.copilot/installed-plugins/awesome-copilot/azure');
const hostApifyPlugin = URI.file('/home/dev/.copilot/installed-plugins/awesome-copilot/apify');
const clientPlaywrightPlugin = joinPath(clientHome, '.vscode/agent-plugins/playwright');

const agentHostPluginFiles: readonly { readonly uri: URI; readonly content: string }[] = [
	{ uri: joinPath(hostAzurePlugin, 'skills/azure-deploy/SKILL.md'), content: '---\nname: azure-deploy\ndescription: Deploy apps to Azure\n---\n' },
	{ uri: joinPath(hostAzurePlugin, 'skills/azure-diagnostics/SKILL.md'), content: '---\nname: azure-diagnostics\ndescription: Diagnose Azure resource health\n---\n' },
	{ uri: joinPath(hostAzurePlugin, 'agents/azure-architect.agent.md'), content: '---\nname: Azure Architect\ndescription: Designs Azure architectures\n---\n' },
	{ uri: joinPath(hostApifyPlugin, 'skills/apify-scrape/SKILL.md'), content: '---\nname: apify-scrape\ndescription: Scrape a website with Apify actors\n---\n' },
	{ uri: joinPath(clientPlaywrightPlugin, 'skills/playwright-test/SKILL.md'), content: '---\nname: playwright-test\ndescription: Write and run Playwright tests\n---\n' },
];

const agentHostCustomizations: readonly Customization[] = [
	directory(joinPath(workspaceRoot, '.github/skills'), CustomizationType.Skill, true, [
		{ uri: joinPath(workspaceRoot, '.github/skills/deploy/SKILL.md'), name: 'deploy', description: 'Deploy the service to staging' },
		{ uri: joinPath(workspaceRoot, '.github/skills/review/SKILL.md'), name: 'review', description: 'Review pull requests with the team checklist' },
	]),
	directory(joinPath(userHome, '.copilot/skills'), CustomizationType.Skill, true, [
		{ uri: joinPath(userHome, '.copilot/skills/triage/SKILL.md'), name: 'triage', description: 'Triage new issues and apply labels' },
	]),
	directory(joinPath(clientHome, '.copilot/skills'), CustomizationType.Skill, false, [
		{ uri: joinPath(clientHome, '.copilot/skills/code-review/SKILL.md'), name: 'code-review', description: 'My personal code review checklist' },
		{ uri: joinPath(clientHome, '.copilot/skills/commit-helper/SKILL.md'), name: 'commit-helper', description: 'Write conventional commit messages' },
	], { clientId: CLIENT_ID }),
	directory(URI.from({ scheme: 'agent-builtin', path: '/skills' }), CustomizationType.Skill, false, [
		{ uri: URI.from({ scheme: 'agent-builtin', path: '/skill/init' }), name: 'init', description: 'Create an AGENTS.md file for this project' },
	]),
	directory(joinPath(workspaceRoot, '.github/agents'), CustomizationType.Agent, true, [
		{ uri: joinPath(workspaceRoot, '.github/agents/reviewer.agent.md'), name: 'Reviewer', description: 'Reviews changes against team conventions' },
	]),
	directory(joinPath(userHome, '.copilot/agents'), CustomizationType.Agent, true, [
		{ uri: joinPath(userHome, '.copilot/agents/planner.agent.md'), name: 'Planner', description: 'Plans multi-step work' },
	]),
	directory(URI.from({ scheme: 'copilot-builtin', path: '/agents' }), CustomizationType.Agent, false, [
		{ uri: URI.from({ scheme: 'copilot-builtin', path: '/agents/ask.agent.md' }), name: 'Ask', description: 'Answers questions about your code without making changes', meta: { 'vscode.chatMode': 'ask' } },
	], { meta: { 'vscode.customization.scope': 'application' } }),
	plugin(hostAzurePlugin, 'azure'),
	plugin(hostApifyPlugin, 'apify', { degraded: 'One skill could not be loaded' }),
	plugin(clientPlaywrightPlugin, 'playwright', { clientId: CLIENT_ID }),
];

class FixtureAgentHostCustomizationService extends NullAgentHostCustomizationService {
	override getCustomizations(): readonly Customization[] { return agentHostCustomizations; }
	override getWorkingDirectories(): readonly string[] { return [workspaceRoot.toString()]; }
	override getClientWorkingDirectoryUris(): readonly URI[] { return [workspaceRoot]; }
}

async function createAgentHostItemProvider(ctx: ComponentFixtureContext, promptsService: IPromptsService): Promise<AgentCustomizationItemProvider> {
	const logService = new NullLogService();
	const fileService = ctx.disposableStore.add(new FileService(logService));
	ctx.disposableStore.add(fileService.registerProvider('file', ctx.disposableStore.add(new InMemoryFileSystemProvider())));
	for (const file of agentHostPluginFiles) {
		await fileService.writeFile(file.uri, VSBuffer.fromString(file.content));
	}
	return ctx.disposableStore.add(new AgentCustomizationItemProvider(
		'local',
		undefined,
		undefined,
		fileService,
		logService,
		new FixtureAgentHostCustomizationService(),
		promptsService,
	));
}

// #endregion

// #region Services

function createWorkspaceService(): IAICustomizationWorkspaceService {
	return new class extends mock<IAICustomizationWorkspaceService>() {
		override readonly isSessionsWindow = false;
		override readonly welcomePageFeatures = { showGettingStartedBanner: true };
		override readonly activeProjectRoot = observableValue<URI | undefined>('activeProjectRoot', workspaceRoot);
		override readonly hasOverrideProjectRoot = observableValue('hasOverrideProjectRoot', false);
		override getActiveProjectRoot() { return workspaceRoot; }
		override getSkillUIIntegrations() { return new Map(); }
	}();
}

function createHarnessService(descriptor: IHarnessDescriptor, sessionResource: URI): ICustomizationHarnessService {
	const activeSessionResource = observableValue<URI>('activeSessionResource', sessionResource);
	return new class extends mock<ICustomizationHarnessService>() {
		override readonly activeSessionResource = activeSessionResource;
		override readonly activeHarness = derived(reader => getChatSessionType(activeSessionResource.read(reader)));
		override readonly availableHarnesses = observableValue<readonly IHarnessDescriptor[]>('availableHarnesses', [descriptor]);
		override findHarnessById(id: string) { return id === descriptor.id ? descriptor : undefined; }
		override getActiveDescriptor() { return descriptor; }
		override setActiveSession(resource: URI) { activeSessionResource.set(resource, undefined); }
		override getSessionResourceForHarness() { return activeSessionResource.get(); }
		override registerExternalHarness() { return { dispose() { } }; }
	}();
}

function createWorkspaceContextService(folders: readonly URI[]): IWorkspaceContextService {
	const workspaceFolders: IWorkspaceFolder[] = folders.map((uri, index) => ({
		uri,
		name: uri.path.split('/').pop() ?? '',
		index,
		toResource: (relativePath: string) => joinPath(uri, relativePath),
	}));
	return new class extends mock<IWorkspaceContextService>() {
		override readonly onDidChangeWorkspaceFolders = Event.None;
		override getWorkspace(): IWorkspace { return { id: 'fixture', folders: workspaceFolders }; }
		override getWorkspaceFolder(resource: URI) {
			return workspaceFolders.find(folder => resource.path.startsWith(`${folder.uri.path}/`)) ?? null;
		}
	}();
}

function createAgentPlugin(uri: URI, label: string, marketplace: string): IAgentPlugin {
	return upcastPartial<IAgentPlugin>({
		uri,
		label,
		enablement: constObservable(0),
		fromMarketplace: upcastPartial<IMarketplacePlugin>({ name: label, marketplace }),
	});
}

// #endregion

// #region Render

interface IRenderOptions {
	readonly section: AICustomizationManagementSection;
	readonly harness: 'local' | 'agentHost';
	readonly data?: ILocalFixtureData;
	readonly width?: number;
	readonly height?: number;
	readonly searchQuery?: string;
}

async function renderOrganization(ctx: ComponentFixtureContext, options: IRenderOptions): Promise<void> {
	const width = options.width ?? 600;
	const height = options.height ?? 1040;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = `${height}px`;

	const data = options.data ?? {};
	const promptsService = createLocalPromptsService(data);
	let descriptor: IHarnessDescriptor;
	let sessionResource: URI;
	if (options.harness === 'agentHost') {
		descriptor = {
			id: AGENT_HOST_SESSION_TYPE,
			label: 'Copilot [devbox]',
			agentLabel: 'Copilot',
			icon: ThemeIcon.fromId(Codicon.copilot.id),
			hideGenerateButton: true,
			itemProvider: await createAgentHostItemProvider(ctx, promptsService),
		};
		sessionResource = AGENT_HOST_SESSION;
	} else {
		descriptor = createVSCodeHarnessDescriptor();
		sessionResource = LocalChatSessionUri.getNewSessionUri();
	}

	const contextMenuService = new class extends mock<IContextMenuService>() {
		override onDidShowContextMenu = Event.None;
		override onDidHideContextMenu = Event.None;
		override showContextMenu(): void { }
	};
	const contextViewService = new class extends mock<IContextViewService>() {
		override anchorAlignment = 0;
		override showContextView() { return { close: () => { } }; }
		override hideContextView(): void { }
		override getContextViewElement(): HTMLElement { return ctx.container; }
		override layout(): void { }
	};

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IContextMenuService, contextMenuService);
			reg.defineInstance(IContextViewService, contextViewService);
			reg.define(IListService, ListService);
			reg.defineInstance(IPromptsService, promptsService);
			reg.defineInstance(IAICustomizationWorkspaceService, createWorkspaceService());
			reg.defineInstance(ICustomizationHarnessService, createHarnessService(descriptor, sessionResource));
			reg.defineInstance(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
				override readonly onDidChange = Event.None;
				override readonly installations = observableValue('marketplaceInstallations', emptyCustomizationMarketplaceInstallationSnapshot);
			}());
			reg.defineInstance(ICustomizationMarketplaceService, new class extends mock<ICustomizationMarketplaceService>() {
				override readonly sources = [];
				override readonly onDidChangeSources = Event.None;
			}());
			reg.defineInstance(IWorkspaceContextService, createWorkspaceContextService(data.workspaceFolders ?? [workspaceRoot]));
			reg.defineInstance(IChatSessionsService, new class extends mock<IChatSessionsService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override async getCustomizations() { return undefined; }
				override getRegisteredChatSessionItemProviders() { return []; }
			}());
			reg.defineInstance(IAgentPluginService, new class extends mock<IAgentPluginService>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', manyPluginNames.map(name => createAgentPlugin(joinPath(pluginsHome, name), name, 'awesome-copilot')));
			}());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override readonly onDidFilesChange = Event.None;
			}());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly defaultChatAgent = upcastPartial<NonNullable<IProductService['defaultChatAgent']>>({ chatExtensionId: CHAT_EXTENSION_ID });
			}());
			reg.defineInstance(IPathService, new class extends mock<IPathService>() {
				override readonly defaultUriScheme = 'file';
				override userHome(): URI;
				override userHome(): Promise<URI>;
				override userHome(): URI | Promise<URI> { return userHome; }
			}());
			reg.define(IAICustomizationItemsModel, AICustomizationItemsModel);
		},
	});

	const widget = ctx.disposableStore.add(instantiationService.createInstance(AICustomizationListWidget));
	// The editor opens plugin details from a row's plugin link; listening shows the links.
	ctx.disposableStore.add(widget.onDidRequestShowPlugin(() => { }));
	ctx.container.appendChild(widget.element);
	await widget.setSection(options.section);
	widget.layout(height, width);
	if (options.searchQuery) {
		widget.setSearchQuery(options.searchQuery);
		await new Promise(resolve => setTimeout(resolve, 400));
	}
}

// #endregion

export default defineThemedFixtureGroup({ path: 'chat/aiCustomizations/organization/' }, {
	LocalSkills: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Skills, data: localSkillsData }),
	}),
	LocalSkillsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Skills, data: localSkillsData, width: 380 }),
	}),
	LocalSkillsFiltered: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Skills, data: localSkillsData, searchQuery: 'deploy', height: 420 }),
	}),
	LocalSkillsEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Skills, height: 420 }),
	}),
	LocalMultiRootSkills: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Skills, data: multiRootSkillsData, height: 760 }),
	}),
	LocalSkillsManyPlugins: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Skills, data: manyPluginsSkillsData, height: 1000 }),
	}),
	LocalAgents: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Agents, data: localAgentsData, height: 760 }),
	}),
	LocalInstructions: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'local', section: AICustomizationManagementSection.Instructions, data: localInstructionsData, height: 760 }),
	}),
	AgentHostSkills: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderOrganization(ctx, { harness: 'agentHost', section: AICustomizationManagementSection.Skills, height: 900 }),
	}),
	AgentHostSkillsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'agentHost', section: AICustomizationManagementSection.Skills, width: 380, height: 900 }),
	}),
	AgentHostAgents: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderOrganization(ctx, { harness: 'agentHost', section: AICustomizationManagementSection.Agents, height: 600 }),
	}),
});
