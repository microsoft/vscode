/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { appendEscapedMarkdownCodeBlockFence } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceTree, type IResourceNode } from '../../../../../base/common/resourceTree.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { compare } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext, type IOutgoingTurn, type ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import type { Turn } from '../../../common/state/sessionState.js';
import { resolveAgentHostFileCompletionRoots } from '../../agentHostFileCompletionUtils.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostWorkspaceFiles, type IAgentHostWorkspaceFilesResult } from '../../agentHostWorkspaceFiles.js';

const firstTurnSeenMemento = createChatMementoKey<boolean>('firstTurnSeen', () => false);
const MAX_STRUCTURE_LENGTH = 2000;
const SNAPSHOT_TIMEOUT_MS = 2000;
type WorkspaceNode = IResourceNode<true, undefined>;

/** Supplies an initial file-name snapshot without changing the user's task text. */
export class WorkspaceContextContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workspaceContext';
	readonly order = 200;
	private readonly _workspaceFiles: AgentHostWorkspaceFiles;

	constructor(
		private readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService logService: ILogService,
	) {
		super();
		this._workspaceFiles = this._register(new AgentHostWorkspaceFiles(logService));
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const state = this._stateManager.getSessionState(turn.chat);
		if (state?.provider !== 'copilotcli') {
			return undefined;
		}
		const firstTurnSeen = this._context.memento(firstTurnSeenMemento, turn.chat);
		if (firstTurnSeen.get()) {
			return undefined;
		}
		firstTurnSeen.set(true, undefined);
		const { enumerationRoots } = resolveAgentHostFileCompletionRoots((state.workingDirectories ?? []).map(directory => URI.parse(directory)));
		if (enumerationRoots.length === 0) {
			return undefined;
		}

		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource());
		store.add(disposableTimeout(() => cancellation.cancel(), SNAPSHOT_TIMEOUT_MS));
		try {
			const budget = Math.floor(MAX_STRUCTURE_LENGTH / enumerationRoots.length);
			const structures = await Promise.all(enumerationRoots.map(async root => {
				const heading = JSON.stringify(root.fsPath).slice(1, -1);
				const result = await this._workspaceFiles.getFiles(root, cancellation.token);
				const tree = renderWorkspaceTree(root, result, budget - heading.length - 3);
				return tree ? `${heading}\n${tree}` : '';
			}));
			const structure = structures.filter(Boolean).join('\n\n');
			if (!structure) {
				return undefined;
			}
			return {
				instructions: [`<workspace_info>\nInitial workspace structure (file names only):\n${appendEscapedMarkdownCodeBlockFence(structure, 'text')}\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>`],
			};
		} finally {
			store.dispose();
		}
	}

	onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] {
		if (turns.length > 0) {
			this._context.memento(firstTurnSeenMemento, context.chat).set(true, undefined);
		}
		return turns;
	}
}

function sortedChildren(node: WorkspaceNode): WorkspaceNode[] {
	return [...node.children].sort((a, b) => Number(a.element === undefined) - Number(b.element === undefined) || compare(a.name, b.name));
}

function renderWorkspaceTree(root: URI, result: IAgentHostWorkspaceFilesResult, maxLength: number): string {
	if (maxLength < 4) {
		return '';
	}
	const tree = new ResourceTree<true, undefined>(undefined, root, extUriBiasedIgnorePathCase);
	for (const file of result.files) {
		const path = extUriBiasedIgnorePathCase.relativePath(root, file);
		if (!path || path.split(/[\\/]/).some(segment => segment.startsWith('.') || segment === 'node_modules')) {
			continue;
		}
		tree.add(file, true);
	}

	const selected = new Map<WorkspaceNode, string>();
	const queue = sortedChildren(tree.root).map(node => ({ node, depth: 0 }));
	let length = 0;
	let truncated = result.isTruncated;
	for (let index = 0; index < queue.length; index++) {
		const { node, depth } = queue[index];
		const name = JSON.stringify(node.name).slice(1, -1);
		const line = `${'\t'.repeat(depth)}${name}${node.childrenCount ? '/' : ''}`;
		if (length + line.length + 1 > maxLength - 4) {
			truncated = true;
			break;
		}
		selected.set(node, line);
		length += line.length + 1;
		queue.push(...sortedChildren(node).map(child => ({ node: child, depth: depth + 1 })));
	}
	if (selected.size === 0) {
		return '';
	}
	const lines: string[] = [];
	const render = (node: WorkspaceNode): void => {
		const line = selected.get(node);
		if (line !== undefined) {
			lines.push(line);
			for (const child of sortedChildren(node)) {
				render(child);
			}
		}
	};
	for (const node of sortedChildren(tree.root)) {
		render(node);
	}
	if (truncated) {
		lines.push('...');
	}
	return lines.join('\n');
}
