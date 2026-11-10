/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../../../../services/views/common/viewsService.js';
import { ChatConfiguration } from '../../../../../chat/common/constants.js';
import { SessionsViewId } from '../../../../browser/views/sessionsView.js';
import { AgentsViewProvidersContribution } from '../../browser/agentsViewProviders.contribution.js';

suite('AgentsViewProvidersContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function configuration(enabled: boolean, reads: string[]): IConfigurationService {
		return new class extends TestConfigurationService {
			override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
				reads.push(String(arg1));
				return super.getValue<T>(arg1, arg2);
			}
		}({ [ChatConfiguration.AgentsViewEnabled]: enabled });
	}

	test('reads only its setting and does nothing else while the setting is off', () => {
		const reads: string[] = [];
		// Any use of the instantiation service fails: with the setting off, the contribution creates and invokes nothing
		disposables.add(new AgentsViewProvidersContribution(configuration(false, reads), upcastPartial<IInstantiationService>({})));

		assert.deepStrictEqual(reads, [ChatConfiguration.AgentsViewEnabled]);
	});

	test('registers the providers only once, when the Sessions view first shows, while the setting is on', () => {
		const onDidChangeViewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		const viewsService = upcastPartial<IViewsService>({ onDidChangeViewVisibility: onDidChangeViewVisibility.event });
		const registered: string[] = [];
		// Records the providers registered, instead of starting them
		const providersInstantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ..._args: TS): R => {
				registered.push(fn.name);
				return upcastPartial<IDisposable>({ dispose: () => { } }) as R;
			},
		});
		const instantiationService = upcastPartial<IInstantiationService>({
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R => fn(upcastPartial<ServicesAccessor>({
				get: <T>(id: unknown): T => (id === IViewsService ? viewsService : providersInstantiationService) as T,
			}), ...args),
		});
		disposables.add(new AgentsViewProvidersContribution(configuration(true, []), instantiationService));

		onDidChangeViewVisibility.fire({ id: 'other', visible: true });
		onDidChangeViewVisibility.fire({ id: SessionsViewId, visible: false });
		const beforeShown = [...registered];
		onDidChangeViewVisibility.fire({ id: SessionsViewId, visible: true });
		onDidChangeViewVisibility.fire({ id: SessionsViewId, visible: true });

		assert.deepStrictEqual({ beforeShown, afterShown: registered }, {
			beforeShown: [],
			afterShown: isWeb ? ['registerCopilotChatSessionsProviders'] : ['registerLocalAgentHostSessionsProvider', 'registerCopilotChatSessionsProviders'],
		});
	});
});
