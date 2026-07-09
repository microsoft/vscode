/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
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
					enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
					enumLabels: ['Ask Before Edits', 'Edit Automatically', 'Plan Mode', 'Auto Mode', 'Bypass Permissions'],
					enumDescriptions: [
						'Claude asks before editing files.',
						'Claude edits files without asking, and asks before using other tools.',
						'Claude creates a plan before making changes.',
						'Claude decides whether to ask for each tool operation.',
						'Claude runs all tools without asking.',
					],
				},
			},
		},
		values: { permissionMode: 'default' },
	} as ResolveSessionConfigResult;
}

class FakeProvider implements Pick<IAgentHostSessionsProvider, 'id' | 'onDidChangeSessionConfig' | 'getSessionConfig' | 'setSessionConfigValue' | 'isSessionConfigResolving'> {
	readonly id = PROVIDER_ID;
	readonly onDidChangeSessionConfig: Event<string> = Event.None;
	readonly setCalls: Array<[string, string, unknown]> = [];

	getSessionConfig(_sessionId: string): ResolveSessionConfigResult {
		return makeClaudePermissionModeConfig();
	}

	isSessionConfigResolving(_sessionId: string) {
		return constObservable(false);
	}

	async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		this.setCalls.push([sessionId, property, value]);
	}
}

function setupPicker(store: Pick<ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, 'add'>) {
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
	const sessionObs = observableValue<IActiveSession | undefined>('activeSession', { providerId: PROVIDER_ID, sessionId: SESSION_ID } as IActiveSession);
	instantiationService.set(ISessionsService, new (class extends mock<ISessionsService>() {
		override readonly activeSession = sessionObs;
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
	instantiationService.stub(IHoverService, {
		setupDelayedHover: () => ({ dispose: () => { } }),
	} as Partial<IHoverService> as IHoverService);

	const picker = store.add(instantiationService.createInstance(AgentHostClaudePermissionModePicker, sessionObs));
	const container = document.createElement('div');
	picker.render(container);
	container.querySelector<HTMLElement>('a.action-label')?.click();

	return { actionWidgetItems, openedResources, onSelect: () => onSelect, provider };
}

suite('AgentHostClaudePermissionModePicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders Claude-native permission modes with distinct icons', () => {
		const { actionWidgetItems } = setupPicker(store);
		const modeItems = actionWidgetItems.slice(0, 5);

		assert.deepStrictEqual(modeItems.map(item => item.label), [
			'Ask Before Edits',
			'Edit Automatically',
			'Plan Mode',
			'Auto Mode',
			'Bypass Permissions',
		]);
		assert.ok(!actionWidgetItems.some(item => item.label === 'Don\'t Ask'));

		const iconIds = modeItems.map(item => item.group?.icon?.id);
		assert.deepStrictEqual(iconIds, [
			Codicon.shield.id,
			Codicon.edit.id,
			Codicon.lightbulb.id,
			Codicon.sparkle.id,
			Codicon.warning.id,
		]);
		assert.strictEqual(new Set(iconIds).size, modeItems.length);
	});

	test('Learn More footer opens docs without writing session config', () => {
		const { actionWidgetItems, openedResources, onSelect, provider } = setupPicker(store);
		const learnMoreItem = actionWidgetItems.at(-1)?.item;
		const select = onSelect();
		assert.ok(select);
		assert.ok(learnMoreItem);
		select(learnMoreItem);

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
