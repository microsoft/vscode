/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { GitRefType } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IsolationMode, IsolationPicker } from '../../browser/isolationPicker.js';

interface IIsolationActionItem {
	readonly mode: IsolationMode;
	readonly checked?: boolean;
}

function showPicker(container: HTMLElement): void {
	const trigger = container.querySelector<HTMLElement>('a.action-label');
	assert.ok(trigger);
	trigger.click();
}

function createPicker(
	disposables: DisposableStore,
	mode: IsolationMode,
	actionWidgetItems: IActionListItem<IIsolationActionItem>[],
): IsolationPicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	const activeSession = {
		providerId: 'default-copilot',
		sessionId: 'session-id',
		loading: observableValue('loading', false),
	} as unknown as IActiveSession;
	const isolationMode = observableValue<IsolationMode | undefined>('isolationMode', mode);
	const gitState = observableValue('gitState', {
		HEAD: { type: GitRefType.Head, name: 'main', commit: 'abc123' },
		remotes: [],
		mergeChanges: [],
		indexChanges: [],
		workingTreeChanges: [],
		untrackedChanges: [],
	});
	const provider = {
		getSession: () => ({
			gitRepository: { state: gitState },
			isolationMode,
		}),
	};

	instantiationService.stub(IActionWidgetService, {
		isVisible: false,
		hide: () => { },
		show: <T>(_id: string, _supportsPreview: boolean, items: IActionListItem<T>[]) => {
			actionWidgetItems.splice(0, actionWidgetItems.length, ...(items as IActionListItem<IIsolationActionItem>[]));
		},
	});
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(ISessionsManagementService, {
		activeSession: observableValue<IActiveSession | undefined>('activeSession', activeSession),
	} as unknown as ISessionsManagementService);
	instantiationService.stub(ISessionsProvidersService, {
		onDidChangeProviders: Event.None,
		getProviders: () => [],
		getProvider: () => provider,
	} as unknown as ISessionsProvidersService);

	return disposables.add(instantiationService.createInstance(IsolationPicker));
}

suite('IsolationPicker', () => {
	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('marks folder as checked when workspace isolation is selected', () => {
		const actionWidgetItems: IActionListItem<IIsolationActionItem>[] = [];
		const picker = createPicker(disposables, 'workspace', actionWidgetItems);
		const container = document.createElement('div');
		picker.render(container);
		showPicker(container);

		assert.deepStrictEqual(
			actionWidgetItems.map(item => ({ label: item.label, checked: item.item?.checked })),
			[
				{ label: 'Worktree', checked: undefined },
				{ label: 'Folder', checked: true },
			],
		);
	});

	test('marks worktree as checked when worktree isolation is selected', () => {
		const actionWidgetItems: IActionListItem<IIsolationActionItem>[] = [];
		const picker = createPicker(disposables, 'worktree', actionWidgetItems);
		const container = document.createElement('div');
		picker.render(container);
		showPicker(container);

		assert.deepStrictEqual(
			actionWidgetItems.map(item => ({ label: item.label, checked: item.item?.checked })),
			[
				{ label: 'Worktree', checked: true },
				{ label: 'Folder', checked: undefined },
			],
		);
	});
});
