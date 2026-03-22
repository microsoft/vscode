import * as path from 'path';
import * as vscode from 'vscode';
import { applyResolvedAnchors, resolveThreadsToBlocks } from '../comments/AnchorResolver';
import { loadCommentStore, saveCommentStore, sidecarUri } from '../comments/CommentStore';
import { mergeDocumentMarkersIntoThreads } from '../comments/markerThreadMerge';
import { insertSelectionCommentMarkers } from '../comments/selectionCommentEdit';
import { newCommentId, newThreadId, nowIso, type MutableCommentThreadRecord } from '../comments/ThreadModel';
import { parseMarkdownToBlocks } from '../markdown/BlockParser';
import { stripForgeMarkerPairByMarkerId, threadIdForMarker } from '../markdown/forgeMarkers';
import type { BlockAnchor, FromWebviewMessage, RenderableBlock, ThreadForBlock, ToWebviewMessage } from '../protocol/types';
import { registerForgeMdSession, type ForgeMdSession } from './sessionRegistry';

const viewType = 'forge.conversationalMarkdown';

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function anchorFromBlock(block: RenderableBlock): BlockAnchor {
	return {
		kind: 'block',
		blockType: block.blockType,
		startLine: block.startLine,
		endLine: block.endLine,
		headingPath: [...block.headingPath],
		ordinal: block.ordinal,
		textFingerprint: block.textFingerprint,
		previewText: block.previewText.slice(0, 200),
	};
}

