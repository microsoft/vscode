/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { autorun, constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SCMMenus } from '../../browser/menus.js';
import { SCMViewService } from '../../browser/scmViewService.js';
import { ISCMProvider, ISCMRepository, ISCMService } from '../../common/scm.js';

suite('SCMViewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('active repository follows the active editor when its repository is opened after the editor', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const repositories: ISCMRepository[] = [];
		const onDidAddRepository = disposables.add(new Emitter<ISCMRepository>());
		instantiationService.stub(ISCMService, new class extends mock<ISCMService>() {
			override readonly repositories = repositories;
			override readonly onDidAddRepository = onDidAddRepository.event;
			override readonly onDidRemoveRepository = Event.None;
			override getRepository(idOrResource: string | URI): ISCMRepository | undefined {
				return repositories.find(r => URI.isUri(idOrResource) && isEqualOrParent(idOrResource, r.provider.rootUri!));
			}
		}());

		const activeEditor = disposables.add(new TestFileEditorInput(URI.file('/repositoryB/file.txt'), 'testEditor'));
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly activeEditor = activeEditor;
			override readonly onDidActiveEditorChange = Event.None;
		}());

		const scmViewService = disposables.add(instantiationService.createInstance(SCMViewService));

		// The menus are not disposed by the view service since it is a singleton
		const menus = disposables.add(scmViewService.menus as SCMMenus);
		disposables.add(menus.titleMenu);

		const activeRepositories: (string | undefined)[] = [];
		disposables.add(autorun(reader => {
			activeRepositories.push(scmViewService.activeRepository.read(reader)?.repository.id);
		}));

		const addRepository = (id: string) => {
			const provider = new class extends mock<ISCMProvider>() {
				override readonly id = id;
				override readonly providerId = 'test';
				override readonly label = id;
				override readonly rootUri = URI.file(`/${id}`);
				override readonly isHidden = constObservable(false);
			}();
			const repository = new class extends mock<ISCMRepository>() {
				override readonly id = id;
				override readonly provider = provider;
			}();

			repositories.push(repository);
			onDidAddRepository.fire(repository);
		};

		addRepository('repositoryA');
		addRepository('repositoryB');

		assert.deepStrictEqual(activeRepositories, [undefined, 'repositoryA', 'repositoryB']);
	}));

	test('follows providers that are hidden and shown while they are registered, in one change', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const repositories: ISCMRepository[] = [];
		const onDidAddRepository = disposables.add(new Emitter<ISCMRepository>());
		instantiationService.stub(ISCMService, new class extends mock<ISCMService>() {
			override readonly repositories = repositories;
			override readonly onDidAddRepository = onDidAddRepository.event;
			override readonly onDidRemoveRepository = Event.None;
			override getRepository(): ISCMRepository | undefined { return undefined; }
		}());
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly activeEditor = undefined;
			override readonly onDidActiveEditorChange = Event.None;
		}());

		const scmViewService = disposables.add(instantiationService.createInstance(SCMViewService));
		const menus = disposables.add(scmViewService.menus as SCMMenus);
		disposables.add(menus.titleMenu);

		const addRepository = (id: string, isHidden: boolean) => {
			const hidden = observableValue(id, isHidden);
			const provider = new class extends mock<ISCMProvider>() {
				override readonly id = id;
				override readonly providerId = 'test';
				override readonly label = id;
				override readonly rootUri = URI.file(`/${id}`);
				override readonly isHidden = hidden;
			}();
			const repository = new class extends mock<ISCMRepository>() {
				override readonly id = id;
				override readonly provider = provider;
			}();

			repositories.push(repository);
			onDidAddRepository.fire(repository);
			return hidden;
		};

		const current = addRepository('current', false);
		const warm = addRepository('warm', true);
		const before = scmViewService.repositories.map(r => r.id);

		transaction(tx => {
			warm.set(false, tx);
			current.set(true, tx);
		});

		assert.deepStrictEqual({
			before,
			after: scmViewService.repositories.map(r => r.id),
			visible: scmViewService.visibleRepositories.map(r => r.id)
		}, {
			before: ['current'],
			after: ['warm'],
			visible: ['warm']
		});
	}));

	test('the active repository is the shown one while the repository of the active editor is hidden', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const repositories: ISCMRepository[] = [];
		const onDidAddRepository = disposables.add(new Emitter<ISCMRepository>());
		instantiationService.stub(ISCMService, new class extends mock<ISCMService>() {
			override readonly repositories = repositories;
			override readonly onDidAddRepository = onDidAddRepository.event;
			override readonly onDidRemoveRepository = Event.None;
			override getRepository(idOrResource: string | URI): ISCMRepository | undefined {
				return repositories.find(r => URI.isUri(idOrResource) && isEqualOrParent(idOrResource, r.provider.rootUri!));
			}
		}());

		const activeEditor = disposables.add(new TestFileEditorInput(URI.file('/left/file.txt'), 'testEditor'));
		const onDidActiveEditorChange = disposables.add(new Emitter<void>());
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly activeEditor = activeEditor;
			override readonly onDidActiveEditorChange = onDidActiveEditorChange.event;
		}());

		const scmViewService = disposables.add(instantiationService.createInstance(SCMViewService));
		const menus = disposables.add(scmViewService.menus as SCMMenus);
		disposables.add(menus.titleMenu);

		disposables.add(autorun(reader => scmViewService.activeRepository.read(reader)));

		const addRepository = (id: string, isHidden: boolean) => {
			const hidden = observableValue(id, isHidden);
			const provider = new class extends mock<ISCMProvider>() {
				override readonly id = id;
				override readonly providerId = 'test';
				override readonly label = id;
				override readonly rootUri = URI.file(`/${id}`);
				override readonly isHidden = hidden;
			}();
			const repository = new class extends mock<ISCMRepository>() {
				override readonly id = id;
				override readonly provider = provider;
			}();

			repositories.push(repository);
			onDidAddRepository.fire(repository);
			return hidden;
		};

		const left = addRepository('left', false);
		const opened = addRepository('opened', true);

		// The repository of the location that is left is hidden while the new one opens, and its editor is active again
		left.set(true, undefined);
		onDidActiveEditorChange.fire();
		const whileOpening = scmViewService.activeRepository.get()?.repository.id;
		transaction(tx => {
			opened.set(false, tx);
		});

		assert.deepStrictEqual({ whileOpening, shown: scmViewService.activeRepository.get()?.repository.id }, { whileOpening: undefined, shown: 'opened' });
	}));
});
