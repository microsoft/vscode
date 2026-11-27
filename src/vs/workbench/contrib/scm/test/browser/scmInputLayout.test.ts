/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { ObjectTree } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { retry } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SCMInputWidget } from '../../browser/scmInput.js';
import { ISCMInput, ISCMProvider, ISCMRepository, ISCMViewService } from '../../common/scm.js';
import '../../../../browser/parts/views/media/views.css';
import '../../../modernUI/browser/media/padding.css';

suite('SCM input layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('root controls have symmetric insets without flattening nested controls', async () => {
		const root = append(document.body, $('.monaco-workbench.modern-ui'));
		store.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
		const container = append(root, $('.scm-view.file-icon-themable-tree'));
		container.style.width = '300px';
		container.style.height = '240px';

		type Element = 'repository' | 'input' | 'button' | 'notice';
		const delegate: IListVirtualDelegate<Element> = {
			getHeight: () => 40,
			getTemplateId: () => 'row'
		};
		const renderer: ITreeRenderer<Element, void, HTMLElement> = {
			templateId: 'row',
			renderTemplate: element => append(element, $('div')),
			renderElement: (node: ITreeNode<Element, void>, _index, element) => {
				element.className = node.element === 'input' ? 'scm-input' : node.element === 'button' ? 'button-container' : node.element === 'notice' ? 'scm-repository-notice-container' : 'repository';
				element.replaceChildren();
				if (node.element !== 'repository') {
					const control = append(element, $('div'));
					control.className = node.element === 'input' ? 'scm-editor' : node.element === 'button' ? 'monaco-button-dropdown' : 'scm-repository-notice';
					control.style.width = '100%';
				}
			},
			disposeTemplate: () => { }
		};
		const tree = store.add(new ObjectTree<Element>('test.scmInputLayout', container, delegate, [renderer], {
			indent: 4,
			accessibilityProvider: { getAriaLabel: element => element, getWidgetAriaLabel: () => 'SCM' },
			twistieAdditionalCssClass: element => element === 'repository' ? undefined : 'force-no-twistie'
		}));
		tree.layout(240, 300);
		const children = [{ element: 'input' as const }, { element: 'button' as const }, { element: 'notice' as const }];
		const insets = () => [...container.querySelectorAll<HTMLElement>('.scm-input, .button-container, .scm-repository-notice-container')].map(element => {
			const row = element.closest('.monaco-list-row')!.getBoundingClientRect();
			const control = element.firstElementChild!.getBoundingClientRect();
			return [control.left - row.left, row.right - control.right];
		});

		tree.setChildren(null, children);
		await retry(() => {
			assert.deepStrictEqual(insets(), [[8, 8], [8, 8], [8, 8]]);
			return Promise.resolve();
		}, 10, 100);
		tree.setChildren(null, [{ element: 'repository', children }]);
		assert.deepStrictEqual(insets(), [[23, 4], [23, 4], [23, 4]]);
	});

	test('resizes the embedded editor when modern UI changes the input width', async () => {
		const root = append(document.body, $('.monaco-workbench.modern-ui'));
		store.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
		const view = append(root, $('.scm-view'));
		view.style.width = '300px';
		const row = append(view, $('.monaco-list-row'));
		row.setAttribute('aria-level', '1');
		const contents = append(row, $('.monaco-tl-contents'));
		const input = append(contents, $('.scm-input'));
		const config = new TestConfigurationService({ 'scm.inputFontFamily': 'default', 'scm.inputFontSize': 14, 'editor.wordBasedSuggestions': 'off' });
		const instantiationService = workbenchInstantiationService({ configurationService: () => config }, store);
		instantiationService.stub(ISCMViewService, new class extends mock<ISCMViewService>() { });
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const widget = store.add(instantiationService.createInstance(SCMInputWidget, input, root));
		const model = store.add(instantiationService.get(IModelService).createModel('', null));
		const provider = new class extends mock<ISCMProvider>() {
			override readonly id = 'test';
			override readonly providerId = 'test';
			override readonly rootUri = undefined;
			override readonly inputBoxTextModel = model;
			override readonly commitTemplate = constObservable('');
			override readonly groups = [];
			override readonly onDidChangeResources = Event.None;
		};
		const repository = new class extends mock<ISCMRepository>() {
			override readonly id = 'test';
			override readonly provider = provider;
		};
		widget.input = new class extends mock<ISCMInput>() {
			override readonly repository = repository;
			override readonly value = '';
			override readonly placeholder = 'Message';
			override readonly enabled = true;
			override readonly visible = true;
			override readonly onDidChange = Event.None;
			override readonly onDidChangeFocus = Event.None;
			override readonly onDidChangeValidationMessage = Event.None;
			override readonly onDidChangeValidateInput = Event.None;
			override readonly onDidClearValidation = Event.None;
			override readonly onDidChangePlaceholder = Event.None;
			override readonly onDidChangeEnablement = Event.None;
			override setValue(): void { }
			override validateInput = async () => undefined;
		};
		const editor = input.querySelector<HTMLElement>('.monaco-editor')!;
		const box = input.querySelector<HTMLElement>('.scm-editor')!;

		for (const modern of [true, false, true]) {
			root.classList.toggle('modern-ui', modern);
			await retry(() => {
				assert.strictEqual(editor.clientWidth, box.clientWidth);
				return Promise.resolve();
			}, 10, 100);
		}
	});
});
