import * as path from 'path';
import * as vscode from 'vscode';
import { ClaudeCodeAgentService } from '../agents/impl/claude-code-agent-service';
import { applyResolvedAnchors, resolveThreadsToBlocks } from '../comments/AnchorResolver';
import { newCommentId, newThreadId, nowIso, type MutableCommentThreadRecord } from '../comments/ThreadModel';
import { parseMarkdownToBlocks } from '../markdown/BlockParser';
import type { BlockAnchor, CommentThreadRecord, FromWebviewMessage, RenderableBlock, ThreadForBlock, ToWebviewMessage } from '../protocol/types';
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

/** Replace the open text buffer with the file on disk (e.g. after Claude writes the file externally). */
async function syncOpenDocumentFromDisk(uri: vscode.Uri): Promise<void> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	const text = new TextDecoder('utf-8').decode(bytes);
	const doc = await vscode.workspace.openTextDocument(uri);
	const full = doc.getText();
	const end = doc.positionAt(full.length);
	const edit = new vscode.WorkspaceEdit();
	edit.replace(uri, new vscode.Range(new vscode.Position(0, 0), end), text);
	await vscode.workspace.applyEdit(edit);
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

		/** Session-only comment threads (not persisted to disk or embedded in the `.md` file). */
		const threads: MutableCommentThreadRecord[] = [];

		const pushUpdate = () => {
			const text = document.getText();
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
		const claudeAgent = new ClaudeCodeAgentService();

		const postClaudeStatus = (threadId: string, phase: 'loading' | 'success' | 'error') => {
			const msg: ToWebviewMessage = { type: 'claudeThreadStatus', threadId, phase };
			void webviewPanel.webview.postMessage(msg);
		};

		const threadRecordForAgent = (t: (typeof threads)[number]): CommentThreadRecord => ({
			...t,
			comments: [...t.comments],
			anchor: t.anchor.kind === 'block' ? { ...t.anchor, headingPath: [...t.anchor.headingPath] } : { ...t.anchor },
		});

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
					pushUpdate();
					break;
				}
				case 'fixWithClaude': {
					const thread = threads.find(x => x.id === raw.threadId);
					if (!thread) {
						return;
					}
					const ws = vscode.workspace.getWorkspaceFolder(document.uri);
					const fileDir = path.dirname(document.uri.fsPath);
					const cwd = ws?.uri.fsPath ?? (fileDir.length > 0 ? fileDir : process.cwd());
					postClaudeStatus(raw.threadId, 'loading');
					try {
						await claudeAgent.sendThreadToClaude(
							threadRecordForAgent(thread),
							document.uri.toString(),
							document.uri.fsPath,
							cwd,
						);
						await syncOpenDocumentFromDisk(document.uri);
						pushUpdate();
						postClaudeStatus(raw.threadId, 'success');
					} catch (e) {
						postClaudeStatus(raw.threadId, 'error');
						const msg = e instanceof Error ? e.message : String(e);
						void vscode.window.showErrorMessage(`Claude: ${msg}`);
					}
					break;
				}
				case 'deleteThread': {
					const thread = threads.find(x => x.id === raw.threadId);
					if (!thread) {
						return;
					}
					if (!raw.silent) {
						const confirm = await vscode.window.showWarningMessage(
							'Delete this comment thread?',
							{ modal: true },
							'Delete',
						);
						if (confirm !== 'Delete') {
							return;
						}
					}
					const idx = threads.findIndex(t => t.id === raw.threadId);
					if (idx >= 0) {
						threads.splice(idx, 1);
					}
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
					const startLine = Math.min(sb.startLine, eb.startLine);
					const endLine = Math.max(sb.endLine, eb.endLine);
					const tid = newThreadId();
					const t = nowIso();
					threads.push({
						id: tid,
						status: 'open',
						anchor: {
							kind: 'selection',
							startLine,
							endLine,
							quotedText: raw.text,
						},
						comments: [],
						createdAt: t,
						updatedAt: t,
					});
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

		webviewPanel.onDidDispose(() => {
			reg.dispose();
			sub.dispose();
			docSub.dispose();
		});

		pushUpdate();
	}

	public constructor(private readonly context: vscode.ExtensionContext) { }
}
