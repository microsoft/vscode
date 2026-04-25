/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { createSchema, schemaProperty } from '../../common/agentHostSchema.js';
import type { SessionConfigState, RootConfigState } from '../../common/state/protocol/state.js';
import { buildSubagentSessionUri, SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentConfigurationService', () => {

	const disposables = new DisposableStore();
	let manager: AgentHostStateManager;
	let service: AgentConfigurationService;

	const schema = createSchema({
		level: schemaProperty<'low' | 'high'>({
			type: 'string',
			title: 'level',
			enum: ['low', 'high'],
		}),
		limit: schemaProperty<number>({ type: 'number', title: 'limit' }),
	});

	function seedSessionConfig(sessionUri: string, values: Record<string, unknown>): void {
		const state = manager.getSessionState(sessionUri);
		assert.ok(state, `Session not found: ${sessionUri}`);
		const mutable = state as { config?: SessionConfigState };
		mutable.config = {
			schema: schema.toProtocol(),
			values,
		};
	}

	function seedRootConfig(values: Record<string, unknown>): void {
		const rootMutable = manager.rootState as { config?: RootConfigState };
		rootMutable.config = {
			schema: schema.toProtocol(),
			values,
		};
	}

	function makeSummary(resource: string, workingDirectory?: string): SessionSummary {
		return {
			resource,
			provider: 'copilot',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			project: { uri: 'file:///project', displayName: 'Project' },
			workingDirectory,
		};
	}

	setup(() => {
		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
		service = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- getEffectiveValue ------------------------------------------------

	suite('getEffectiveValue', () => {

		test('returns session value when present', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { level: 'high' });
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), 'high');
		});

		test('falls back to host value when session does not provide the key', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { limit: 5 });
			seedRootConfig({ level: 'low' });
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), 'low');
		});

		test('inherits from parent subagent session', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent));
			seedSessionConfig(parent, { level: 'high' });

			const child = buildSubagentSessionUri(parent, 'toolcall-1');
			manager.createSession(makeSummary(child));

			assert.strictEqual(service.getEffectiveValue(child, schema, 'level'), 'high');
		});

		test('session value takes precedence over parent and host', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent));
			seedSessionConfig(parent, { level: 'high' });

			const child = buildSubagentSessionUri(parent, 'tc-2');
			manager.createSession(makeSummary(child));
			seedSessionConfig(child, { level: 'low' });
			seedRootConfig({ level: 'high' });

			assert.strictEqual(service.getEffectiveValue(child, schema, 'level'), 'low');
		});

		test('skips layers whose value fails schema validation and falls through', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { level: 'bogus' });
			seedRootConfig({ level: 'high' });
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), 'high');
		});

		test('returns undefined when no layer provides a valid value', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, {});
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), undefined);
		});
	});

	// ---- getEffectiveWorkingDirectory -------------------------------------

	suite('getEffectiveWorkingDirectory', () => {

		test('returns session working directory when set', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri, 'file:///work'));
			assert.strictEqual(service.getEffectiveWorkingDirectory(uri), 'file:///work');
		});

		test('falls back to parent session working directory for subagents', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent, 'file:///work/parent'));

			const child = buildSubagentSessionUri(parent, 'tc-3');
			manager.createSession(makeSummary(child));
			assert.strictEqual(service.getEffectiveWorkingDirectory(child), 'file:///work/parent');
		});

		test('returns undefined when neither layer has a working directory', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			assert.strictEqual(service.getEffectiveWorkingDirectory(uri), undefined);
		});
	});

	// ---- updateSessionConfig ----------------------------------------------

	suite('updateSessionConfig', () => {

		test('merges the patch into the session config values', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { level: 'low', limit: 1 });

			service.updateSessionConfig(uri, { limit: 42 });

			const state = manager.getSessionState(uri);
			assert.deepStrictEqual(state?.config?.values, { level: 'low', limit: 42 });
		});
	});
});
