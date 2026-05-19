/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostClaudePermissionModePicker } from '../../browser/agentHostClaudePermissionModePicker.js';
import { IAgentHostSessionEnumPickerItem } from '../../browser/agentHostModePicker.js';

const PROVIDER_ID = 'local-agent-host';
const SESSION_ID = 'local-agent-host:s1';
const LEARN_MORE_URL = 'https://code.claude.com/docs/en/permission-modes#available-modes';

function makeClaudePermissionModeConfig(): ResolveSessionConfigResult {
	return {
		schema: {
			type: 'object',
			properties: {
				permissionMode: {
					title: 'Approvals',
					description: '',
					type: 'string',
					enum: ['default', 'acceptEdits'],
				},
			},
		},
		values: { permissionMode: 'default' },
	} as ResolveSessionConfigResult;
}

class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'setSessionConfigValue'> {
	readonly id = PROVIDER_ID;
	readonly onDidChangeSessionConfig: Event<string> = Event.None;
	readonly setCalls: Array<[string, string, unknown]> = [];

	getSessionConfig(_sessionId: string): ResolveSessionConfigResult {
		return makeClaudePermissionModeConfig();
	}

	async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		this.setCalls.push([sessionId, property, value]);
	}
}

suite('AgentHostClaudePermissionModePicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Learn More footer opens docs without writing session config', () => {
		const provider = new FakeProvider();
		const openedResources: string[] = [];
		const actionWidgetItems: IActionListItem<IAgentHostSessionEnumPickerItem>[] = [];
		let onSelect: ((item: IAgentHostSessionEnumPickerItem) => void) | undefined;

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			hide: () => { },
			show: <T>(_id: string, _supportsPreview: boolean, items: IActionListItem<T>[], delegate: { onSelect: (item: T) => void }) => {
				actionWidgetItems.splice(0, actionWidgetItems.length, ...(items as IActionListItem<IAgentHostSessionEnumPickerItem>[]));
				onSelect = delegate.onSelect as (item: IAgentHostSessionEnumPickerItem) => void;
			},
		});
		instantiationService.set(ISessionsManagementService, new (class extends mock<ISessionsManagementService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', { providerId: PROVIDER_ID, sessionId: SESSION_ID } as IActiveSession);
		})());
		instantiationService.set(ISessionsProvidersService, new (class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProviders(): ISessionsProvider[] { return [provider as unknown as ISessionsProvider]; }
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
				return id === provider.id ? provider as unknown as T : undefined;
			}
		})());
		instantiationService.set(IOpenerService, new (class extends mock<IOpenerService>() {
			override async open(resource: URI | string): Promise<boolean> {
				openedResources.push(resource.toString());
				return true;
			}
		})());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const picker = store.add(instantiationService.createInstance(AgentHostClaudePermissionModePicker));
		const container = document.createElement('div');
		picker.render(container);
		container.querySelector<HTMLElement>('a.action-label')?.click();

		const learnMoreItem = actionWidgetItems.at(-1)?.item;
		assert.ok(onSelect);
		assert.ok(learnMoreItem);
		onSelect(learnMoreItem);

		assert.deepStrictEqual({
			footerLabels: actionWidgetItems.slice(-2).map(item => item.label),
			openedResources,
			setCalls: provider.setCalls,
		}, {
			footerLabels: ['', 'Learn more about permissions'],
			openedResources: [LEARN_MORE_URL],
			setCalls: [],
		});
	});
});
