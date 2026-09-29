/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
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

	function server(id: string, status: McpServerStatus, enabled = true): IAgentHostMcpServer {
		return upcastPartial<IAgentHostMcpServer>({ id, name: id, status, enabled });
	}

	function setup(enabled: boolean | undefined = true) {
		const changed = store.add(new Emitter<void>());
		const servers = new Map<string, readonly IAgentHostMcpServer[]>();
		const authentications: { resource: string; id: string }[] = [];
		let authenticated = true;
		const customizations = new class extends NullAgentHostCustomizationService {
			override readonly onDidChangeCustomizations = changed.event;
			override getMcpServers(resource: URI): readonly IAgentHostMcpServer[] {
				return servers.get(resource.toString()) ?? [];
			}
			override async authenticateMcpServer(resource: URI, id: string): Promise<boolean> {
				authentications.push({ resource: resource.toString(), id });
				return authenticated;
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
		return { model, session, configuration, setServers, authentications, cancelAuthentication: () => { authenticated = false; } };
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

	test('cancelled or incomplete authentication remains actionable', async () => {
		const { model, setServers, authentications, cancelAuthentication } = setup();
		setServers(first, [server('GitHub', McpServerStatus.AuthRequired)]);
		cancelAuthentication();
		await model.sections.get()[0].entries[0].open();
		assert.deepStrictEqual({
			labels: model.sections.get()[0].entries.map(entry => entry.label),
			authentications,
		}, {
			labels: ['Sign In to GitHub'],
			authentications: [{ resource: first.resource.toString(), id: 'GitHub' }],
		});
	});
});
