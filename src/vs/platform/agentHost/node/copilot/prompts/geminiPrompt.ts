/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { agentHostPromptRegistry, type IAgentHostPrompt } from './promptRegistry.js';

const viewInstructions = `<view>
When reading multiple files or multiple sections of same file, call **view** multiple times in the same response - they are processed in parallel.
Files under 20KB (~400 lines) can be read in full without \`view_range\`. For larger files, locate target line numbers with \`grep\` first, then pass a \`view_range\` window of **200-350 lines** around the match so you capture the complete function or class in a single call instead of scrolling in small increments across multiple turns.
Do not set \`forceReadLargeFiles: true\` when \`grep\` + \`view_range\` can read the relevant section, and do not re-read line ranges that are already in context.
<example>
Make all these calls in the same response. Reads are parallel safe:

// read a small file in full
path: /repo/src/config.py

// read relevant 250-line window of a large file
path: /repo/src/main.py
view_range: [100, 350]

// read another section of main.py in parallel
path: /repo/src/main.py
view_range: [500, 750]
</example>
</view>`;

const grepInstructions = `<grep>
Built on ripgrep, not standard grep. Key notes:
* Literal braces need escaping: interface\\{\\} to find interface{}
* Default behavior matches within single lines only
* Use multiline: true for cross-line patterns
* Default \`output_mode\` is \`"files_with_matches"\` for efficiency. Keep \`"files_with_matches"\` when searching across the workspace or broad directories; only use \`output_mode: "content"\` when \`paths\` is scoped to specific file(s) or a narrow symbol pattern so you can get exact line numbers for \`view_range\`.
</grep>`;

const taskInstructions = `<task>
* Only delegate to a sub-agent (\`explore\` or specialist) for large, independent workstreams that require a separate context window. Never delegate work you can do directly in a few \`grep\`/\`glob\`/\`view\` calls.
* Sub-agents are stateless unless resumed via \`write_agent\`; provide complete context and do not duplicate their work while they run.
* When a background agent finishes, retrieve its output once with \`read_agent(wait=True)\`.
</task>`;

const editIntroduction = 'You can use the **edit** tool to batch edits to the same file in a single response. The tool will apply edits in sequential order, removing the risk of a reader/writer conflict.';
const postEditInstruction = 'After a successful **edit**, do not call **view** just to re-read the modified lines - verify via targeted tests or `git diff`.';

function replaceOnce(content: string, original: string, replacement: string, label: string): string {
	const index = content.indexOf(original);
	if (index < 0 || content.indexOf(original, index + original.length) >= 0) {
		throw new Error(`Gemini token-efficiency experiment expected exactly one ${label}; the SDK prompt has changed.`);
	}
	return content.slice(0, index) + replacement + content.slice(index + original.length);
}

function replaceToolSection(content: string, tool: string, replacement: string): string {
	const start = content.indexOf(`<${tool}>`);
	const end = content.indexOf(`</${tool}>`, start);
	if (start < 0 || end < 0 || content.indexOf(`<${tool}>`, start + 1) >= 0) {
		throw new Error(`Gemini token-efficiency experiment expected exactly one ${tool} section; the SDK prompt has changed.`);
	}
	return replaceOnce(content, content.slice(start, end + tool.length + 3), replacement, `${tool} section`);
}

class GeminiPromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		return model.id.toLowerCase().startsWith('gemini-');
	}

	resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
		return {
			tool_instructions: {
				action: content => {
					content = replaceToolSection(content, 'view', viewInstructions);
					content = replaceToolSection(content, 'grep', grepInstructions);
					content = replaceToolSection(content, 'task', taskInstructions);
					content = replaceOnce(content, editIntroduction, `${editIntroduction}\n${postEditInstruction}`, 'edit introduction');
					// Gemini's SDK prompt omits tool_efficiency, so its overrides do not render.
					return `* Never re-read file sections or re-run searches whose results are already in your conversation history.\n${content}`;
				},
			},
		};
	}
}

agentHostPromptRegistry.registerPrompt(GeminiPromptResolver);
