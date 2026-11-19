/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceFolderLocationProvider } from '../../../../../../platform/workspace/common/folderLocations.js';
import { AgentHostWorktreeLocationProvider } from './agentHostWorktreeLocations.js';

export const IAgentHostWorktreeLocations = createDecorator<IAgentHostWorktreeLocations>('agentHostWorktreeLocations');

/**
 * The window's one provider of the worktrees that the local agent host's sessions work in, as locations of its folder, which
 * worktree support registers with the folder location service while it is on. What else shows a folder's worktrees asks
 * the folder location service for them, and this for the forms of a folder, such as its real path, to tell them apart.
 */
export interface IAgentHostWorktreeLocations extends IWorkspaceFolderLocationProvider {
	readonly _serviceBrand: undefined;
	/**
	 * The forms of `folder` known now: itself, and its real path where it differs, such as `/private/tmp/x` of `/tmp/x` on
	 * macOS, once read. The first ask for a folder of the workspace starts reading it, which `onDidChangeLocations` follows.
	 */
	getFolderForms(folder: URI): readonly URI[];
}

class AgentHostWorktreeLocations extends AgentHostWorktreeLocationProvider implements IAgentHostWorktreeLocations {
	declare readonly _serviceBrand: undefined;
}

registerSingleton(IAgentHostWorktreeLocations, AgentHostWorktreeLocations, InstantiationType.Delayed);
