/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** @jsxImportSource preact */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { CommentThreadRecord, FromWebviewMessage } from '../../src/protocol/types';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface ThreadViewProps {
	readonly thread: CommentThreadRecord;
	readonly vscode: VsApi;
	readonly variant?: 'default' | 'outdated';
}

export function ThreadView(props: ThreadViewProps): preact.JSX.Element {
	const { thread, vscode, variant = 'default' } = props;
	const single = thread.comments[0];
	const savedBody = single?.bodyMd ?? '';
	const [draft, setDraft] = useState(savedBody);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuWrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setDraft(thread.comments[0]?.bodyMd ?? '');
	}, [thread.id, thread.updatedAt, thread.comments[0]?.bodyMd]);

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
	const canSave = trimmed.length > 0 && (!hasReply || dirty);

	const selectionRef = thread.anchor.kind === 'selection' ? thread.anchor.quotedText : null;
	const excerpt =
		selectionRef && selectionRef.length > 360 ? `${selectionRef.slice(0, 360)}…` : selectionRef;

	return (
		<div
			class={`forge-cmd-thread ${variant === 'outdated' ? 'forge-cmd-thread-outdated' : ''}`}
			data-thread-id={thread.id}
		>
			{excerpt ? (
				<blockquote class="forge-cmd-selection-ref" title="Quoted from the document">
					{excerpt}
				</blockquote>
			) : null}
			<div class="forge-cmd-thread-meta">
				<div class="forge-cmd-thread-meta-lead">
					{single ? (
						<>
							<strong>{single.authorName}</strong>
							<span class="forge-cmd-time">{single.createdAt}</span>
						</>
					) : (
						<span class="forge-cmd-thread-empty">No message yet.</span>
					)}
				</div>
				<div class="forge-cmd-thread-menu-wrap" ref={menuWrapRef}>
					<button
						type="button"
						class="forge-cmd-thread-menu-trigger"
						aria-label="Thread actions"
						aria-expanded={menuOpen}
						aria-haspopup="menu"
						onClick={() => setMenuOpen(o => !o)}
					>
						<span class="forge-cmd-thread-menu-icon" aria-hidden="true">
							⋯
						</span>
					</button>
					{menuOpen ? (
						<div class="forge-cmd-thread-menu" role="menu">
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
			<div class="forge-cmd-reply">
				<textarea
					class="forge-cmd-input"
					placeholder={hasReply ? 'Edit your message…' : 'Write a message…'}
					value={draft}
					onInput={e => setDraft((e.target as HTMLTextAreaElement).value)}
					rows={hasReply ? 3 : 2}
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
