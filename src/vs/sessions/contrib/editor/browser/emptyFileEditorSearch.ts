/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { AnythingQuickAccessProviderRunOptions } from '../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickItemWithResource, QuickInputType } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionWorkspace } from '../../../services/sessions/common/session.js';

export const EmptyFileEditorSearchFocusedContext = new RawContextKey<boolean>('emptyFileEditorSearchFocused', false, localize('emptyFileEditorSearchFocused', "Whether focus is in the empty Files editor search."));

export class EmptyFileEditorSearch extends Disposable {

	private readonly input: InputBox;
	private readonly inputContainer: HTMLElement;
	private readonly pickerDisposables = this._register(new MutableDisposable<DisposableStore>());
	private picker: IQuickPick<IQuickPickItem, { useSeparators: true }> | undefined;
	private restoreInputFocusOnHide = false;
	private syncingPickerValue = false;
	private workspace: ISessionWorkspace | undefined;

	constructor(
		container: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();

		const scopedContextKeyService = this._register(contextKeyService.createScoped(container));
		const focusedContext = EmptyFileEditorSearchFocusedContext.bindTo(scopedContextKeyService);
		const focusTracker = this._register(dom.trackFocus(container));
		this._register(focusTracker.onDidFocus(() => focusedContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusedContext.set(false)));
		this._register(toDisposable(() => focusedContext.reset()));

		this.inputContainer = dom.append(container, dom.$('.empty-file-editor-search-input'));
		const searchIcon = dom.append(this.inputContainer, dom.$('span.empty-file-editor-search-icon'));
		searchIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.search));
		searchIcon.setAttribute('aria-hidden', 'true');
		this.input = this._register(new InputBox(this.inputContainer, undefined, {
			ariaLabel: localize('emptyFileEditor.searchAriaLabel', "Search files in the session workspace"),
			placeholder: localize('emptyFileEditor.searchPlaceholder', "Search files by name"),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this._register(this.input.onDidChange(value => this.onDidChangeValue(value)));
		this._register(dom.addDisposableListener(this.input.inputElement, dom.EventType.FOCUS, () => this.showPicker()));
		this._register(dom.addDisposableListener(dom.getWindow(this.inputContainer), dom.EventType.KEY_DOWN, event => {
			if (this.picker && new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				this.restoreInputFocusOnHide = true;
				this.picker.value = '';
			}
		}, true));
		this._register(dom.addDisposableListener(dom.getWindow(this.inputContainer), dom.EventType.POINTER_DOWN, event => {
			if (this.picker && dom.isHTMLElement(event.target) && event.target.closest('.monaco-sash')) {
				this.picker.hide();
			}
		}, true));
		this._register(dom.addDisposableListener(this.input.inputElement, dom.EventType.KEY_DOWN, event => {
			if (!this.picker && this.input.value && new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				event.preventDefault();
				event.stopPropagation();
				this.input.value = '';
			}
		}));
	}

	setWorkspace(workspace: ISessionWorkspace | undefined): void {
		this.workspace = workspace;
		if (this.picker?.value) {
			this.restoreInputFocusOnHide = true;
			this.picker.hide();
		}
	}

	private onDidChangeValue(value: string): void {
		if (this.syncingPickerValue) {
			return;
		}
		if (!value.trim()) {
			this.restoreInputFocusOnHide = !!this.picker;
			this.picker?.hide();
			return;
		}

		this.showPicker();
	}

	private showPicker(): void {
		if (this.picker || !this.input.value.trim()) {
			return;
		}

		const providerOptions: AnythingQuickAccessProviderRunOptions = {
			filesOnly: true,
			fileSearchFolders: this.workspace?.folders.map(folder => ({ uri: folder.root, name: folder.name })) ?? [],
		};
		const disposables = new DisposableStore();
		this.pickerDisposables.value = disposables;
		const pickerReference: { value?: IQuickPick<IQuickPickItem, { useSeparators: true }> } = {};
		disposables.add(Event.once(this.quickInputService.onHide)(() => {
			const picker = pickerReference.value;
			if (!picker || this.picker !== picker) {
				return;
			}
			const restoreInputFocus = this.restoreInputFocusOnHide;
			this.restoreInputFocusOnHide = false;
			this.setInputValue(picker.value);
			this.inputContainer.style.visibility = '';
			this.picker = undefined;
			this.pickerDisposables.clear();
			if (restoreInputFocus) {
				this.input.focus();
			}
		}));
		const picks = this.quickInputService.quickAccess.pick(this.input.value, {
			anchor: this.input.element,
			anchorPosition: 'overlay',
			preserveValue: true,
			enabledProviderPrefixes: [''],
			placeholder: localize('emptyFileEditor.searchPlaceholder', "Search files by name"),
			providerOptions,
		});
		const currentQuickInput = this.quickInputService.currentQuickInput;
		if (currentQuickInput?.type !== QuickInputType.QuickPick) {
			this.pickerDisposables.clear();
			return;
		}
		const picker = currentQuickInput as IQuickPick<IQuickPickItem, { useSeparators: true }>;
		pickerReference.value = picker;

		this.picker = picker;
		disposables.add(toDisposable(() => picker.hide()));

		picker.ariaLabel = localize('emptyFileEditor.searchAriaLabel', "Search files in the session workspace");
		picker.inputIcon = Codicon.search;
		picker.ignoreFocusOut = false;
		picker.valueSelection = [picker.value.length, picker.value.length];

		disposables.add(picker.onDidChangeValue(value => {
			this.setInputValue(value);
			if (!value.trim()) {
				this.restoreInputFocusOnHide = true;
				picker.hide();
			}
		}));
		this.inputContainer.style.visibility = 'hidden';
		void picks.then(items => {
			const resource = (items?.[0] as IQuickPickItemWithResource | undefined)?.resource;
			if (resource) {
				void this.editorService.openEditor({
					resource,
					options: { pinned: true },
				});
			}
		});
	}

	private setInputValue(value: string): void {
		this.syncingPickerValue = true;
		try {
			this.input.value = value;
		} finally {
			this.syncingPickerValue = false;
		}
	}
}