export class ConversationalMarkdownEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = viewType;

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
			],
		};

		const nonce = getNonce();
		const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js'));
		const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

		webviewPanel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webviewPanel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webviewPanel.webview.cspSource} https: data:;">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${styleUri}" rel="stylesheet" />
	<title>Conversational Markdown</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;

		let threads: MutableCommentThreadRecord[] = [];
		let saveTimer: ReturnType<typeof setTimeout> | undefined;
		let lastSerialized = '';

		const loadThreads = async () => {
			const store = await loadCommentStore(document.uri);
			threads = store.threads.map(t => ({
				id: t.id,
				status: t.status,
				anchor:
					t.anchor.kind === 'selection'
						? { ...t.anchor }
						: { ...t.anchor, headingPath: [...t.anchor.headingPath] },
				comments: t.comments.map(c => ({ ...c })),
				createdAt: t.createdAt,
				updatedAt: t.updatedAt,
			}));
		};

		const scheduleSave = () => {
			if (saveTimer) {
				clearTimeout(saveTimer);
			}
			saveTimer = setTimeout(async () => {
				saveTimer = undefined;
				const next = JSON.stringify(threads);
				if (next === lastSerialized) {
					return;
				}
				lastSerialized = next;
				try {
					await saveCommentStore(document.uri, threads);
				} catch (e) {
					void vscode.window.showErrorMessage(`Could not save comment file: ${e}`);
				}
			}, 400);
		};

		const pushUpdate = () => {
			const text = document.getText();
			const threadCountBeforeMerge = threads.length;
			mergeDocumentMarkersIntoThreads(text, threads, nowIso);
			if (threads.length > threadCountBeforeMerge) {
				scheduleSave();
			}
			const blocks = parseMarkdownToBlocks(text);
			const resolved = resolveThreadsToBlocks(threads, blocks, text);
			applyResolvedAnchors(threads, resolved);
			const threadPayload: ThreadForBlock[] = resolved.map(r => ({
				thread: {
					...r.thread,
					status: r.updatedStatus,
					anchor: r.updatedAnchor,
					comments: [...r.thread.comments],
				},
				blockIndex: r.blockIndex,
			}));
			const msg: ToWebviewMessage = {
				type: 'update',
				documentUri: document.uri.toString(),
				blocks,
				threads: threadPayload,
			};
			void webviewPanel.webview.postMessage(msg);
		};

		const session: ForgeMdSession = {
			documentUri: document.uri,
			refresh: () => pushUpdate(),
			showSource: async () => {
				await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', webviewPanel.viewColumn ?? vscode.ViewColumn.Active);
			},
			revealNextOpenThread: (fromThreadId?: string) => {
				const msg: ToWebviewMessage = { type: 'revealNextOpen', fromThreadId };
				void webviewPanel.webview.postMessage(msg);
			},
		};

		const reg = registerForgeMdSession(session);

		const sub = webviewPanel.webview.onDidReceiveMessage(async (raw: FromWebviewMessage) => {
			switch (raw.type) {
				case 'ready':
					pushUpdate();
					break;
				case 'showSource':
					await session.showSource();
					break;
				case 'speEngineer':
					await vscode.commands.executeCommand('forgeMarkdown.speEngineer', document.uri);
					break;
				case 'refresh':
					pushUpdate();
					break;
				case 'addThread': {
					const text = document.getText();
					const blocks = parseMarkdownToBlocks(text);
					const block = blocks[raw.blockIndex];
					if (!block) {
						return;
					}
					const t = nowIso();
					const thread: MutableCommentThreadRecord = {
						id: newThreadId(),
						status: 'open',
						anchor: anchorFromBlock(block),
						comments: [
							{
								id: newCommentId(),
								authorName: 'You',
								bodyMd: raw.body,
								createdAt: t,
							},
						],
						createdAt: t,
						updatedAt: t,
					};
					threads.push(thread);
					scheduleSave();
					pushUpdate();
					break;
				}
				case 'reply': {
					const thread = threads.find(x => x.id === raw.threadId);
					if (!thread) {
						return;
					}
					const body = raw.body.trim();
					if (!body) {
						return;
					}
					const t = nowIso();
					if (thread.comments.length === 0) {
						thread.comments = [
							{
								id: newCommentId(),
								authorName: 'You',
								bodyMd: body,
								createdAt: t,
							},
						];
					} else {
						const first = thread.comments[0]!;
						thread.comments = [{ ...first, bodyMd: body }];
					}
					thread.updatedAt = t;
					scheduleSave();
					pushUpdate();
					break;
				}
				case 'deleteThread': {
					const thread = threads.find(x => x.id === raw.threadId);
					if (!thread) {
						return;
					}
					const confirm = await vscode.window.showWarningMessage(
						'Delete this comment thread? For selection comments, forge markers are removed from the Markdown file.',
						{ modal: true },
						'Delete',
					);
					if (confirm !== 'Delete') {
						return;
					}
					if (thread.anchor.kind === 'selection') {
						const full = document.getText();
						const stripped = stripForgeMarkerPairByMarkerId(full, thread.anchor.markerId);
						if (stripped !== null) {
							const edit = new vscode.WorkspaceEdit();
							const docEnd = document.positionAt(full.length);
							edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), docEnd), stripped);
							const applied = await vscode.workspace.applyEdit(edit);
							if (!applied) {
								void vscode.window.showErrorMessage(
									'Could not update the Markdown file; the thread was kept.',
								);
								return;
							}
						} else {
							void vscode.window.showWarningMessage(
								'Comment markers were not found in the Markdown file. The thread was removed from the comment list only.',
							);
						}
					}
					threads = threads.filter(t => t.id !== raw.threadId);
					scheduleSave();
					pushUpdate();
					break;
				}
				case 'selectionComment': {
					const src = document.getText();
					const blocksNow = parseMarkdownToBlocks(src);
					const sb = blocksNow[raw.startBlockIndex];
					const eb = blocksNow[raw.endBlockIndex];
					if (!sb || !eb) {
						void vscode.window.showWarningMessage('Could not map the selection to document sections.');
						return;
					}
					const ins = await insertSelectionCommentMarkers(
						document,
						raw.text,
						sb.startLine,
						eb.endLine,
					);
					if (!ins.ok) {
						void vscode.window.showWarningMessage(ins.reason);
						return;
					}
					const tid = threadIdForMarker(ins.markerId);
					if (!threads.some(x => x.id === tid)) {
						const t = nowIso();
						threads.push({
							id: tid,
							status: 'open',
							anchor: {
								kind: 'selection',
								markerId: ins.markerId,
								quotedText: raw.text,
								anchorLine: 0,
							},
							comments: [],
							createdAt: t,
							updatedAt: t,
						});
					}
					scheduleSave();
					pushUpdate();
					const focusMsg: ToWebviewMessage = { type: 'focusThread', threadId: tid };
					void webviewPanel.webview.postMessage(focusMsg);
					break;
				}
				default:
					break;
			}
		});

		const docSub = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				pushUpdate();
			}
		});

		const sidecar = sidecarUri(document.uri);
		const sidecarDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
		const sidecarName = path.basename(sidecar.fsPath);
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(sidecarDir, sidecarName));
		watcher.onDidChange(() => {
			void loadThreads().then(() => pushUpdate());
		});

		webviewPanel.onDidDispose(() => {
			reg.dispose();
			sub.dispose();
			docSub.dispose();
			watcher.dispose();
			if (saveTimer) {
				clearTimeout(saveTimer);
			}
		});

		await loadThreads();
		lastSerialized = JSON.stringify(threads);
		pushUpdate();
	}

	public constructor(private readonly context: vscode.ExtensionContext) { }
}
