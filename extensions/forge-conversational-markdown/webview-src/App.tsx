/** @jsxImportSource preact */

import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ClaudeThreadPhase, FromWebviewMessage, RenderableBlock, ThreadForBlock, ToWebviewMessage } from '../src/protocol/types';
import { AppToolbar } from './components/AppToolbar';
import { CommentsSidebar } from './components/CommentsSidebar';
import { MarkdownPreviewPanel } from './components/MarkdownPreviewPanel';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface AppProps {
	readonly vscode: VsApi;
}

function scrollThreadIntoView(threadId: string) {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			document
				.querySelector(`[data-thread-id="${CSS.escape(threadId)}"]`)
				?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	});
}

export function App(props: AppProps): preact.JSX.Element {
	const { vscode } = props;
	const [blocks, setBlocks] = useState<readonly RenderableBlock[]>([]);
	const [threads, setThreads] = useState<readonly ThreadForBlock[]>([]);
	const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
	const [claudeByThread, setClaudeByThread] = useState<Partial<Record<string, ClaudeThreadPhase>>>({});

	const applyUpdate = useCallback((msg: Extract<ToWebviewMessage, { type: 'update' }>) => {
		setBlocks(msg.blocks);
		setThreads(msg.threads);
	}, []);

	useEffect(() => {
		const ids = new Set(threads.map(t => t.thread.id));
		setClaudeByThread(prev => {
			let changed = false;
			const next = { ...prev };
			for (const k of Object.keys(next)) {
				if (!ids.has(k)) {
					delete next[k];
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [threads]);

	const outdated = threads.filter(t => t.blockIndex === null);
	const anchoredThreads = threads.filter(t => t.blockIndex !== null);

	const revealNextOpenThread = useCallback(
		(fromThreadId?: string) => {
			const open = threads.filter(
				(t): t is ThreadForBlock & { blockIndex: number } =>
					t.thread.status === 'open' && t.blockIndex !== null,
			);
			if (open.length === 0) {
				return;
			}
			open.sort((a, b) => {
				if (a.blockIndex !== b.blockIndex) {
					return a.blockIndex - b.blockIndex;
				}
				return a.thread.id.localeCompare(b.thread.id);
			});
			let start = 0;
			if (fromThreadId) {
				const i = open.findIndex(t => t.thread.id === fromThreadId);
				if (i >= 0) {
					start = (i + 1) % open.length;
				}
			}
			const next = open[start];
			if (!next) {
				return;
			}
			setCommentsPanelOpen(true);
			scrollThreadIntoView(next.thread.id);
		},
		[threads],
	);

	useEffect(() => {
		const onMessage = (event: MessageEvent<ToWebviewMessage>) => {
			const msg = event.data;
			if (!msg || typeof msg !== 'object') {
				return;
			}
			if (msg.type === 'update') {
				applyUpdate(msg);
				return;
			}
			if (msg.type === 'revealNextOpen') {
				revealNextOpenThread(msg.fromThreadId);
				return;
			}
			if (msg.type === 'focusThread') {
				setCommentsPanelOpen(true);
				scrollThreadIntoView(msg.threadId);
				return;
			}
			if (msg.type === 'claudeThreadStatus') {
				if (msg.phase === 'error') {
					setClaudeByThread(prev => {
						const n = { ...prev };
						delete n[msg.threadId];
						return n;
					});
					return;
				}
				setClaudeByThread(prev => ({ ...prev, [msg.threadId]: msg.phase }));
			}
		};
		window.addEventListener('message', onMessage);
		vscode.postMessage({ type: 'ready' });
		return () => window.removeEventListener('message', onMessage);
	}, [vscode, applyUpdate, revealNextOpenThread]);

	const showCommentsColumn = commentsPanelOpen;

	return (
		<div class="forge-cmd-root">
			<AppToolbar hasComments={threads.length > 0} vscode={vscode} />
			<div class={showCommentsColumn ? 'forge-cmd-split' : 'forge-cmd-split forge-cmd-split-collapsed'}>
				<MarkdownPreviewPanel blocks={blocks} vscode={vscode} />
				{showCommentsColumn ? (
					<CommentsSidebar
						blocks={blocks}
						threads={anchoredThreads}
						outdated={outdated}
						vscode={vscode}
						claudeByThread={claudeByThread}
					/>
				) : null}
			</div>
		</div>
	);
}
