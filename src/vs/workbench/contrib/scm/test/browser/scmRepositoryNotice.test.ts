/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SCMTreeDataSource, SCMTreeSorter } from '../../browser/scmViewPane.js';
import { ISCMActionButtonDescriptor, ISCMInput, ISCMProvider, ISCMRepository, ISCMRepositoryNotice, ISCMResource, ISCMResourceGroup, ISCMViewService, ViewMode } from '../../common/scm.js';
import { SCMStructuralDiffModel } from '../../common/scmStructuralDiff.js';

suite('SCM repository notice', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows above the input, as the same element while it shows', async () => {
		const notice: ISCMRepositoryNotice = { id: 'review', message: new MarkdownString('Review your changes') };
		const groups: ISCMResourceGroup[] = [];
		const provider = new class extends mock<ISCMProvider>() {
			override readonly actionButton = constObservable<ISCMActionButtonDescriptor | undefined>({ command: { id: 'commit', title: 'Commit' }, enabled: true });
			override readonly groups = groups;
		};
		const group = new class extends mock<ISCMResourceGroup>() {
			override readonly provider = provider;
			override readonly resources = [new class extends mock<ISCMResource>() { }];
		};
		groups.push(group);
		const repository = new class extends mock<ISCMRepository>() {
			override readonly provider = provider;
			override readonly input = new class extends mock<ISCMInput>() {
				override readonly visible = true;
				override readonly value = '';
				override readonly validateInput = async () => undefined;
			};
		};
		const shownNotice = observableValue<ISCMRepositoryNotice | undefined>('notice', notice);
		const viewService = new class extends mock<ISCMViewService>() {
			override readonly visibleRepositories = [repository];
			override getRepositoryNotice() { return shownNotice; }
		};
		const dataSource = store.add(new SCMTreeDataSource(() => ViewMode.List, new class extends mock<SCMStructuralDiffModel>() { }, new TestConfigurationService({ 'scm.showActionButton': true }), viewService));
		type SortKey = ReturnType<ConstructorParameters<typeof SCMTreeSorter>[1]>;
		const sorter = new SCMTreeSorter(() => ViewMode.List, () => 'path' as SortKey);
		const describe = (element: unknown) => element === repository.input ? 'input' : element === group ? 'changes' : (element as { type: string }).type;

		const first = [...await dataSource.getChildren(repository)];
		const second = [...await dataSource.getChildren(repository)];
		shownNotice.set(undefined, undefined);
		const removed = [...await dataSource.getChildren(repository)];

		assert.deepStrictEqual({
			order: [...first].reverse().sort((a, b) => sorter.compare(a, b)).map(describe),
			sameElement: first[0] === second[0],
			parent: dataSource.getParent(first[0]) === repository,
			removed: removed.map(describe),
		}, {
			order: ['repositoryNotice', 'input', 'actionButton', 'changes'],
			sameElement: true,
			parent: true,
			removed: ['input', 'actionButton', 'changes'],
		});
	});
});
