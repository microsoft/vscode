/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Allow importing vscode here. eslint does not let us exclude this path: https://github.com/import-js/eslint-plugin-import/issues/2800
/* eslint-disable import/no-restricted-paths */

import { GitDiffService } from '../../../src/extension/prompt/vscode-node/gitDiffService';
import { IExtensionsService } from '../../../src/platform/extensions/common/extensionsService';
import { VSCodeExtensionsService } from '../../../src/platform/extensions/vscode/extensionsService';
import { IFileSystemService } from '../../../src/platform/filesystem/common/fileSystemService';
import { VSCodeFileSystemService } from '../../../src/platform/filesystem/vscode/fileSystemServiceImpl';
import { IGitDiffService } from '../../../src/platform/git/common/gitDiffService';
import { IGitExtensionService } from '../../../src/platform/git/common/gitExtensionService';
import { GitExtensionServiceImpl } from '../../../src/platform/git/vscode/gitExtensionServiceImpl';
import { INotebookService } from '../../../src/platform/notebook/common/notebookService';
import { INotebookSummaryTracker } from '../../../src/platform/notebook/common/notebookSummaryTracker';
import { NotebookService } from '../../../src/platform/notebook/vscode/notebookServiceImpl';
import { NotebookSummaryTrackerImpl } from '../../../src/platform/notebook/vscode/notebookSummaryTrackerImpl';
import { IRemoteRepositoriesService, RemoteRepositoriesService } from '../../../src/platform/remoteRepositories/vscode/remoteRepositories';
import { ISearchService } from '../../../src/platform/search/common/searchService';
import { SearchServiceImpl } from '../../../src/platform/search/vscode-node/searchServiceImpl';
import { ITabsAndEditorsService } from '../../../src/platform/tabs/common/tabsAndEditorsService';
import { TabsAndEditorsServiceImpl } from '../../../src/platform/tabs/vscode/tabsAndEditorsServiceImpl';
import { ITerminalService } from '../../../src/platform/terminal/common/terminalService';
import { TerminalServiceImpl } from '../../../src/platform/terminal/vscode/terminalServiceImpl';
import { TestingServiceCollection } from '../../../src/platform/test/node/services';
import { SyncDescriptor } from '../../../src/util/vs/platform/instantiation/common/descriptors';

/**
 * Adds a select number of 'real' services to the stest when they're running
 * in a real extension.
 */
export async function addExtensionHostSimulationServices(builder: TestingServiceCollection) {
	builder.define(IFileSystemService, new VSCodeFileSystemService());
	builder.define(INotebookService, new SyncDescriptor(NotebookService));
	builder.define(INotebookSummaryTracker, new SyncDescriptor(NotebookSummaryTrackerImpl));
	builder.define(ITabsAndEditorsService, new TabsAndEditorsServiceImpl());
	builder.define(ITerminalService, new SyncDescriptor(TerminalServiceImpl));
	// builder.define(IWorkspaceService, new SyncDescriptor(ExtensionTextDocumentManager));
	builder.define(IExtensionsService, new SyncDescriptor(VSCodeExtensionsService));
	builder.define(IRemoteRepositoriesService, new RemoteRepositoriesService());
	builder.define(IGitDiffService, new SyncDescriptor(GitDiffService));
	builder.define(IGitExtensionService, new SyncDescriptor(GitExtensionServiceImpl));
	builder.define(ISearchService, new SyncDescriptor(SearchServiceImpl));
}
