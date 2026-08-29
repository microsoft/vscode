/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { parse, ParseError } from '../../../../../base/common/json.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { equals } from '../../../../../base/common/objects.js';
import { dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { isAgentHostSessionResource } from '../../common/chatSessionsService.js';
import { ICustomizationHarnessService, ICustomizationSourceFolder } from '../../common/customizationHarnessService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, getCustomizationMigrationTargetType, ICustomizationMigrationService, IMcpServerCustomizationMigrationCandidate, isPromptFileMigrationCandidate, isUserDataMigrationCandidate, McpServerCustomizationMigration, MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IAgentHostActiveClientService } from '../agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerSourceKind } from '../agentSessions/agentHost/agentHostMcpServerSupport.js';
import { canonicalizeMcpServerMigrationConfiguration, canonicalizeMcpServerMigrationSourceConfiguration } from './customizationMigration.js';

export class CustomizationMigrationService implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IAgentHostActiveClientService private readonly activeClientService: IAgentHostActiveClientService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IFileService private readonly fileService: IFileService,
	) { }

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
	async computeMigration(sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
		if (!isAgentHostSessionResource(sessionResource)) {
			return type === CustomizationMigrationType.McpServers
				? this.emptyMcpServerMigration()
				: { type, files: [], candidates: [] };
		}

		switch (type) {
			case CustomizationMigrationType.UserData: {
				const customizations = (await Promise.all([
					this.promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
					this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
				])).flat();
				return this.createFileMigration(sessionResource, type, customizations.filter(isUserDataMigrationCandidate));
			}
			case CustomizationMigrationType.PromptFiles: {
				const customizations = await this.promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
				return this.createFileMigration(sessionResource, type, customizations.filter(isPromptFileMigrationCandidate));
			}
			case CustomizationMigrationType.McpServers:
				return this.computeMcpServerMigration(sessionResource);
		}
	}

	async computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]> {
		return Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		]);
	}

	async computeMigrationHint(sessionResource: URI): Promise<string | undefined> {
		const harness = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource));
		if (!harness) {
			return undefined;
		}

		const [userDataMigration, promptFilesMigration, mcpServerMigration] = await Promise.all([
			this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		]);
		const fileCount = userDataMigration.files.length + promptFilesMigration.files.length;
		const migratableMcpServerCount = mcpServerMigration.candidates.length;
		const unsupportedMcpServerCount = mcpServerMigration.servers.filter(server => !server.supported).length;
		const fileHint = fileCount === 0
			? undefined
			: fileCount === 1
				? localize('customizationMigrationHintSingle', "Found 1 customization file that is present but not used by {0} and could be migrated.", harness.label)
				: localize('customizationMigrationHintMultiple', "Found {0} customization files that are present but not used by {1} and could be migrated.", fileCount, harness.label);
		const mcpMigrationHint = migratableMcpServerCount === 0
			? undefined
			: migratableMcpServerCount === 1
				? localize('customizationMigrationHintMigratableMcpSingle', "Found 1 workspace MCP server that can be migrated for {0}.", harness.label)
				: localize('customizationMigrationHintMigratableMcpMultiple', "Found {0} workspace MCP servers that can be migrated for {1}.", migratableMcpServerCount, harness.label);
		const unsupportedMcpHint = unsupportedMcpServerCount === 0
			? undefined
			: unsupportedMcpServerCount === 1
				? localize('customizationMigrationHintUnsupportedMcpSingle', "Found 1 MCP server that is not fully supported by {0}.", harness.label)
				: localize('customizationMigrationHintUnsupportedMcpMultiple', "Found {0} MCP servers that are not fully supported by {1}.", unsupportedMcpServerCount, harness.label);
		const hints: string[] = [];
		if (fileHint) {
			hints.push(fileHint);
		}
		if (mcpMigrationHint) {
			hints.push(mcpMigrationHint);
		}
		if (unsupportedMcpHint) {
			hints.push(unsupportedMcpHint);
		}
		let hint = hints.shift();
		for (const nextHint of hints) {
			hint = localize('customizationMigrationHintCombined', "{0} {1}", hint, nextHint);
		}
		return hint;
	}

	private async createFileMigration(sessionResource: URI, type: FileCustomizationMigrationType, candidates: readonly MigratableConfiguration[]): Promise<FileCustomizationMigration> {
		const provider = this.customizationHarnessService.findHarnessById(getChatSessionType(sessionResource))?.itemProvider;
		if (!provider?.provideSourceFolders) {
			return { type, files: [], candidates: [] };
		}

		const targetTypes = new Set(candidates.map(getCustomizationMigrationTargetType));
		const sourceFolders = new Map<PromptsType, readonly ICustomizationSourceFolder[]>();
		for (const targetType of targetTypes) {
			const folders = await provider.provideSourceFolders(sessionResource, targetType, CancellationToken.None);
			sourceFolders.set(targetType, folders ?? []);
		}
		const filteredCandidates = candidates.filter(customization => {
			const targetType = getCustomizationMigrationTargetType(customization);
			return sourceFolders.get(targetType)?.some(folder => folder.source === customization.storage) === true;
		});
		return { type, files: filteredCandidates.map(customization => customization.uri), candidates: filteredCandidates };
	}

	private async computeMcpServerMigration(sessionResource: URI): Promise<McpServerCustomizationMigration> {
		const roots = this.agentHostCustomizationService.getWorkingDirectories(sessionResource).map(path => URI.parse(path));
		const scope = this.activeClientService.acquireMcpServerSupportScope(getChatSessionType(sessionResource), roots);
		if (!scope) {
			return this.emptyMcpServerMigration();
		}

		try {
			await scope.whenResolved();
			const snapshot = scope.support.get();
			const sourceServers = new ResourceMap<Promise<Record<string, unknown> | undefined>>();
			const candidates = (await Promise.all(snapshot.servers.map(async server => {
				const sourceUri = server.source.collectionUri;
				if (server.source.kind !== AgentHostMcpServerSourceKind.VscodeWorkspaceFolder
					|| !sourceUri
					|| !server.enablement.enabled
					|| server.applicability !== AgentHostMcpServerApplicability.Applicable
					|| server.compatibility.kind !== 'supported'
					|| !server.migrationConfiguration) {
					return [];
				}
				let sourceServersPromise = sourceServers.get(sourceUri);
				if (!sourceServersPromise) {
					sourceServersPromise = this.readMcpServers(sourceUri);
					sourceServers.set(sourceUri, sourceServersPromise);
				}
				const sourceConfiguration = canonicalizeMcpServerMigrationSourceConfiguration((await sourceServersPromise)?.[server.name]);
				if (!sourceConfiguration || !equals(
					sourceConfiguration,
					canonicalizeMcpServerMigrationConfiguration(server.migrationConfiguration),
				)) {
					return [];
				}
				return [{
					type: CustomizationMigrationType.McpServers,
					id: server.id,
					name: server.name,
					sourceUri,
					targetUri: URI.joinPath(dirname(dirname(sourceUri)), '.mcp.json'),
					configuration: server.migrationConfiguration,
				} satisfies IMcpServerCustomizationMigrationCandidate];
			}))).flat();
			return {
				type: CustomizationMigrationType.McpServers,
				servers: snapshot.servers
					.filter(server => server.applicability !== AgentHostMcpServerApplicability.OutsideCurrentScope)
					.map(server => ({
						id: server.id,
						name: server.name,
						supported: server.compatibility.kind === 'supported',
					})),
				candidates,
				discoveryComplete: snapshot.discoveryComplete,
				coverage: snapshot.coverage,
			};
		} finally {
			scope.dispose();
		}
	}

	private async readMcpServers(resource: URI): Promise<Record<string, unknown> | undefined> {
		let content: string;
		try {
			content = (await this.fileService.readFile(resource)).value.toString();
		} catch (error) {
			if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return undefined;
			}
			throw error;
		}
		const errors: ParseError[] = [];
		const value = parse(content, errors, { allowTrailingComma: true, allowEmptyContent: false });
		if (errors.length > 0 || !value || typeof value !== 'object' || Array.isArray(value)) {
			return undefined;
		}
		const servers = (value as Record<string, unknown>)['servers'];
		return servers && typeof servers === 'object' && !Array.isArray(servers)
			? servers as Record<string, unknown>
			: undefined;
	}

	private emptyMcpServerMigration(): McpServerCustomizationMigration {
		return {
			type: CustomizationMigrationType.McpServers,
			servers: [],
			candidates: [],
			discoveryComplete: true,
			coverage: {
				restrictedByMcpAccess: false,
				restrictedByCustomizationPolicy: false,
			},
		};
	}
}
