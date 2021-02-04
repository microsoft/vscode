/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IAction } from 'vs/base/common/actions';
import { Delayer } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextScopedHistoryInputBox } from 'vs/platform/browser/contextScopedHistoryWidget';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';

export interface ITestExplorerFilterState {
	_serviceBrand: undefined;
	readonly onDidChange: Event<string>;
	readonly onDidRequestReveal: Event<string[]>;
	value: string;
	reveal: string[] | undefined;

	readonly onDidRequestInputFocus: Event<void>;
	focusInput(): void;
}

export const ITestExplorerFilterState = createDecorator<ITestExplorerFilterState>('testingFilterState');

export class TestExplorerFilterState implements ITestExplorerFilterState {
	declare _serviceBrand: undefined;
	private readonly revealRequest = new Emitter<string[]>();
	private readonly changeEmitter = new Emitter<string>();
	private readonly focusEmitter = new Emitter<void>();
	private _value = '';
	private _reveal?: string[];

	public readonly onDidRequestInputFocus = this.focusEmitter.event;
	public readonly onDidRequestReveal = this.revealRequest.event;
	public readonly onDidChange = this.changeEmitter.event;

	public get reveal() {
		return this._reveal;
	}

	public set reveal(v: string[] | undefined) {
		this._reveal = v;
		if (v !== undefined) {
			this.revealRequest.fire(v);
		}
	}

	public get value() {
		return this._value;
	}

	public set value(v: string) {
		if (v !== this._value) {
			this._value = v;
			this.changeEmitter.fire(v);
		}
	}

	public focusInput() {
		this.focusEmitter.fire();
	}
}

export class TestingExplorerFilter extends BaseActionViewItem {
	private input!: HistoryInputBox;
	private readonly history: StoredValue<string[]> = this.instantiationService.createInstance(StoredValue, {
		key: 'testing.filterHistory',
		scope: StorageScope.WORKSPACE,
		target: StorageTarget.USER
	});

	constructor(
		action: IAction,
		@ITestExplorerFilterState private readonly state: ITestExplorerFilterState,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(null, action);
	}

	/**
	 * @override
	 */
	public render(container: HTMLElement) {
		container.classList.add('testing-filter-action-item');

		const updateDelayer = this._register(new Delayer<void>(400));
		const wrapper = dom.$('.testing-filter-wrapper');
		container.appendChild(wrapper);

		const input = this.input = this._register(this.instantiationService.createInstance(ContextScopedHistoryInputBox, wrapper, this.contextViewService, {
			placeholder: localize('testExplorerFilter', "Filter (e.g. text, !exclude)"),
			history: this.history.get([]),
		}));
		input.value = this.state.value;
		this._register(attachInputBoxStyler(input, this.themeService));

		this._register(this.state.onDidChange(newValue => {
			input.value = newValue;
		}));

		this._register(this.state.onDidRequestInputFocus(() => {
			input.focus();
		}));

		this._register(input.onDidChange(() => updateDelayer.trigger(() => {
			input.addToHistory();
			this.state.value = input.value;
		})));

		this._register(dom.addStandardDisposableListener(input.inputElement, dom.EventType.KEY_DOWN, e => {
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

	/**
	 * @override
	 */
	public dispose() {
		this.saveState();
		super.dispose();
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: Testing.FilterActionId,
			title: localize('filter', "Filter"),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(ContextKeyEqualsExpr.create('view', Testing.ExplorerViewId), TestingContextKeys.explorerLocation.isEqualTo(ViewContainerLocation.Panel)),
				group: 'navigation',
				order: 1,
			},
		});
	}
	async run(): Promise<void> { }
});
