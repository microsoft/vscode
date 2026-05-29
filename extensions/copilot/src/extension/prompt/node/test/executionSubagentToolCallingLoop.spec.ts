/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { ProxyAgenticEndpoint } from '../../../../platform/endpoint/node/proxyAgenticEndpoint';
import { ExecutionSubagentToolCallingLoop } from '../executionSubagentToolCallingLoop';

function makeLoop(opts: {
	mainEndpoint: { ownsAuthorization?: boolean };
	useAgenticProxy?: boolean;
	modelName?: string;
	overrideEndpoint?: { ownsAuthorization?: boolean; supportsToolCalls?: boolean };
	shellType?: string;
}) {
	const proxySentinel = { __proxy: true };
	const overrideSentinel = { supportsToolCalls: true, __override: true, ...opts.overrideEndpoint };

	const configurationService = {
		getExperimentBasedConfig(key: { id: string }) {
			if (key.id.endsWith('executionSubagent.model')) {
				return opts.modelName ?? '';
			}
			if (key.id.endsWith('executionSubagent.useAgenticProxy')) {
				return !!opts.useAgenticProxy;
			}
			return undefined;
		},
	};

	const endpointProvider = {
		async getChatEndpoint(req: unknown) {
			if (typeof req === 'string' && opts.modelName && req === opts.modelName) {
				return overrideSentinel;
			}
			return opts.mainEndpoint;
		},
	};

	const instantiationService = {
		createInstance(ctor: unknown) {
			if (ctor === ProxyAgenticEndpoint) {
				return proxySentinel;
			}
			throw new Error('unexpected createInstance');
		},
	};

	const terminalService = { terminalShellType: opts.shellType ?? 'bash' };

	const loop = new (ExecutionSubagentToolCallingLoop as any)(
		{ request: { id: 'r1' }, location: 1, promptText: 'q', toolCallLimit: 4 },
		instantiationService,
		{ warn: () => { } }, // logService
		{}, // requestLogger
		endpointProvider,
		{}, // toolsService
		{}, // authenticationChatUpgradeService
		{}, // telemetryService
		configurationService,
		{}, // experimentationService
		{}, // chatHookService
		{}, // sessionTranscriptService
		{}, // fileSystemService
		{}, // otelService
		{}, // gitService
		terminalService,
	);

	return { loop, proxySentinel, overrideSentinel };
}

suite('ExecutionSubagentToolCallingLoop.getEndpoint', () => {
	test('BYOK main endpoint: reuses it even when useAgenticProxy is on', async () => {
		const mainEndpoint = { ownsAuthorization: true };
		const { loop } = makeLoop({ mainEndpoint, useAgenticProxy: true });
		const result = await loop['getEndpoint']();
		expect(result).toBe(mainEndpoint);
	});

	test('BYOK main endpoint: reuses it even when an override model is configured', async () => {
		const mainEndpoint = { ownsAuthorization: true };
		const { loop } = makeLoop({ mainEndpoint, modelName: 'gpt-4o' });
		const result = await loop['getEndpoint']();
		expect(result).toBe(mainEndpoint);
	});

	test('non-BYOK main endpoint: uses agentic proxy when enabled (non-pwsh)', async () => {
		const mainEndpoint = { ownsAuthorization: false };
		const { loop, proxySentinel } = makeLoop({ mainEndpoint, useAgenticProxy: true, shellType: 'bash' });
		const result = await loop['getEndpoint']();
		expect(result).toBe(proxySentinel);
	});

	test('non-BYOK main endpoint: falls back to main when shell is powershell', async () => {
		const mainEndpoint = { ownsAuthorization: false };
		const { loop } = makeLoop({ mainEndpoint, useAgenticProxy: true, shellType: 'powershell' });
		const result = await loop['getEndpoint']();
		expect(result).toBe(mainEndpoint);
	});

	test('non-BYOK main endpoint: uses override model when it supports tool calls', async () => {
		const mainEndpoint = { ownsAuthorization: false };
		const { loop, overrideSentinel } = makeLoop({ mainEndpoint, modelName: 'gpt-4o' });
		const result = await loop['getEndpoint']();
		expect(result).toBe(overrideSentinel);
	});

	test('non-BYOK main endpoint: falls back to main when override does not support tool calls', async () => {
		const mainEndpoint = { ownsAuthorization: false };
		const { loop } = makeLoop({ mainEndpoint, modelName: 'gpt-4o', overrideEndpoint: { supportsToolCalls: false } });
		const result = await loop['getEndpoint']();
		expect(result).toBe(mainEndpoint);
	});

	test('non-BYOK main endpoint: falls back to main when neither is configured', async () => {
		const mainEndpoint = { ownsAuthorization: false };
		const { loop } = makeLoop({ mainEndpoint });
		const result = await loop['getEndpoint']();
		expect(result).toBe(mainEndpoint);
	});
});
