/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolInvocation } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotExtensionsReloadToolName, createCopilotExtensionTools } from '../../node/copilot/copilotExtensionTools.js';

suite('CopilotExtensionTools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const invocation: ToolInvocation = {
		sessionId: 'session',
		toolCallId: 'tool-call',
		toolName: CopilotExtensionsReloadToolName,
		arguments: {},
	};

	test('advertises reload only when extension support is enabled', () => {
		const [enabled] = createCopilotExtensionTools(true, async () => { }, new NullLogService());
		const requiredDescriptionPhrases = [
			'after creating or modifying extension files',
			'stops and restarts every extension provider',
			'open canvases become temporarily unavailable and are rehydrated',
			'call `list_canvas_capabilities` before `open_canvas`',
		];

		assert.deepStrictEqual({
			disabled: createCopilotExtensionTools(false, async () => { }, new NullLogService()),
			enabled: {
				name: enabled.name,
				defer: enabled.defer,
				overridesBuiltInTool: enabled.overridesBuiltInTool,
				metadata: enabled.metadata,
			},
			missingDescriptionPhrases: requiredDescriptionPhrases.filter(phrase => !enabled.description?.includes(phrase)),
		}, {
			disabled: [],
			enabled: {
				name: CopilotExtensionsReloadToolName,
				defer: 'never',
				overridesBuiltInTool: true,
				metadata: { 'github.com/copilot:safeForTelemetry': { name: true, inputsNames: false } },
			},
			missingDescriptionPhrases: [],
		});
	});

	test('reports reload success and failure', async () => {
		let reloadCount = 0;
		const [successTool] = createCopilotExtensionTools(true, async () => { reloadCount++; }, new NullLogService());
		const [failureTool] = createCopilotExtensionTools(true, async () => { throw new Error('reload failed'); }, new NullLogService());

		assert.deepStrictEqual({
			success: await successTool.handler?.({}, invocation),
			reloadCount,
			failure: await failureTool.handler?.({}, invocation),
		}, {
			success: {
				textResultForLlm: 'Extensions reloaded. Re-check canvas capabilities before opening or invoking a canvas.',
				resultType: 'success',
			},
			reloadCount: 1,
			failure: {
				textResultForLlm: 'Failed to reload extensions: reload failed',
				resultType: 'failure',
				error: 'reload failed',
			},
		});
	});
});
