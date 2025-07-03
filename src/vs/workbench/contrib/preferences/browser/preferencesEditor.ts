/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/preferencesEditor.css';
import * as DOM from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Event } from '../../../../base/common/event.js';
import { getInputBoxStyle } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { CONTEXT_PREFERENCES_SEARCH_FOCUS } from '../common/preferences.js';
import { settingsTextInputBorder } from '../common/settingsEditorColorRegistry.js';
import { SearchWidget } from './preferencesWidgets.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IPreferencesEditorPaneRegistry, Extensions, IPreferencesEditorPaneDescriptor, IPreferencesEditorPane } from './preferencesEditorRegistry.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';

class PreferenceTabAction extends Action {
	constructor(readonly descriptor: IPreferencesEditorPaneDescriptor, actionCallback: () => void) {
		super(descriptor.id, descriptor.title, '', true, actionCallback);
	}
}

export class PreferencesEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.preferences';

	private readonly editorPanesRegistry = Registry.as<IPreferencesEditorPaneRegistry>(Extensions.PreferencesEditorPane);

	private readonly element: HTMLElement;
	private readonly bodyElement: HTMLElement;
	private readonly searchWidget: SearchWidget;
	private readonly preferencesTabActionBar: ActionBar;
	private readonly preferencesTabActions: PreferenceTabAction[] = [];
	private readonly preferencesEditorPane = this._register(new MutableDisposable<IPreferencesEditorPane>());

	private readonly searchFocusContextKey: IContextKey<boolean>;

	private dimension: DOM.Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(PreferencesEditor.ID, group, telemetryService, themeService, storageService);

		this.searchFocusContextKey = CONTEXT_PREFERENCES_SEARCH_FOCUS.bindTo(contextKeyService);

		this.element = DOM.$('.preferences-editor');
		const headerContainer = DOM.append(this.element, DOM.$('.preferences-editor-header'));

		const searchContainer = DOM.append(headerContainer, DOM.$('.search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, searchContainer, {
			focusKey: this.searchFocusContextKey,
			inputBoxStyles: getInputBoxStyle({
				inputBorder: settingsTextInputBorder
			})
		}));
		this._register(Event.debounce(this.searchWidget.onDidChange, () => undefined, 300)(() => {
			this.preferencesEditorPane.value?.search(this.searchWidget.getValue());
		}));

		const preferencesTabsContainer = DOM.append(headerContainer, DOM.$('.preferences-tabs-container'));
		this.preferencesTabActionBar = this._register(new ActionBar(preferencesTabsContainer, {
			orientation: ActionsOrientation.HORIZONTAL,
			focusOnlyEnabledItems: true,
			ariaLabel: localize('preferencesTabSwitcherBarAriaLabel', "Preferences Tab Switcher"),
			ariaRole: 'tablist',
		}));
		this.onDidChangePreferencesEditorPane(this.editorPanesRegistry.getPreferencesEditorPanes(), []);
		this._register(this.editorPanesRegistry.onDidRegisterPreferencesEditorPanes(descriptors => this.onDidChangePreferencesEditorPane(descriptors, [])));
		this._register(this.editorPanesRegistry.onDidDeregisterPreferencesEditorPanes(descriptors => this.onDidChangePreferencesEditorPane([], descriptors)));

		this.bodyElement = DOM.append(this.element, DOM.$('.preferences-editor-body'));
	}

	protected createEditor(parent: HTMLElement): void {
		DOM.append(parent, this.element);
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.searchWidget.layout(dimension);
		this.searchWidget.inputBox.inputElement.style.paddingRight = `12px`;

		this.preferencesEditorPane.value?.layout(new DOM.Dimension(this.bodyElement.clientWidth, dimension.height - 87 /* header height */));
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (this.preferencesTabActions.length) {
			this.onDidSelectPreferencesEditorPane(this.preferencesTabActions[0].id);
		}
	}

	private onDidChangePreferencesEditorPane(toAdd: readonly IPreferencesEditorPaneDescriptor[], toRemove: readonly IPreferencesEditorPaneDescriptor[]): void {
		for (const desc of toRemove) {
			const index = this.preferencesTabActions.findIndex(action => action.id === desc.id);
			if (index !== -1) {
				this.preferencesTabActionBar.pull(index);
				this.preferencesTabActions[index].dispose();
				this.preferencesTabActions.splice(index, 1);
			}
		}
		if (toAdd.length > 0) {
			const all = this.editorPanesRegistry.getPreferencesEditorPanes();
			for (const desc of toAdd) {
				const index = all.findIndex(action => action.id === desc.id);
				if (index !== -1) {
					const action = new PreferenceTabAction(desc, () => this.onDidSelectPreferencesEditorPane(desc.id));
					this.preferencesTabActions.splice(index, 0, action);
					this.preferencesTabActionBar.push(action, { index });
				}
			}
		}
	}

	private onDidSelectPreferencesEditorPane(id: string): void {
		let selectedAction: PreferenceTabAction | undefined;
		for (const action of this.preferencesTabActions) {
			if (action.id === id) {
				action.checked = true;
				selectedAction = action;
			} else {
				action.checked = false;
			}
		}

		if (selectedAction) {
			this.searchWidget.inputBox.setPlaceHolder(localize('FullTextSearchPlaceholder', "Search {0}", selectedAction.descriptor.title));
			this.searchWidget.inputBox.setAriaLabel(localize('FullTextSearchPlaceholder', "Search {0}", selectedAction.descriptor.title));
		}

		this.renderBody(selectedAction?.descriptor);

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	private renderBody(descriptor?: IPreferencesEditorPaneDescriptor): void {
		this.preferencesEditorPane.value = undefined;
		DOM.clearNode(this.bodyElement);

		if (descriptor) {
			const editorPane = this.instantiationService.createInstance<IPreferencesEditorPane>(descriptor.ctorDescriptor.ctor);
			this.preferencesEditorPane.value = editorPane;
			this.bodyElement.appendChild(editorPane.getDomNode());
		}
	}

	override dispose(): void {
		super.dispose();
		this.preferencesTabActions.forEach(action => action.dispose());
	}
}

