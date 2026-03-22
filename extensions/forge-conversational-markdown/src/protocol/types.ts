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

/** Anchored by HTML comment markers in the `.md` source (`<!-- forge-cmt:… -->`). */
export interface SelectionAnchor {
	readonly kind: 'selection';
	readonly markerId: string;
	readonly quotedText: string;
	/** 0-based source line of the opening marker (for display / debugging). */
	readonly anchorLine: number;
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
	};

export type FromWebviewMessage =
	| { readonly type: 'ready' }
	| { readonly type: 'showSource' }
	| { readonly type: 'speEngineer' }
	| { readonly type: 'refresh' }
	| { readonly type: 'addThread'; readonly blockIndex: number; readonly body: string }
	| { readonly type: 'reply'; readonly threadId: string; readonly body: string }
	| { readonly type: 'deleteThread'; readonly threadId: string }
	| {
		readonly type: 'selectionComment';
		readonly text: string;
		readonly startBlockIndex: number;
		readonly endBlockIndex: number;
	};
