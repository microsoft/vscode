export interface BlockAnchor {
	readonly kind: 'block';
	readonly blockType: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly headingPath: readonly string[];
	readonly ordinal: number;
	readonly textFingerprint: string;
	readonly previewText?: string;
}

/** Selection comment: kept in memory only (not written into the Markdown file). */
export interface SelectionAnchor {
	readonly kind: 'selection';
	/** 0-based inclusive start line in the Markdown source. */
	readonly startLine: number;
	/** 0-based exclusive end line (same convention as `RenderableBlock`). */
	readonly endLine: number;
	/** Highlighted / quoted text from the preview selection. */
	readonly quotedText: string;
}

export type ThreadAnchor = BlockAnchor | SelectionAnchor;

export interface CommentMessage {
	readonly id: string;
	readonly authorName: string;
	readonly bodyMd: string;
	readonly createdAt: string;
}

export type ThreadStatus = 'open' | 'resolved' | 'outdated';

export interface CommentThreadRecord {
	readonly id: string;
	readonly status: ThreadStatus;
	readonly anchor: ThreadAnchor;
	readonly comments: readonly CommentMessage[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface CommentStoreFile {
	readonly version: 1;
	readonly documentPath: string;
	readonly threads: readonly CommentThreadRecord[];
}

export interface RenderableBlock {
	readonly blockIndex: number;
	readonly blockType: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly headingPath: readonly string[];
	readonly ordinal: number;
	readonly textFingerprint: string;
	readonly previewText: string;
	readonly html: string;
}

export interface ThreadForBlock {
	readonly thread: CommentThreadRecord;
	readonly blockIndex: number | null;
}

export type ClaudeThreadPhase = 'loading' | 'success' | 'error';

export type ToWebviewMessage =
	| {
		readonly type: 'update';
		readonly documentUri: string;
		readonly blocks: readonly RenderableBlock[];
		readonly threads: readonly ThreadForBlock[];
	}
	| {
		readonly type: 'revealNextOpen';
		readonly fromThreadId?: string;
	}
	| {
		readonly type: 'focusThread';
		readonly threadId: string;
	}
	| {
		readonly type: 'claudeThreadStatus';
		readonly threadId: string;
		readonly phase: ClaudeThreadPhase;
	};

export type FromWebviewMessage =
	| { readonly type: 'ready' }
	| { readonly type: 'showSource' }
	| { readonly type: 'speEngineer' }
	| { readonly type: 'refresh' }
	| { readonly type: 'addThread'; readonly blockIndex: number; readonly body: string }
	| { readonly type: 'reply'; readonly threadId: string; readonly body: string }
	| { readonly type: 'deleteThread'; readonly threadId: string; readonly silent?: boolean }
	| { readonly type: 'fixWithClaude'; readonly threadId: string }
	| {
		readonly type: 'selectionComment';
		readonly text: string;
		readonly startBlockIndex: number;
		readonly endBlockIndex: number;
	};
