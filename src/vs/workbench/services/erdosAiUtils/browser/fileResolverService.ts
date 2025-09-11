/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IDocumentManager } from '../../erdosAiDocument/common/documentManager.js';
import { IFileResolverService, IResolverContext } from '../common/fileResolverService.js';
import { IPathService } from '../../path/common/pathService.js';
import { ICommonUtils } from '../common/commonUtils.js';

export class FileResolverService extends Disposable implements IFileResolverService {
	readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDocumentManager private readonly documentManager: IDocumentManager,
		@IPathService private readonly pathService: IPathService,
		@ICommonUtils private readonly commonUtils: ICommonUtils
	) {
		super();
	}

	createResolverContext(): IResolverContext {
		return {
			getAllOpenDocuments: async () => {
				const docs = await this.documentManager.getAllOpenDocuments(true);
				return docs.map(doc => ({
					path: doc.path,
					content: doc.content,
					isDirty: !doc.isSaved,
					isActive: doc.isActive,
					isSaved: doc.isSaved
				}));
			},
			getCurrentWorkingDirectory: async () => {
				const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
				if (workspaceFolder) {
					return workspaceFolder.uri.fsPath;
				}
				
				// Follow VSCode's pattern: fall back to user home directory when no workspace
				const userHome = await this.pathService.userHome();
				return userHome.fsPath;
			},
			fileExists: async (path: string) => {
				try {
					const uri = URI.file(path);
					return await this.fileService.exists(uri);
				} catch {
					return false;
				}
			},
			joinPath: (base: string, ...parts: string[]) => {
				return parts.reduce((acc, part) => acc + '/' + part, base);
			},
			getFileContent: async (uri: URI) => {
				const fileContent = await this.documentManager.getEffectiveFileContent(uri.fsPath);
				return fileContent || '';
			}
		};
	}

	async resolveFileForWidget(filename: string): Promise<{ uri?: any; found: boolean }> {
		try {
			const resolverContext = this.createResolverContext();
			const result = await this.commonUtils.resolveFilePathToUri(filename, resolverContext);
			return {
				uri: result.uri,
				found: result.found
			};
		} catch (error) {
			return { found: false };
		}
	}
}
