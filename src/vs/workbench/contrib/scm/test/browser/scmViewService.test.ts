/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Command } from '../../../../../editor/common/languages.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestStorageService, TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISCMArtifactProvider } from '../../common/artifact.js';
import { ISCMHistoryProvider } from '../../common/history.js';
import { SCMService } from '../../common/scmService.js';
import { ISCMMenus, ISCMActionButtonDescriptor, ISCMProvider, ISCMResourceGroup } from '../../common/scm.js';
import { SCMViewService } from '../../browser/scmViewService.js';

class TestSCMProvider extends Disposable implements ISCMProvider {
	readonly id: string;
	readonly providerId = 'test-scm-provider';
	readonly label: string;
	readonly name: string;
	readonly groups: readonly ISCMResourceGroup[] = [];
	readonly onDidChangeResourceGroups = this._onDidChangeResourceGroups.event;
	readonly onDidChangeResources = this._onDidChangeResources.event;
	readonly inputBoxTextModel = new class extends mock<ITextModel>() { };
	readonly contextValue = observableValue<string | undefined>(this, undefined);
	readonly count = observableValue<number | undefined>(this, 0);
	readonly commitTemplate = observableValue<string>(this, '');
	readonly artifactProvider = observableValue<ISCMArtifactProvider | undefined>(this, undefined);
	readonly historyProvider = observableValue<ISCMHistoryProvider | undefined>(this, undefined);
	readonly actionButton = observableValue<ISCMActionButtonDescriptor | undefined>(this, undefined);
	readonly statusBarCommands = observableValue<readonly Command[] | undefined>(this, undefined);

	private readonly _onDidChangeResourceGroups = this._register(new Emitter<void>());
	private readonly _onDidChangeResources = this._register(new Emitter<void>());

	constructor(
		repositoryName: string,
		readonly rootUri: URI
	) {
		super();
		this.id = repositoryName;
		this.label = repositoryName;
		this.name = repositoryName;
	}

	fireResourcesChanged(): void {
		this._onDidChangeResources.fire();
	}

	async getOriginalResource(_uri: URI): Promise<URI | null> {
		return null;
	}
}

suite('SCMViewService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts repositories by recent changes', () => {
		const configurationService = new TestConfigurationService({
			scm: {
				repositories: {
					sortOrder: 'recent changes'
				}
			}
		});
		const contextKeyService = new MockContextKeyService();
		const storageService = new TestStorageService();
		const workspaceContextService = new TestContextService();
		const scmService = new SCMService(
			new NullLogService(),
			workspaceContextService,
			contextKeyService,
			storageService,
			new class extends mock<IUriIdentityService>() { }
		);
		const menus = new class extends mock<ISCMMenus>() { };
		const instantiationService = new class extends mock<IInstantiationService>() {
			override createInstance<T>(_descriptor: unknown, ..._args: unknown[]): T {
				return menus as T;
			}
		};
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidActiveEditorChange = Event.None;
			override readonly activeEditor = undefined;
		};
		const extensionService = new class extends mock<IExtensionService>() {
			override readonly onWillStop = Event.None;
		};

		const scmViewService = new SCMViewService(
			scmService,
			contextKeyService,
			editorService,
			extensionService,
			instantiationService,
			configurationService,
			storageService,
			workspaceContextService
		);

		try {
			const repositoryA = scmService.registerSCMProvider(new TestSCMProvider('repo-a', URI.file('/workspace/repo-a')));
			const repositoryB = scmService.registerSCMProvider(new TestSCMProvider('repo-b', URI.file('/workspace/repo-b')));

			assert.deepStrictEqual(scmViewService.repositories, [repositoryA, repositoryB]);

			(repositoryB.provider as TestSCMProvider).fireResourcesChanged();
			assert.deepStrictEqual(scmViewService.repositories, [repositoryB, repositoryA]);

			(repositoryA.provider as TestSCMProvider).fireResourcesChanged();
			assert.deepStrictEqual(scmViewService.repositories, [repositoryA, repositoryB]);
		} finally {
			scmViewService.dispose();
			scmService.dispose();
			storageService.dispose();
		}
	});
});
