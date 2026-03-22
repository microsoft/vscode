import type { CommentThreadRecord } from '../protocol/types';

export interface AgentService {
	/**
	 * @param documentUri vscode URI string (e.g. `file:///...`)
	 * @param documentFsPath Absolute filesystem path to the Markdown file (for tools / prompts)
	 * @param cwd Working directory for the Claude CLI (usually the workspace folder)
	 */
	sendThreadToClaude(
		thread: CommentThreadRecord,
		documentUri: string,
		documentFsPath: string,
		cwd: string,
	): Promise<void>;
}
