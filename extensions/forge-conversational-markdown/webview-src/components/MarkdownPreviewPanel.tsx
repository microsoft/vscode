/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** @jsxImportSource preact */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { FromWebviewMessage, RenderableBlock } from '../../src/protocol/types';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface MarkdownPreviewPanelProps {
	readonly blocks: readonly RenderableBlock[];
	readonly vscode: VsApi;
}

interface PendingSelection {
	readonly text: string;
	readonly startBlockIndex: number;
	readonly endBlockIndex: number;
}

function closestBlockIndex(node: Node | null): number | null {
	const el = (node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null)) as
		| HTMLElement
		| null;
	const frag = el?.closest?.('[data-block-index]');
	const raw = frag?.getAttribute('data-block-index');
	if (raw === null || raw === '') {
		return null;
	}
	const n = Number.parseInt(raw || '0', 10);
	return Number.isFinite(n) ? n : null;
}

const PLUS_SIZE = 30;

function plusPositionForRange(range: Range): { top: number; left: number } {
	const rects = range.getClientRects();
	const r = rects.length > 0 ? rects[rects.length - 1]! : range.getBoundingClientRect();
	const pad = 6;
	let top = r.bottom + pad;
	let left = r.right + pad;
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	top = Math.min(Math.max(4, top), vh - PLUS_SIZE - 4);
	left = Math.min(Math.max(4, left), vw - PLUS_SIZE - 4);
	return { top, left };
}

export function MarkdownPreviewPanel(props: MarkdownPreviewPanelProps): preact.JSX.Element {
	const { blocks, vscode } = props;
	const debounceRef = useRef<number | undefined>(undefined);
	const pendingRef = useRef<PendingSelection | null>(null);
	const [plusPos, setPlusPos] = useState<{ top: number; left: number } | null>(null);

	const syncSelectionUi = useCallback(() => {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
			pendingRef.current = null;
			setPlusPos(null);
			return;
		}
		const range = sel.getRangeAt(0);
		const previewRoot = document.querySelector('.forge-cmd-preview-scroll');
		if (!previewRoot || !previewRoot.contains(range.commonAncestorContainer)) {
			pendingRef.current = null;
			setPlusPos(null);
			return;
		}
		const common = range.commonAncestorContainer;
		const commonEl =
			common.nodeType === Node.TEXT_NODE ? (common.parentElement as Element | null) : (common as Element);
		if (commonEl?.closest('.forge-cmd-comments-panel')) {
			pendingRef.current = null;
			setPlusPos(null);
			return;
		}
		const text = sel.toString();
		if (!text.trim()) {
			pendingRef.current = null;
			setPlusPos(null);
			return;
		}
		const startIdx = closestBlockIndex(range.startContainer);
		const endIdx = closestBlockIndex(range.endContainer);
		if (startIdx === null || endIdx === null) {
			pendingRef.current = null;
			setPlusPos(null);
			return;
		}
		pendingRef.current = { text, startBlockIndex: startIdx, endBlockIndex: endIdx };
		setPlusPos(plusPositionForRange(range));
	}, []);

	useEffect(() => {
		let cancelled = false;

		const cancelScheduledSync = () => {
			if (debounceRef.current !== undefined) {
				clearTimeout(debounceRef.current);
				debounceRef.current = undefined;
			}
		};

		const onSelectionChange = () => {
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
				cancelScheduledSync();
				if (!cancelled) {
					syncSelectionUi();
				}
				return;
			}

			const range = sel.getRangeAt(0);
			const previewRoot = document.querySelector('.forge-cmd-preview-scroll');
			if (!previewRoot?.contains(range.commonAncestorContainer)) {
				cancelScheduledSync();
				if (!cancelled) {
					syncSelectionUi();
				}
				return;
			}

			cancelScheduledSync();
			debounceRef.current = window.setTimeout(() => {
				debounceRef.current = undefined;
				if (cancelled) {
					return;
				}
				syncSelectionUi();
			}, 80);
		};

		document.addEventListener('selectionchange', onSelectionChange);
		return () => {
			cancelled = true;
			cancelScheduledSync();
			document.removeEventListener('selectionchange', onSelectionChange);
		};
	}, [syncSelectionUi]);

	useEffect(() => {
		const scrollRoot = document.querySelector('.forge-cmd-preview-scroll');
		if (!scrollRoot) {
			return;
		}
		const onScroll = () => {
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed || !pendingRef.current) {
				return;
			}
			const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
			if (!range || !scrollRoot.contains(range.commonAncestorContainer)) {
				return;
			}
			setPlusPos(plusPositionForRange(range));
		};
		scrollRoot.addEventListener('scroll', onScroll, { passive: true });
		return () => scrollRoot.removeEventListener('scroll', onScroll);
	}, [blocks]);

	const onAddCommentMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const p = pendingRef.current;
		if (!p) {
			return;
		}
		vscode.postMessage({
			type: 'selectionComment',
			text: p.text,
			startBlockIndex: p.startBlockIndex,
			endBlockIndex: p.endBlockIndex,
		});
		pendingRef.current = null;
		setPlusPos(null);
		window.getSelection()?.removeAllRanges();
	};

	return (
		<div class="forge-cmd-preview-panel">
			<div class="forge-cmd-preview-scroll">
				<div class="forge-cmd-preview-reading">
					<article class="forge-md-document forge-md-prose" aria-label="Markdown preview">
						{blocks.map(block => (
							<div
								key={block.blockIndex}
								class="forge-md-frag"
								data-block-index={String(block.blockIndex)}
								dangerouslySetInnerHTML={{ __html: block.html }}
							/>
						))}
					</article>
				</div>
			</div>
			{plusPos ? (
				<button
					type="button"
					class="forge-cmd-selection-plus"
					style={{ top: `${plusPos.top}px`, left: `${plusPos.left}px`, width: `${PLUS_SIZE}px`, height: `${PLUS_SIZE}px` }}
					aria-label="Add comment on selection"
					title="Add comment"
					onMouseDown={onAddCommentMouseDown}
				>
					<span class="forge-cmd-selection-plus-icon" aria-hidden="true">
						+
					</span>
				</button>
			) : null}
		</div>
	);
}
