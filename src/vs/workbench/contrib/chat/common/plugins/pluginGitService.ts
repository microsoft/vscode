/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IPluginGitService = createDecorator<IPluginGitService>('pluginGitService');

/**
 * Abstracts git operations used by the agent plugin system.
 *
 * Concrete behavior depends on the platform-specific implementation that is
 * registered for this service. The current decision matrix is:
 *
 * | Deployment flavor                  | Implementation                  | Materialisation strategy                                | Test fixture                                                           |
 * | ---------------------------------- | ------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
 * | Desktop (no remote AHP)            | `NativePluginGitCommandService` | Real `git` via `ILocalGitService` in the shared process | `chat/test/electron-browser/pluginGitCommandService.test.ts`           |
 * | Desktop + remote AHP backend       | `NativePluginGitCommandService` | Real `git` locally; server pulls dir via AHP FS         | + `platform/agentHost/test/node/agentPluginManager.test.ts`            |
 * | Web standalone (no AHP)            | `BrowserPluginGitCommandService`| GitHub tarball fetch + extract into virtual FS          | `chat/test/browser/pluginGitCommandService.test.ts`                    |
 * | Web + remote AHP backend           | `BrowserPluginGitCommandService`| Tarball locally; server pulls dir via AHP FS            | + `platform/agentHost/test/node/agentPluginManager.test.ts`            |
 *
 * The "+ remote AHP" rows reuse the local impl unchanged: the server-side
 * `AgentPluginManager` consumes the already-materialised plugin dir through
 * the AHP filesystem provider (`agent-client:`), so its test fixture is
 * agnostic to which client impl wrote the bytes.
 *
 * A future "server-side clone" path (Approach B) would add a fifth arm
 * where the server itself runs `git clone` based on a typed git-source
 * variant of `CustomizationRef`. That work is not yet implemented.
 */
export interface IPluginGitService {
	readonly _serviceBrand: undefined;

	cloneRepository(cloneUrl: string, targetDir: URI, ref?: string, token?: CancellationToken): Promise<void>;
	pull(repoDir: URI, token?: CancellationToken): Promise<boolean>;
	checkout(repoDir: URI, treeish: string, detached?: boolean, token?: CancellationToken): Promise<void>;
	revParse(repoDir: URI, ref: string): Promise<string>;
	fetch(repoDir: URI, token?: CancellationToken): Promise<void>;
	fetchRepository(repoDir: URI, token?: CancellationToken): Promise<void>;
	revListCount(repoDir: URI, fromRef: string, toRef: string): Promise<number>;
}
