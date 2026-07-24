/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatContextService } from '../../chat/browser/contextContrib/chatContextService.js';
import { IChatContextItem } from '../../chat/common/contextContrib/chatContext.js';
import { buildRepoctxAgentContext, findRepoctxEvidence, RepoctxEvidence, repoctxAgentContextEnabledSetting, repoctxEvidenceStages } from '../common/repoctx.js';

export class RepoctxChatContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.repoctxChatContext';
	private static readonly CONTEXT_ID = 'repoctx.agentContext';

	private refreshToken = 0;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatContextService private readonly chatContextService: IChatContextService,
	) {
		super();

		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => void this.refresh()));
		this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => void this.refresh()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(repoctxAgentContextEnabledSetting)) {
				void this.refresh();
			}
		}));
		this._register(this.fileService.onDidFilesChange(event => {
			if (this.workspaceContextService.getWorkspace().folders.some(folder => event.affects(URI.joinPath(folder.uri, '.dev-context')))) {
				void this.refresh();
			}
		}));

		void this.refresh();
	}

	private async refresh(): Promise<void> {
		const token = ++this.refreshToken;
		if (this.configurationService.getValue<boolean>(repoctxAgentContextEnabledSetting) === false) {
			this.chatContextService.updateWorkspaceContextItems(RepoctxChatContextContribution.CONTEXT_ID, []);
			return;
		}

		const items = (await Promise.all(this.workspaceContextService.getWorkspace().folders.map((folder, index) => this.createContextItem(folder, index))))
			.filter((item): item is IChatContextItem => Boolean(item));
		if (token !== this.refreshToken) {
			return;
		}

		this.chatContextService.updateWorkspaceContextItems(RepoctxChatContextContribution.CONTEXT_ID, items);
	}

	private async createContextItem(folder: IWorkspaceFolder, handle: number): Promise<IChatContextItem | undefined> {
		const evidenceRoot = URI.joinPath(folder.uri, '.dev-context');
		const evidence = await findRepoctxEvidence(relativePath => this.fileService.exists(URI.joinPath(evidenceRoot, relativePath)));
		if (!evidence.context) {
			return undefined;
		}

		const evidencePaths: RepoctxEvidence = {
			context: undefined,
			impact: undefined,
			review: undefined,
			gate: undefined,
			audit: undefined,
		};
		for (const stage of repoctxEvidenceStages) {
			const artifactPath = evidence[stage.id];
			if (artifactPath) {
				evidencePaths[stage.id] = this.toAgentPath(URI.joinPath(evidenceRoot, artifactPath));
			}
		}

		const indexUri = URI.joinPath(evidenceRoot, 'index.json');
		let indexContent: string | undefined;
		if (await this.fileService.exists(indexUri)) {
			try {
				indexContent = (await this.fileService.readFile(indexUri)).value.toString();
			} catch {
				// The evidence paths still provide useful context when an index is temporarily unreadable.
			}
		}

		const value = buildRepoctxAgentContext({ repositoryName: folder.name, evidencePaths, indexContent });
		if (!value) {
			return undefined;
		}

		const evidenceCount = repoctxEvidenceStages.filter(stage => evidencePaths[stage.id]).length;
		const label = evidenceCount === 1
			? localize('repoctx.agentContext.oneEvidenceFile', "Repoctx · 1 evidence file")
			: localize('repoctx.agentContext.evidenceFiles', "Repoctx · {0} evidence files", evidenceCount);

		return {
			handle,
			label,
			modelDescription: 'Repoctx repository map and trust evidence',
			iconPath: Codicon.shield,
			tooltip: new MarkdownString(localize('repoctx.agentContext.tooltip', "Automatic repository context is attached to this request. Open the Repoctx Trust Rail for evidence details.")),
			displayInChat: true,
			value,
		};
	}

	private toAgentPath(resource: URI): string {
		if (resource.scheme === Schemas.file) {
			return resource.fsPath;
		}
		if (resource.scheme === Schemas.vscodeRemote) {
			return resource.path;
		}
		return resource.toString();
	}

	public override dispose(): void {
		this.chatContextService.updateWorkspaceContextItems(RepoctxChatContextContribution.CONTEXT_ID, []);
		super.dispose();
	}
}
