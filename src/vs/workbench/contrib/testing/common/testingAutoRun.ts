/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestResultService, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResultService';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { IWorkspaceTestCollectionService } from 'vs/workbench/contrib/testing/common/workspaceTestCollectionService';

export interface ITestingAutoRun {
	/**
	 * Toggles autorun on or off.
	 */
	toggle(): void;
}

export const ITestingAutoRun = createDecorator<ITestingAutoRun>('testingAutoRun');

export class TestingAutoRun extends Disposable implements ITestingAutoRun {
	private enabled: IContextKey<boolean>;
	private runner = this._register(new MutableDisposable());

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceTestCollectionService private readonly workspaceTests: IWorkspaceTestCollectionService,
		@ITestService private readonly testService: ITestService,
		@ITestResultService private readonly results: ITestResultService,
		@IConfigurationService private readonly configuration: IConfigurationService,
	) {
		super();
		this.enabled = TestingContextKeys.autoRun.bindTo(contextKeyService);
	}

	/**
	 * @inheritdoc
	 */
	public toggle(): void {
		const enabled = this.enabled.get();
		if (enabled) {
			this.runner.value = undefined;
		} else {
			this.runner.value = this.makeRunner();
		}

		this.enabled.set(!enabled);
	}

	/**
	 * Creates the runner. Is triggered when tests are marked as retired.
	 * Runs them on a debounce.
	 *
	 * We keep a workspace subscription open and try to find always find
	 * tests in the workspace -- as opposed to document tests. This is needed
	 * because a user could trigger a test run from a document, but close that
	 * document and edit another file that would cause the test to be retired.
	 */
	private makeRunner() {
		let isRunning = false;
		const rerunIds = new Map<string, TestIdWithProvider>();
		const store = new DisposableStore();

		let delay = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoRunDelay);

		store.add(this.configuration.onDidChangeConfiguration(evt => {
			delay = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoRunDelay);
		}));

		const workspaceTests = store.add(this.workspaceTests.subscribeToWorkspaceTests());

		const scheduler = store.add(new RunOnceScheduler(async () => {
			const tests = [...rerunIds.values()];

			isRunning = true;
			rerunIds.clear();
			await this.testService.runTests({ debug: false, tests, isAutoRun: true });
			isRunning = false;

			if (rerunIds.size > 0) {
				scheduler.schedule(delay);
			}
		}, delay));

		store.add(this.results.onTestChanged(evt => {
			if (evt.reason !== TestResultItemChangeReason.Retired) {
				return;
			}

			const { extId } = evt.item.item;
			const workspaceTest = mapFind(workspaceTests.workspaceFolderCollections,
				([, c]) => c.getNodeById(evt.item.id) ?? Iterable.find(c.all, t => t.item.extId === extId));
			const subject = workspaceTest ?? evt.item;

			rerunIds.set(subject.id, ({ testId: subject.id, providerId: subject.providerId }));

			if (!isRunning) {
				scheduler.schedule(delay);
			}
		}));

		return store;
	}
}
