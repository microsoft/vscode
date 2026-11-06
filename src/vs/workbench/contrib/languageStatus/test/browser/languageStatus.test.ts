/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { LinkedText } from '../../../../../base/common/linkedText.js';
import Severity from '../../../../../base/common/severity.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorType } from '../../../../../editor/common/editorCommon.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../../../services/languageStatus/common/languageStatusService.js';
import { IStatusbarEntry, IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { LanguageStatusContribution } from '../../browser/languageStatus.js';

suite('LanguageStatus - detail rendering', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(detail: ILanguageStatus['detail']) {
		const contributionStore = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const entries = new Map<string, IStatusbarEntry>();
		const opened: string[] = [];
		const model = store.add(createTextModel('value'));
		const editor = new class extends mock<ICodeEditor>() {
			override readonly onDidChangeModelLanguage = Event.None;
			override getEditorType() { return EditorType.ICodeEditor; }
			override hasModel(): this is IActiveCodeEditor { return true; }
			override getModel() { return model; }
			override getContainerDomNode() { return document.body; }
		};
		const status: ILanguageStatus = {
			id: 'test.status',
			name: 'Test',
			selector: '*',
			severity: Severity.Info,
			label: 'Ready',
			detail,
			busy: false,
			source: '',
			command: undefined,
			accessibilityInfo: undefined,
		};
		const onWillDispose = new Emitter<void>();
		contributionStore.add(toDisposable(() => {
			onWillDispose.fire();
			onWillDispose.dispose();
		}));
		const part = new class extends mock<IEditorPart>() {
			override readonly onWillDispose = onWillDispose.event;
		};

		instantiationService.stub(ILanguageStatusService, {
			onDidChange: Event.None,
			getLanguageStatus: () => [status],
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly onDidActiveEditorChange = Event.None;
			override get activeTextEditorControl() { return editor; }
		});
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override readonly parts = [part];
			override readonly onDidCreateAuxiliaryEditorPart = Event.None;
			override getScopedInstantiationService() { return instantiationService; }
		});
		instantiationService.stub(IStatusbarService, {
			onDidChangeEntryVisibility: Event.None,
			addEntry: (entry, id) => {
				entries.set(id, entry);
				return {
					update: entry => entries.set(id, entry),
					dispose: () => entries.delete(id),
				};
			},
		});
		instantiationService.stub(IOpenerService, {
			open: async target => {
				opened.push(target.toString());
				return true;
			},
		});
		instantiationService.get(IStorageService).store('languageStatus.dedicated', JSON.stringify([status.id]), StorageScope.PROFILE, StorageTarget.USER);
		contributionStore.add(instantiationService.createInstance(LanguageStatusContribution));

		const combined = entries.get('status.languageStatus')?.tooltip;
		const dedicatedEntry = entries.get(status.id);
		const dedicated = dedicatedEntry?.tooltip;
		assert.ok(dom.isHTMLElement(combined) && dom.isHTMLElement(dedicated));
		const left = combined.querySelector<HTMLElement>('.left');
		assert.ok(left);
		return { left, dedicated, dedicatedEntry, opened };
	}

	for (const detail of [
		'Extension \'[Configure](command:test.command?%5B%22argument%22%5D)\' is not available.',
		'[Website](https://example.com) <a href="command:test.command">Command</a>',
		'**bold** `code` $(sync)',
	]) {
		test(`renders literal detail without links: ${detail}`, () => {
			const { left, dedicated } = render(detail);
			assert.deepStrictEqual({
				combinedLinks: left.querySelectorAll('a').length,
				dedicatedLinks: dedicated.querySelectorAll('a').length,
				combinedText: left.textContent?.replace(/^Ready/, ''),
				dedicatedText: dedicated.textContent,
			}, {
				combinedLinks: 0,
				dedicatedLinks: 0,
				combinedText: detail.replace('$(sync)', ''),
				dedicatedText: detail.replace('$(sync)', ''),
			});
		});
	}

	test('preserves explicit links without parsing adjacent text or link labels', () => {
		const literal = '[Not a link](command:test.injected)';
		const detail = new LinkedText([literal, ' ', { label: 'Show Log', href: 'command:test.showLog?%5B1%5D' }, ' ', { label: literal, href: 'https://example.com' }]);
		const { left, dedicated, dedicatedEntry } = render(detail);
		assert.deepStrictEqual({
			combined: Array.from(left.querySelectorAll('a'), link => ({ text: link.textContent, href: link.getAttribute('href') })),
			dedicated: Array.from(dedicated.querySelectorAll('a'), link => ({ text: link.textContent, href: link.getAttribute('href') })),
			ariaLabel: dedicatedEntry?.ariaLabel,
		}, {
			combined: [{ text: 'Show Log', href: 'command:test.showLog?%5B1%5D' }, { text: literal, href: 'https://example.com' }],
			dedicated: [{ text: 'Show Log', href: 'command:test.showLog?%5B1%5D' }, { text: literal, href: 'https://example.com' }],
			ariaLabel: `Ready, ${literal} Show Log ${literal}`,
		});
	});

	test('explicit links support pointer and keyboard activation on both surfaces', () => {
		const href = 'command:test.showLog?%5B1%5D';
		const { left, dedicated, opened } = render(new LinkedText([{ label: 'Show Log', href }]));
		for (const surface of [left, dedicated]) {
			const link = surface.querySelector('a');
			assert.ok(link);
			link.click();
			link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		}
		assert.deepStrictEqual(opened, Array(6).fill(href));
	});

	test('empty detail has no separator and preserves the accessible label', () => {
		const { left, dedicated, dedicatedEntry } = render('');
		assert.deepStrictEqual({
			separators: left.querySelectorAll('.separator').length,
			tooltip: dedicated.textContent,
			ariaLabel: dedicatedEntry?.ariaLabel,
		}, { separators: 0, tooltip: '', ariaLabel: 'Ready' });
	});
});
