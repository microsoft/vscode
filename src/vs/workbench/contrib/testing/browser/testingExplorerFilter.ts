/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addStandardDisposableListener, EventType } from 'vs/base/browser/dom';
import { HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Widget } from 'vs/base/browser/ui/widget';
import { Delayer } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { ContextScopedHistoryInputBox } from 'vs/platform/browser/contextScopedHistoryWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';

export class TestingFilterState {
	private readonly changeEmitter = new Emitter<string>();

	public readonly onDidChange = this.changeEmitter.event;

	public get value() {
		return this._value;
	}

	public set value(v: string) {
		if (v !== this._value) {
			this._value = v;
			this.changeEmitter.fire(v);
		}
	}

	constructor(private _value = '') { }
}

export class TestingExplorerFilter extends Widget {
	private readonly input: HistoryInputBox;
	private readonly history: StoredValue<string[]> = this.instantiationService.createInstance(StoredValue, {
		key: 'testing.filterHistory',
		scope: StorageScope.WORKSPACE,
		target: StorageTarget.USER
	});

	constructor(
		container: HTMLElement,
		private readonly state: TestingFilterState,
		@IContextViewService contextViewService: IContextViewService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const updateDelayer = this._register(new Delayer<void>(400));

		const input = this.input = this._register(instantiationService.createInstance(ContextScopedHistoryInputBox, container, contextViewService, {
			placeholder: localize('testExplorerFilter', "Filter (e.g. text, !exclude)"),
			history: this.history.get([]),
		}));
		input.value = state.value;
		this._register(attachInputBoxStyler(input, themeService));

		this._register(state.onDidChange(newValue => {
			input.value = newValue;
		}));

		this._register(input.onDidChange(() => updateDelayer.trigger(() => {
			input.addToHistory();
			this.state.value = input.value;
		})));

		this._register(addStandardDisposableListener(input.inputElement, EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Escape)) {
				input.value = '';
				e.stopPropagation();
				e.preventDefault();
			}
		}));
	}


	/**
	 * Focuses the filter input.
	 */
	public focus(): void {
		this.input.focus();
	}

	/**
	 * Persists changes to the input history.
	 */
	public saveState() {
		const history = this.input.getHistory();
		if (history.length) {
			this.history.store(history);
		} else {
			this.history.delete();
		}
	}
}
