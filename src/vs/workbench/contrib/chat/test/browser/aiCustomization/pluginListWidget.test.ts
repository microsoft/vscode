/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind, CustomizationType, type CustomizationEnablement, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentCustomizationItemProvider } from '../../../browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';

const sessionResource = URI.parse('agent-host-copilotcli:/session-1');

class TestFileService extends mock<IFileService>() {
	override async canHandleResource(): Promise<boolean> {
		return false;
	}

	override async resolveAll() {
		return [];
	}
}

class TestAgentHostCustomizationService extends NullAgentHostCustomizationService {
	readonly calls: { readonly rawId: string; readonly enablement: readonly CustomizationEnablement[] }[] = [];

	constructor(
		private customizations: readonly PluginCustomization[],
		private readonly workingDirectories: readonly string[],
	) {
		super();
	}

	override readonly onDidChangeCustomizations = Event.None;

	override getCustomizations(): readonly PluginCustomization[] {
		return this.customizations;
	}

	override getWorkingDirectories(): readonly string[] {
		return this.workingDirectories;
	}

	setCustomizations(customizations: readonly PluginCustomization[]): void {
		this.customizations = customizations;
	}

	override setCustomizationEnablement(_sessionResource: URI, rawId: string, enablement: CustomizationEnablement[]): void {
		this.calls.push({ rawId, enablement });
	}
}

function plugin(enablement?: CustomizationEnablement[]): PluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: 'plugin-1',
		uri: 'file:///plugin-1',
		name: 'Plugin One',
		enabled: true,
		enablement,
	};
}

suite('pluginListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createProvider(service: IAgentHostCustomizationService): AgentCustomizationItemProvider {
		return disposables.add(new AgentCustomizationItemProvider(
			'local',
			undefined,
			undefined,
			new TestFileService(),
			new NullLogService(),
			service,
		));
	}

	test('offers scoped enablement actions and dispatches the selected scope', async () => {
		const service = new TestAgentHostCustomizationService([plugin([
			{ kind: CustomizationEnablementKind.Session, enabled: false },
			{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
			{ kind: CustomizationEnablementKind.Global, enabled: false },
		])], ['file:///repo']);
		const items = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		const actions = items[0].actions ?? [];

		assert.deepStrictEqual(actions.map(action => action.label), [
			'Enable',
			'Disable (Workspace)',
			'Enable (Session)',
		]);

		await actions[2].run();

		assert.deepStrictEqual(service.calls, [{
			rawId: 'plugin-1',
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: true },
				{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			],
		}]);
	});

	test('uses the latest enablement when running an action', async () => {
		const service = new TestAgentHostCustomizationService([plugin()], ['file:///repo']);
		const items = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);
		service.setCustomizations([plugin([{ kind: CustomizationEnablementKind.Session, enabled: false }])]);

		await (items[0].actions ?? [])[0].run();

		assert.deepStrictEqual(service.calls, [{
			rawId: 'plugin-1',
			enablement: [
				{ kind: CustomizationEnablementKind.Session, enabled: false },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			],
		}]);
	});

	test('omits workspace enablement actions without an active project root', async () => {
		const service = new TestAgentHostCustomizationService([plugin()], []);
		const items = await createProvider(service).provideChatSessionCustomizations(sessionResource, CancellationToken.None);

		assert.deepStrictEqual((items[0].actions ?? []).map(action => action.label), [
			'Disable',
			'Disable (Session)',
		]);
	});
});
