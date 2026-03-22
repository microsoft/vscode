import { spawn } from 'child_process';
import type { AgentService } from '../agent-service';
import type { CommentThreadRecord } from '../../protocol/types';

function buildPrompt(
	thread: CommentThreadRecord,
	documentUri: string,
	documentFsPath: string,
	cwd: string,
): string {
	return [
		'You are assisting with a conversational Markdown comment thread in VS Code.',
		'',
		`Working directory (Claude Code cwd): ${cwd}`,
		`Target document (URI): ${documentUri}`,
		`Target file on disk (YOU MUST EDIT THIS FILE): ${documentFsPath}`,
		'',
		'Comment thread (JSON):',
		JSON.stringify(thread, null, 2),
		'',
		'Instructions:',
		'- Use your file-editing tools to modify the Markdown file at the path above.',
		'- Persist changes to disk (save the file). Do not only describe changes in chat — apply them.',
		'- Resolve the comment thread by updating the document content as appropriate.',
	].join('\n');
}

const LOG_PREFIX = '[forge-conversational-markdown][claude]';

function claudeDebugLog(...args: unknown[]): void {
	if (process.env.FORGE_CLAUDE_DEBUG === '1' || process.env.FORGE_CLAUDE_DEBUG === 'true') {
		console.info(LOG_PREFIX, ...args);
	}
}

function runClaudePrint(prompt: string, cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		claudeDebugLog('cwd=', cwd);
		// Headless runs need permission bypass or tool prompts block writes; user runs in their repo.
		const child = spawn(
			'claude',
			['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'text'],
			{
				cwd,
				shell: false,
				env: process.env,
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
		let stdout = '';
		let stderr = '';
		child.stdout?.setEncoding('utf8');
		child.stdout?.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.setEncoding('utf8');
		child.stderr?.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', err => {
			reject(
				new Error(
					(err as NodeJS.ErrnoException).code === 'ENOENT'
						? 'Claude CLI not found. Install Claude Code and ensure `claude` is on your PATH.'
						: String(err),
				),
			);
		});
		child.on('close', code => {
			if (stdout.trim()) {
				claudeDebugLog(`full stdout (${stdout.length} chars):\n${stdout}`);
			}
			if (stderr.trim()) {
				claudeDebugLog(`full stderr (${stderr.length} chars):\n${stderr}`);
			}
			claudeDebugLog('exit code:', code);
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(stderr.trim() || `claude exited with code ${code}`));
			}
		});
	});
}

export class ClaudeCodeAgentService implements AgentService {
	async sendThreadToClaude(
		thread: CommentThreadRecord,
		documentUri: string,
		documentFsPath: string,
		cwd: string,
	): Promise<void> {
		const prompt = buildPrompt(thread, documentUri, documentFsPath, cwd);
		await runClaudePrint(prompt, cwd);
	}
}
