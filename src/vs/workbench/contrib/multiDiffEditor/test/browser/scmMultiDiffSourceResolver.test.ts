/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { IActivityService } from '../../../services/activity/common/activity.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISCMHistoryProvider } from '../../../scm/common/history.js';
import { ISCMProvider, ISCMRepository, ISCMResource, ISCMResourceGroup, ISCMService } from '../../../scm/common/scm.js';
import { ScmMultiDiffSourceResolver, ScmHistoryItemResolver } from '../../browser/scmMultiDiffSourceResolver.js';

suite('ScmMultiDiffSourceResolver', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts resources by path', async () => {
		const resources: ISCMResource[] = [];
		const onDidChangeResources = disposables.add(new Emitter<void>());
		const group = new class extends mock<ISCMResourceGroup>() {
			override readonly id = 'changes';
			override readonly label = 'Changes';
			override readonly resources = resources;
			override readonly onDidChangeResources = onDidChangeResources.event;
		}();
		const provider = new class extends mock<ISCMProvider>() {
			override readonly id = 'scm0';
			override readonly providerId = 'scm0';
			override readonly rootUri = URI.file('/repository');
			override readonly groups = [group];
			override readonly label = 'SCM';
			override readonly name = 'SCM';
			override readonly onDidChangeResources = new Emitter<void>().event;
			override readonly onDidChangeResourceGroups = new Emitter<void>().event;
		}();
		const repository = new class extends mock<ISCMRepository>() {
			override readonly id = provider.id;
			override readonly provider = provider;
			override readonly input = mock<any>();
		}();
		const repositories = [repository];
		const onDidAddRepository = disposables.add(new Emitter<ISCMRepository>());
		const scmService = new class extends mock<ISCMService>() {
			override readonly onDidAddRepository = onDidAddRepository.event;
			override get repositories(): Iterable<ISCMRepository> { return repositories; }
			override get repositoryCount(): number { return repositories.length; }
			override getRepository(idOrResource: string | URI): ISCMRepository | undefined {
				return typeof idOrResource === 'string' ? repositories.find(r => r.id === idOrResource) : undefined;
			}
		}();

		const activityChange = disposables.add(new Emitter<void>());
		const activityService = new class extends mock<IActivityService>() {
			override readonly onDidChangeActivity = activityChange.event;
			override getViewContainerActivities(): readonly any[] { return []; }
		}();
		const resolver = new ScmMultiDiffSourceResolver(scmService, activityService);
		const sourceUri = ScmMultiDiffSourceResolver.getMultiDiffSourceUri(provider.rootUri.toString(), group.id);
		const sourcePromise = resolver.resolveDiffSource(sourceUri);

		resources.push(
			new class extends mock<ISCMResource>() {
				override readonly sourceUri = URI.file('/repository/githubServer.ts');
				override readonly multiDiffEditorModifiedUri = this.sourceUri;
				override readonly resourceGroup = group;
				override readonly decorations = {};
				override readonly contextValue = undefined;
				override readonly command = undefined;
				override open(): Promise<void> { return Promise.resolve(); }
				override readonly resourceGroup = group;
				override readonly decorations = {};
				override readonly contextValue = undefined;
				override readonly command = undefined;
				override open(): Promise<void> { return Promise.resolve(); }
				override readonly resourceGroup = group;
				override readonly decorations = {};
				override readonly contextValue = undefined;
				override readonly command = undefined;
				override open(): Promise<void> { return Promise.resolve(); }
			}(),
			new class extends mock<ISCMResource>() {
				override readonly sourceUri = URI.file('/repository/env.ts');
				override readonly multiDiffEditorModifiedUri = this.sourceUri;
			}(),
			new class extends mock<ISCMResource>() {
				override readonly sourceUri = URI.file('/repository/githubUri.ts');
				override readonly multiDiffEditorModifiedUri = this.sourceUri;
			}(),
		);
		onDidChangeResources.fire();

		const source = await sourcePromise;
		assert.deepStrictEqual(
			source.resources.value.map(resource => resource.goToFileUri?.fsPath),
			[
				'/repository/env.ts',
				'/repository/githubServer.ts',
				'/repository/githubUri.ts',
			]
		);
	});
});

suite('ScmHistoryItemResolver', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for the repository to be added', async () => {
		const calls: [string, string | undefined][] = [];
		const originalUri = URI.file('original.ts');
		const modifiedUri = URI.file('modified.ts');
		const historyProvider = new class extends mock<ISCMHistoryProvider>() {
			override async provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined) {
				calls.push([historyItemId, historyItemParentId]);
				return [{ uri: modifiedUri, originalUri, modifiedUri }];
			}
		}();
		const provider = new class extends mock<ISCMProvider>() {
			override readonly id = 'scm0';
			override readonly rootUri = URI.file('repository');
			override readonly historyProvider = observableValue<ISCMHistoryProvider | undefined>(this, historyProvider);
		}();
		const repository = new class extends mock<ISCMRepository>() {
			override readonly id = provider.id;
			override readonly provider = provider;
		}();

		const repositories = new Map<string, ISCMRepository>();
		const onDidAddRepository = disposables.add(new Emitter<ISCMRepository>());
		const scmService = new class extends mock<ISCMService>() {
			override readonly onDidAddRepository = onDidAddRepository.event;
			override get repositories(): Iterable<ISCMRepository> { return repositories.values(); }
			override get repositoryCount(): number { return repositories.size; }
			override getRepository(idOrResource: string | URI): ISCMRepository | undefined {
				return typeof idOrResource === 'string' ? repositories.get(idOrResource) : undefined;
			}
		}();

		const resolver = new ScmHistoryItemResolver(scmService);
		const sourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(provider, 'commit', 'parent', 'display');
		const sourcePromise = resolver.resolveDiffSource(sourceUri);

		repositories.set(repository.id, repository);
		onDidAddRepository.fire(repository);

		const source = await sourcePromise;
		assert.deepStrictEqual({
			calls,
			resources: source.resources.value.map(resource => ({
				originalUri: resource.originalUri?.toString(),
				modifiedUri: resource.modifiedUri?.toString(),
				goToFileUri: resource.goToFileUri?.toString(),
				goToFileEditorTitle: resource.goToFileEditorTitle,
			}))
		}, {
			calls: [['commit', 'parent']],
			resources: [{
				originalUri: originalUri.toString(),
				modifiedUri: modifiedUri.toString(),
				goToFileUri: modifiedUri.toString(),
				goToFileEditorTitle: 'modified.ts (display)',
			}]
		});
	});
});
