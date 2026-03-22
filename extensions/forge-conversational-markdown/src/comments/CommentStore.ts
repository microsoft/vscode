import * as vscode from 'vscode';
import type { BlockAnchor, CommentStoreFile, CommentThreadRecord, SelectionAnchor, ThreadAnchor } from '../protocol/types';

const STORE_VERSION = 1 as const;
const SIDECAR_SUFFIX = '.forge-comments.json';

export function sidecarUri(markdownUri: vscode.Uri): vscode.Uri {
	if (markdownUri.scheme !== 'file') {
		throw new Error('Conversational Markdown only supports file documents');
	}
	const p = markdownUri.fsPath;
	return vscode.Uri.file(p + SIDECAR_SUFFIX);
}

export async function loadCommentStore(markdownUri: vscode.Uri): Promise<CommentStoreFile> {
	const uri = sidecarUri(markdownUri);
	try {
		const raw = await vscode.workspace.fs.readFile(uri);
		const text = new TextDecoder().decode(raw);
		const parsed = JSON.parse(text) as CommentStoreFile;
		if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.threads)) {
			return emptyStore(markdownUri);
		}
		return {
			version: STORE_VERSION,
			documentPath: markdownUri.fsPath,
			threads: parsed.threads.map(normalizeThreadLoose),
		};
	} catch {
		return emptyStore(markdownUri);
	}
}

export async function saveCommentStore(markdownUri: vscode.Uri, threads: readonly CommentThreadRecord[]): Promise<void> {
	const uri = sidecarUri(markdownUri);
	const body: CommentStoreFile = {
		version: STORE_VERSION,
		documentPath: markdownUri.fsPath,
		threads: [...threads],
	};
	const data = new TextEncoder().encode(JSON.stringify(body, null, '\t'));
	await vscode.workspace.fs.writeFile(uri, data);
}

function emptyStore(markdownUri: vscode.Uri): CommentStoreFile {
	return {
		version: STORE_VERSION,
		documentPath: markdownUri.fsPath,
		threads: [],
	};
}

function normalizeThreadLoose(t: unknown): CommentThreadRecord {
	const r = t as CommentThreadRecord;
	const comments = (r.comments ?? []).map(c => ({
		id: String(c.id),
		authorName: String(c.authorName),
		bodyMd: String(c.bodyMd),
		createdAt: String(c.createdAt),
	}));
	return {
		id: String(r.id),
		status: r.status === 'resolved' || r.status === 'outdated' ? r.status : 'open',
		anchor: normalizeAnchor(r.anchor),
		comments: comments.length <= 1 ? comments : [comments[0]!],
		createdAt: String(r.createdAt),
		updatedAt: String(r.updatedAt),
	};
}

function normalizeAnchor(a: unknown): ThreadAnchor {
	if (a && typeof a === 'object' && (a as { kind?: string }).kind === 'selection') {
		const s = a as Partial<SelectionAnchor> & { markerId?: string };
		const startLine = Number.isFinite(s.startLine) ? Number(s.startLine) : 0;
		const endLine = Number.isFinite(s.endLine) ? Number(s.endLine) : startLine + 1;
		return {
			kind: 'selection',
			startLine,
			endLine: Math.max(endLine, startLine + 1),
			quotedText: String(s.quotedText ?? ''),
		};
	}
	const b = a as Partial<BlockAnchor>;
	return {
		kind: 'block',
		blockType: String(b.blockType ?? 'paragraph'),
		startLine: Number.isFinite(b.startLine) ? Number(b.startLine) : 0,
		endLine: Number.isFinite(b.endLine) ? Number(b.endLine) : 0,
		headingPath: Array.isArray(b.headingPath) ? b.headingPath.map(String) : [],
		ordinal: Number.isFinite(b.ordinal) ? Number(b.ordinal) : 0,
		textFingerprint: String(b.textFingerprint ?? ''),
		previewText: b.previewText !== undefined ? String(b.previewText) : undefined,
	};
}
