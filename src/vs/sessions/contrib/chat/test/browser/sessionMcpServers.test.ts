/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpAuthRequiredReason, McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullAgentHostCustomizationService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostMcpServer } from '../../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SESSION_MCP_AUTH_PILL_SETTING, SessionMcpServers } from '../../browser/sessionMcpServers.js';

suite('SessionMcpServers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const first = upcastPartial<IActiveSession>({ resource: URI.parse('agent-host://local/first') });
	const second = upcastPartial<IActiveSession>({ resource: URI.parse('agent-host://remote/second') });

	function server(id: string, status: McpServerStatus, enabled = true, reason = McpAuthRequiredReason.Required): IAgentHostMcpServer {
		return upcastPartial<IAgentHostMcpServer>({
			id, name: id, status, enabled,
			...(status === McpServerStatus.AuthRequired ? {
				state: { kind: status, reason, resource: { resource: 'https://mcp.example.com' } },
			} : {}),
		});
	}

	function setup(enabled = true, authenticate: () => Promise<boolean> = async () => true) {
		const changed = store.add(new Emitter<void>());
		const servers = new Map<string, readonly IAgentHostMcpServer[]>();
		const authentications: { resource: string; id: string }[] = [];
		const customizations = new class extends NullAgentHostCustomizationService {
			override readonly onDidChangeCustomizations = changed.event;
			override getMcpServers(resource: URI): readonly IAgentHostMcpServer[] {
				return servers.get(resource.toString()) ?? [];
			}
			override async authenticateMcpServer(resource: URI, id: string): Promise<boolean> {
				authentications.push({ resource: resource.toString(), id });
				return authenticate();
			}
		};
		const session = observableValue<IActiveSession | undefined>('session', first);
		const configuration = new TestConfigurationService({ [SESSION_MCP_AUTH_PILL_SETTING]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const model = store.add(new SessionMcpServers(session, customizations, configuration));
		store.add(autorun(reader => model.sections.read(reader)));
		const setServers = (target: IActiveSession, value: readonly IAgentHostMcpServer[]) => {
			servers.set(target.resource.toString(), value);
			changed.fire();
		};
		return { model, session, configuration, setServers, authentications };
	}

	test('experiment gate is off by default and responds to configuration changes', async () => {
		const { model, configuration, setServers } = setup(false);
		setServers(first, [server('GitHub', McpServerStatus.AuthRequired)]);
		const counts = [model.sections.get().length];
		for (const enabled of [true, false, undefined]) {
			await configuration.setUserConfiguration(SESSION_MCP_AUTH_PILL_SETTING, enabled);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: section => section === SESSION_MCP_AUTH_PILL_SETTING,
				affectedKeys: new Set([SESSION_MCP_AUTH_PILL_SETTING]),
				source: ConfigurationTarget.USER,
				change: { keys: [SESSION_MCP_AUTH_PILL_SETTING], overrides: [] },
			});
			counts.push(model.sections.get().length);
		}
		assert.deepStrictEqual(counts, [0, 1, 0, 0]);
	});

	test('only enabled servers requiring authentication appear', () => {
		const { model, setServers } = setup();
		setServers(first, [
			server('Ready', McpServerStatus.Ready),
			server('Starting', McpServerStatus.Starting),
			server('Stopped', McpServerStatus.Stopped),
			server('Error', McpServerStatus.Error),
			server('Disabled', McpServerStatus.AuthRequired, false),
			server('GitHub', McpServerStatus.AuthRequired),
			server('Slack', McpServerStatus.AuthRequired),
		]);
		assert.deepStrictEqual(model.sections.get().flatMap(section => section.entries.map(entry => entry.label)), [
			'Sign In to GitHub', 'Sign In to Slack',
		]);
	});

	test('appears on auth-required updates and disappears after authentication, disablement, or removal', () => {
		const { model, setServers } = setup();
		const counts = [model.sections.get().length];
		for (const servers of [
			[server('GitHub', McpServerStatus.AuthRequired)],
			[server('GitHub', McpServerStatus.Ready)],
			[server('GitHub', McpServerStatus.AuthRequired)],
			[server('GitHub', McpServerStatus.AuthRequired, false)],
			[server('GitHub', McpServerStatus.AuthRequired)],
			[],
		]) {
			setServers(first, servers);
			counts.push(model.sections.get().length);
		}
		assert.deepStrictEqual(counts, [0, 1, 0, 1, 0, 1, 0]);
	});

	test('distinguishes sign-in from additional access without changing the authentication target', async () => {
		const { model, setServers, authentications } = setup();
		setServers(first, [
			server('GitHub', McpServerStatus.AuthRequired),
			server('Slack', McpServerStatus.AuthRequired, true, McpAuthRequiredReason.Expired),
			server('Calendar', McpServerStatus.AuthRequired, true, McpAuthRequiredReason.InsufficientScope),
		]);
		const section = model.sections.get()[0];
		await section.entries[2].open();
		assert.deepStrictEqual({
			title: section.title,
			entries: section.entries.map(({ label, ariaDescription }) => ({ label, ariaDescription })),
			authentications,
		}, {
			title: 'MCP Servers Requiring Authentication',
			entries: [
				{ label: 'Sign In to GitHub', ariaDescription: 'MCP server requires authentication' },
				{ label: 'Sign In to Slack', ariaDescription: 'MCP server requires authentication' },
				{ label: 'Grant Additional Access to Calendar', ariaDescription: 'MCP server requires additional permissions' },
			],
			authentications: [{ resource: first.resource.toString(), id: 'Calendar' }],
		});
	});

	test('switching sessions never shows or authenticates another session server', async () => {
		const { model, session, setServers, authentications } = setup();
		setServers(first, [server('Local', McpServerStatus.AuthRequired)]);
		setServers(second, [server('Remote', McpServerStatus.AuthRequired)]);
		session.set(second, undefined);
		const entries = model.sections.get()[0].entries;
		await entries[0].open();
		session.set(undefined, undefined);
		assert.deepStrictEqual({
			labels: entries.map(entry => entry.label),
			authentications,
			noSession: model.sections.get(),
		}, {
			labels: ['Sign In to Remote'],
			authentications: [{ resource: second.resource.toString(), id: 'Remote' }],
			noSession: [],
		});
	});

	test('restores the action after Starting returns to AuthRequired when authentication is cancelled', async () => {
		const signIn = new DeferredPromise<boolean>();
		const { model, setServers, authentications } = setup(true, async () => {
			// The start request is optimistic; the host restores its authoritative auth-required state.
			setServers(first, [server('GitHub', McpServerStatus.Starting)]);
			const result = await signIn.p;
			setServers(first, [server('GitHub', McpServerStatus.AuthRequired)]);
			return result;
		});
		setServers(first, [server('GitHub', McpServerStatus.AuthRequired)]);
		const attempt = model.sections.get()[0].entries[0].open();
		const whileStarting = model.sections.get();
		await signIn.complete(false);
		await attempt;
		const restoredLabels = model.sections.get()[0].entries.map(entry => entry.label);
		await model.sections.get()[0].entries[0].open();
		assert.deepStrictEqual({
			whileStarting,
			restoredLabels,
			authentications,
		}, {
			whileStarting: [],
			restoredLabels: ['Sign In to GitHub'],
			authentications: [
				{ resource: first.resource.toString(), id: 'GitHub' },
				{ resource: first.resource.toString(), id: 'GitHub' },
			],
		});
	});
});
