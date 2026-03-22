/** @jsxImportSource preact */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ClaudeThreadPhase, CommentThreadRecord, FromWebviewMessage } from '../../src/protocol/types';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface ThreadViewProps {
	readonly thread: CommentThreadRecord;
	readonly vscode: VsApi;
	readonly variant?: 'default' | 'outdated';
	readonly claudePhase?: ClaudeThreadPhase;
}

export function ThreadView(props: ThreadViewProps): preact.JSX.Element {
	const { thread, vscode, variant = 'default', claudePhase } = props;
	const single = thread.comments[0];
	const savedBody = single?.bodyMd ?? '';
	const [draft, setDraft] = useState(savedBody);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuWrapRef = useRef<HTMLDivElement>(null);

	const loading = claudePhase === 'loading';
	const success = claudePhase === 'success';

	useEffect(() => {
		setDraft(thread.comments[0]?.bodyMd ?? '');
	}, [thread.id, thread.updatedAt, thread.comments[0]?.bodyMd]);

	useEffect(() => {
		if (!success) {
			return;
		}
		const t = window.setTimeout(() => {
			vscode.postMessage({ type: 'deleteThread', threadId: thread.id, silent: true });
		}, 900);
		return () => clearTimeout(t);
	}, [success, thread.id, vscode]);

	useEffect(() => {
		if (!menuOpen) {
			return;
		}
		const onDocMouseDown = (e: MouseEvent) => {
			if (!menuWrapRef.current?.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', onDocMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onDocMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [menuOpen]);

	const hasReply = Boolean(single);
	const trimmed = draft.trim();
	const savedTrimmed = savedBody.trim();
	const dirty = trimmed !== savedTrimmed;
	const canSave = trimmed.length > 0 && (!hasReply || dirty) && !loading && !success;

	const selectionRef = thread.anchor.kind === 'selection' ? thread.anchor.quotedText : null;
	const excerpt =
		selectionRef && selectionRef.length > 360 ? `${selectionRef.slice(0, 360)}…` : selectionRef;

	const rootClass = [
		'forge-cmd-thread',
		variant === 'outdated' ? 'forge-cmd-thread-outdated' : '',
		success ? 'forge-cmd-thread-claude-success' : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div class={rootClass} data-thread-id={thread.id}>
			<div class="forge-cmd-thread-meta">
				<div class="forge-cmd-thread-menu-wrap" ref={menuWrapRef}>
					<button
						type="button"
						class="forge-cmd-thread-menu-trigger"
						aria-label={loading ? 'Claude is running' : 'Thread actions'}
						aria-expanded={menuOpen}
						aria-haspopup="menu"
						aria-busy={loading}
						disabled={loading || success}
						onClick={() => {
							if (loading || success) {
								return;
							}
							setMenuOpen(o => !o);
						}}
					>
						{loading ? (
							<span class="forge-cmd-thread-menu-spinner" aria-hidden="true" />
						) : (
							<span class="forge-cmd-thread-menu-icon" aria-hidden="true">
								⋯
							</span>
						)}
					</button>
					{menuOpen && !loading && !success ? (
						<div class="forge-cmd-thread-menu" role="menu">
							<button
								type="button"
								class="forge-cmd-thread-menu-item"
								role="menuitem"
								onClick={() => {
									setMenuOpen(false);
									vscode.postMessage({ type: 'fixWithClaude', threadId: thread.id });
								}}
							>
								Fix with Spec Engineer
							</button>
							<button
								type="button"
								class="forge-cmd-thread-menu-item forge-cmd-thread-menu-item-danger"
								role="menuitem"
								onClick={() => {
									setMenuOpen(false);
									vscode.postMessage({ type: 'deleteThread', threadId: thread.id });
								}}
							>
								Delete
							</button>
						</div>
					) : null}
				</div>
			</div>
			{excerpt ? (
				<blockquote class="forge-cmd-selection-ref" title="Quoted from the document">
					{excerpt}
				</blockquote>
			) : null}
			<div class="forge-cmd-reply">
				<textarea
					class="forge-cmd-input"
					placeholder={hasReply ? 'Edit your message…' : 'Write a message…'}
					value={draft}
					onInput={e => setDraft((e.target as HTMLTextAreaElement).value)}
					rows={hasReply ? 3 : 2}
					disabled={loading || success}
				/>
				{canSave ? (
					<button
						type="button"
						class="forge-cmd-btn forge-cmd-btn-primary"
						onClick={() => {
							if (!trimmed) {
								return;
							}
							vscode.postMessage({ type: 'reply', threadId: thread.id, body: trimmed });
						}}
					>
						Save
					</button>
				) : null}
			</div>
		</div>
	);
}
