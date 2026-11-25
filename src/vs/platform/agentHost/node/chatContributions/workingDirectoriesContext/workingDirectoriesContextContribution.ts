/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IOutgoingTurn, type ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostGitService } from '../../../common/agentHostGitService.js';
import { readSessionGitHubState } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** The folder list last sent to the chat's agent, so that it is sent again only when the folders change. */
const sentFoldersMemento = createChatMementoKey<string | undefined>('workingDirectoriesContext.sent', () => undefined);

/** A working directory as the agent is told about it. */
export interface IWorkingDirectoryContext {
	readonly path: string;
	/** The root of the folder's Git repository, `undefined` for a folder that is not in one. */
	readonly repositoryRoot: string | undefined;
	/** The folder's GitHub repository, as `owner/repo`, when known. */
	readonly gitHubRepository: string | undefined;
}

/**
 * Renders the folders of a turn, its primary (process) folder first. Paths are JSON-quoted, with `<` and `>` escaped,
 * so that a folder name cannot end the block or add lines to it.
 */
export function renderWorkingDirectoriesContext(folders: readonly IWorkingDirectoryContext[]): string {
	const quote = (path: string) => JSON.stringify(path).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
	const describe = (folder: IWorkingDirectoryContext) => folder.repositoryRoot === undefined
		? 'Not a Git repository.'
		: `Git repository root: ${quote(folder.repositoryRoot)}${folder.gitHubRepository ? ` (GitHub: ${folder.gitHubRepository})` : ''}.`;
	const [primary, ...additional] = folders;
	return [
		'<working_directories>',
		'You have read and write access to all of the following folders. Use absolute paths to work in a folder other than the current working directory.',
		`* Primary folder: ${quote(primary.path)} (the current working directory). ${describe(primary)}`,
		...additional.map(folder => `* Additional folder: ${quote(folder.path)}. ${describe(folder)}`),
		'</working_directories>',
	].join('\n');
}

/**
 * Tells the agent about every folder of a chat that works in several folders, as provider SDKs describe only the
 * process working directory. The list goes with the first turn and again with the next turn after the folders change,
 * including when a chat that had several folders is left with one, and once more after a host restart (the record is
 * in memory). Chats that only ever had one folder get nothing.
 */
export class WorkingDirectoriesContextContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workingDirectoriesContext';
	/** Precedes the workspace snapshot (175), which lists the same folders' files. */
	readonly order = 170;

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const workingDirectories = turn.workingDirectories ?? [];
		const sent = this._context.memento(sentFoldersMemento, turn.chat);
		if (!workingDirectories.length || (workingDirectories.length < 2 && sent.get() === undefined)) {
			return undefined;
		}
		const key = workingDirectories.map(directory => directory.toString()).join('\n');
		if (sent.get() === key) {
			return undefined;
		}
		const meta = this._stateManager.getSessionState(turn.session)?._meta;
		const folders = await Promise.all(workingDirectories.map(async (directory): Promise<IWorkingDirectoryContext> => {
			let repositoryRoot: URI | undefined;
			try {
				repositoryRoot = await this._gitService.getRepositoryRoot(directory);
			} catch (error) {
				this._logService.warn(`[WorkingDirectoriesContext] Failed to resolve the repository of ${directory.toString()}`, error);
			}
			const gitHub = repositoryRoot ? readSessionGitHubState(meta, directory.toString()) : undefined;
			return {
				path: toDisplayPath(directory),
				repositoryRoot: repositoryRoot && toDisplayPath(repositoryRoot),
				gitHubRepository: gitHub?.owner && gitHub.repo ? `${gitHub.owner}/${gitHub.repo}` : undefined,
			};
		}));
		sent.set(key, undefined);
		return { instructions: [renderWorkingDirectoriesContext(folders)] };
	}
}

function toDisplayPath(resource: URI): string {
	return resource.scheme === Schemas.file ? resource.fsPath : resource.toString();
}
