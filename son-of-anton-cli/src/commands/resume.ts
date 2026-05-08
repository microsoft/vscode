/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { listConversations, loadConversation } from '../persistence/ConversationStore';
import { runChat } from './chat';

interface ResumeOptions {
	output?: 'text' | 'json';
}

/**
 * Top-level `sota resume [id]` command. With an explicit id, hydrates that
 * conversation directly into a fresh chat session. Without an id, prints the
 * list of saved conversations to stdout so the user can pick one and rerun
 * with the chosen id. The interactive picker overlay lives inside the TUI
 * (`/resume` slash command) and isn't reused here so non-TTY callers get a
 * stable, scriptable surface.
 */
export async function runResume(idArg: string | undefined, opts: ResumeOptions): Promise<void> {
	const output = opts.output ?? 'text';

	if (!idArg) {
		const list = listConversations();
		if (output === 'json') {
			process.stdout.write(JSON.stringify(list, null, 2) + '\n');
			return;
		}
		if (list.length === 0) {
			process.stdout.write('No saved conversations.\n');
			return;
		}
		process.stdout.write('Saved conversations:\n');
		for (const summary of list) {
			const date = new Date(summary.updatedAt).toISOString();
			process.stdout.write(
				`  ${summary.id}  ${date}  @${summary.specialist}  ${summary.model}  · ${summary.title}\n`,
			);
		}
		process.stdout.write('\nResume with: sota resume <id>\n');
		return;
	}

	const record = loadConversation(idArg);
	if (!record) {
		process.stderr.write(`error: conversation ${idArg} not found\n`);
		process.exit(1);
	}

	await runChat({
		specialist: record.specialist,
		model: record.model,
		output,
		resumeFrom: record,
	});
}
