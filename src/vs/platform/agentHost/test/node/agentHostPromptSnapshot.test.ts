/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import type { SystemMessageConfig } from '@github/copilot-sdk';
import { copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { agentHostPromptRegistry, type IAgentHostPromptContext } from '../../node/copilot/prompts/promptRegistry.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import '../../node/copilot/prompts/allPrompts.js';

/**
 * Full-content snapshot of the resolved system message config per model.
 * Catches unintended prompt regressions. To update after intentional changes:
 *   UPDATE_SNAPSHOTS=1 ./scripts/test.sh --run src/vs/platform/agentHost/test/node/agentHostPromptSnapshot.test.ts
 */
suite('AgentHost Prompt Snapshots', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ALL_TOOLS = ['problems', 'usages', 'editNotebook', 'runNotebookCell', 'getNotebookSummary'] as const;

	function ctx(tools: readonly string[] = []): IAgentHostPromptContext {
		const toolNames = new Set(tools);
		return {
			getSetting: (_key: keyof SchemaValues<typeof copilotCliConfigSchema.definition>) => undefined,
			hasClientTool: (name: string) => toolNames.has(name),
			workspaceless: false,
			toolSearchActive: false,
		};
	}

	function resolve(model: ModelSelection, tools: readonly string[] = []): SystemMessageConfig {
		return agentHostPromptRegistry.resolveSystemMessageConfig(model, ctx(tools));
	}

	function serialize(config: SystemMessageConfig): string {
		const lines: string[] = [];
		lines.push(`mode: ${config.mode}`);
		lines.push('');

		if (config.mode === 'customize' && config.sections) {
			for (const [section, override] of Object.entries(config.sections)) {
				if (!override) { continue; }
				const action = typeof override.action === 'function' ? 'transform' : override.action;
				lines.push(`### ${section} (${action})`);
				lines.push('');
				if (override.content) {
					lines.push(override.content);
				}
				lines.push('');
			}
		} else if (config.mode === 'replace') {
			lines.push('### full prompt');
			lines.push('');
			lines.push(config.content);
			lines.push('');
		}

		if (config.content && config.mode !== 'replace') {
			lines.push('### appended content');
			lines.push('');
			lines.push(config.content);
			lines.push('');
		}

		return lines.join('\n');
	}

	function getSnapshotPath(name: string): string {
		const moduleUri = FileAccess.asFileUri(`vs/platform/agentHost/test/node/__snapshots__/${name}.snap`);
		return URI.parse(moduleUri.toString()).fsPath;
	}

	function assertMatchesSnapshot(content: string, name: string): void {
		const file = getSnapshotPath(name);

		if (process.env['UPDATE_SNAPSHOTS']) {
			const dir = file.substring(0, file.lastIndexOf('/'));
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(file, content, 'utf-8');
			return;
		}

		if (!fs.existsSync(file)) {
			const dir = file.substring(0, file.lastIndexOf('/'));
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(file, content, 'utf-8');
			assert.fail(`Snapshot "${name}" did not exist — created it. Run the test again to pass.`);
		}

		const expected = fs.readFileSync(file, 'utf-8');
		assert.strictEqual(content, expected, `Snapshot mismatch for "${name}". Run with UPDATE_SNAPSHOTS=1 to update.`);
	}

	const models: Array<{ name: string; model: ModelSelection; tools: readonly string[] }> = [
		{ name: 'opus48-all-tools', model: { id: 'claude-opus-4-8' }, tools: [...ALL_TOOLS] },
		{ name: 'opus48-no-tools', model: { id: 'claude-opus-4-8' }, tools: [] },
		{ name: 'default-model', model: { id: 'some-unknown-model' }, tools: [...ALL_TOOLS] },
	];

	for (const { name, model, tools } of models) {
		test(name, () => {
			const config = resolve(model, tools);
			const content = serialize(config);
			assertMatchesSnapshot(content, name);
		});
	}
});
