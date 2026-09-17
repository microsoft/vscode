/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { TestLogService } from '../../../testing/common/testLogService';

const { mockStartMcpGateway } = vi.hoisted(() => ({
	mockStartMcpGateway: vi.fn(),
}));

vi.mock('vscode', () => ({
	lm: {
		get mcpServerDefinitions() { return []; },
		get onDidChangeMcpServerDefinitions() { return () => ({ dispose() { } }); },
		startMcpGateway: mockStartMcpGateway,
	},
}));

// Import after mock so the module picks up the mocked vscode
import { McpService } from '../mcpServiceImpl';

function createMockGateway() {
	return {
		servers: [{ label: 'test-server', address: { toString: () => 'http://localhost:1234' } }],
		onDidChangeServers: () => ({ dispose() { } }),
		dispose: vi.fn(),
	};
}

describe('McpService', () => {
	let service: McpService;
	let logService: TestLogService;

	const resource1 = URI.parse('copilot-mcp:session-1');
	const resource2 = URI.parse('copilot-mcp:session-2');

	beforeEach(() => {
		logService = new TestLogService();
		service = new McpService(logService);
		mockStartMcpGateway.mockReset();
	});

	afterEach(() => {
		service.dispose();
	});

	test('startMcpGateway creates and returns a tracked gateway', async () => {
		const mockGateway = createMockGateway();
		mockStartMcpGateway.mockResolvedValue(mockGateway);

		const result = await service.startMcpGateway(resource1);

		expect(result).toBeDefined();
		expect(result!.servers).toBe(mockGateway.servers);
		expect(mockStartMcpGateway).toHaveBeenCalledOnce();
	});

	test('startMcpGateway returns existing gateway for same resource', async () => {
		const mockGateway = createMockGateway();
		mockStartMcpGateway.mockResolvedValue(mockGateway);

		const first = await service.startMcpGateway(resource1);
		const second = await service.startMcpGateway(resource1);

		expect(first).toBe(second);
		expect(mockStartMcpGateway).toHaveBeenCalledOnce();
	});

	test('startMcpGateway creates separate gateways for different resources', async () => {
		const gateway1 = createMockGateway();
		const gateway2 = createMockGateway();
		mockStartMcpGateway.mockResolvedValueOnce(gateway1).mockResolvedValueOnce(gateway2);

		const first = await service.startMcpGateway(resource1);
		const second = await service.startMcpGateway(resource2);

		expect(first).not.toBe(second);
		expect(mockStartMcpGateway).toHaveBeenCalledTimes(2);
	});

	test('concurrent calls for same resource share the same gateway', async () => {
		const mockGateway = createMockGateway();
		mockStartMcpGateway.mockResolvedValue(mockGateway);

		const [first, second] = await Promise.all([
			service.startMcpGateway(resource1),
			service.startMcpGateway(resource1),
		]);

		expect(first).toBe(second);
		expect(mockStartMcpGateway).toHaveBeenCalledOnce();
	});

	test('startMcpGateway returns undefined when lm returns undefined', async () => {
		mockStartMcpGateway.mockResolvedValue(undefined);

		const result = await service.startMcpGateway(resource1);

		expect(result).toBeUndefined();
	});

	test('startMcpGateway returns undefined and logs warning on error', async () => {
		const warnSpy = vi.spyOn(logService, 'warn');
		mockStartMcpGateway.mockRejectedValue(new Error('gateway failed'));

		const result = await service.startMcpGateway(resource1);

		expect(result).toBeUndefined();
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('gateway failed'));
	});

	test('startMcpGateway allows retry after failure', async () => {
		mockStartMcpGateway.mockRejectedValueOnce(new Error('fail'));

		const first = await service.startMcpGateway(resource1);
		expect(first).toBeUndefined();

		const mockGateway = createMockGateway();
		mockStartMcpGateway.mockResolvedValueOnce(mockGateway);

		const second = await service.startMcpGateway(resource1);
		expect(second).toBeDefined();
		expect(second!.servers).toBe(mockGateway.servers);
	});

	test('disposing a gateway removes it from tracking', async () => {
		const mockGateway = createMockGateway();
		mockStartMcpGateway.mockResolvedValue(mockGateway);

		const tracked = await service.startMcpGateway(resource1);
		tracked!.dispose();

		expect(mockGateway.dispose).toHaveBeenCalledOnce();

		// Next call should create a new gateway since the old one was removed
		const newMockGateway = createMockGateway();
		mockStartMcpGateway.mockResolvedValue(newMockGateway);
		const second = await service.startMcpGateway(resource1);

		expect(second).not.toBe(tracked);
		expect(mockStartMcpGateway).toHaveBeenCalledTimes(2);
	});

	test('disposing the service disposes all tracked gateways', async () => {
		const gateway1 = createMockGateway();
		const gateway2 = createMockGateway();
		mockStartMcpGateway.mockResolvedValueOnce(gateway1).mockResolvedValueOnce(gateway2);

		await service.startMcpGateway(resource1);
		await service.startMcpGateway(resource2);

		service.dispose();
		await Promise.resolve(); // flush fire-and-forget disposal microtasks

		expect(gateway1.dispose).toHaveBeenCalledOnce();
		expect(gateway2.dispose).toHaveBeenCalledOnce();
	});

	test('service dispose does not double-dispose individually disposed gateways', async () => {
		const gateway1 = createMockGateway();
		const gateway2 = createMockGateway();
		mockStartMcpGateway.mockResolvedValueOnce(gateway1).mockResolvedValueOnce(gateway2);

		const tracked1 = await service.startMcpGateway(resource1);
		await service.startMcpGateway(resource2);

		// Dispose resource1 individually
		tracked1!.dispose();
		expect(gateway1.dispose).toHaveBeenCalledOnce();

		// Dispose the service - should only dispose resource2
		service.dispose();
		await Promise.resolve(); // flush fire-and-forget disposal microtasks

		expect(gateway1.dispose).toHaveBeenCalledOnce();
		expect(gateway2.dispose).toHaveBeenCalledOnce();
	});
});
