/** @jsxImportSource preact */

import type { ClaudeThreadPhase, FromWebviewMessage, RenderableBlock, ThreadForBlock } from '../../src/protocol/types';
import { CommentThreadRow } from './CommentThreadRow';
import { OutdatedThreads } from './OutdatedThreads';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface CommentsSidebarProps {
	readonly blocks: readonly RenderableBlock[];
	readonly threads: readonly ThreadForBlock[];
	readonly outdated: readonly ThreadForBlock[];
	readonly vscode: VsApi;
	readonly claudeByThread: Readonly<Partial<Record<string, ClaudeThreadPhase>>>;
}

function sortAnchoredThreads(list: readonly ThreadForBlock[]): ThreadForBlock[] {
	return [...list].sort((a, b) => {
		const ai = a.blockIndex ?? 0;
		const bi = b.blockIndex ?? 0;
		if (ai !== bi) {
			return ai - bi;
		}
		return a.thread.id.localeCompare(b.thread.id);
	});
}

export function CommentsSidebar(props: CommentsSidebarProps): preact.JSX.Element {
	const { blocks, threads, outdated, vscode, claudeByThread } = props;

	const anchored = sortAnchoredThreads(threads);

	return (
		<div class="forge-cmd-comments-panel">
			<div class="forge-cmd-comments-head">
				<span class="forge-cmd-comments-head-label">Comments</span>
			</div>
			<div class="forge-cmd-comments-scroll">
				<div class="forge-cmd-comments-inner">
					{anchored.length === 0 && outdated.length === 0 ? (
						<p class="forge-cmd-comments-hint">
							Select text in the preview, then click the <strong class="forge-cmd-inline-plus">+</strong> button
							beside the selection to start a thread.
						</p>
					) : null}
					<div class="forge-cmd-thread-list">
						{anchored.map(tfb => (
							<CommentThreadRow
								key={tfb.thread.id}
								tfb={tfb}
								blocks={blocks}
								vscode={vscode}
								claudePhase={claudeByThread[tfb.thread.id]}
							/>
						))}
					</div>
					{outdated.length > 0 ? (
						<OutdatedThreads threads={outdated} vscode={vscode} claudeByThread={claudeByThread} />
					) : null}
				</div>
			</div>
		</div>
	);
}
