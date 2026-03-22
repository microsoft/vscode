/** @jsxImportSource preact */

import type { ClaudeThreadPhase, FromWebviewMessage, RenderableBlock, ThreadForBlock } from '../../src/protocol/types';
import { ThreadView } from './ThreadView';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface CommentThreadRowProps {
	readonly tfb: ThreadForBlock;
	readonly blocks: readonly RenderableBlock[];
	readonly vscode: VsApi;
	readonly claudePhase?: ClaudeThreadPhase;
}

export function CommentThreadRow(props: CommentThreadRowProps): preact.JSX.Element {
	const { tfb, blocks, vscode, claudePhase } = props;
	const block =
		tfb.blockIndex !== null ? blocks.find(b => b.blockIndex === tfb.blockIndex) : undefined;

	return (
		<div class="forge-cmd-thread-row">
			{block ? (
				<div class="forge-cmd-thread-context">
					Lines {block.startLine + 1}-{block.endLine}, {block.blockType}
				</div>
			) : null}
			<ThreadView thread={tfb.thread} vscode={vscode} claudePhase={claudePhase} />
		</div>
	);
}
