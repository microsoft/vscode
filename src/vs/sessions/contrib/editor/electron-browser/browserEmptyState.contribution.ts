/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/browserEmptyState.css';
import { $ } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { BrowserEditorInput } from '../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IBrowserViewModel } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, IBrowserEditorWidget } from '../../../../workbench/contrib/browserView/electron-browser/browserEditor.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsEmptyStateActions } from '../../../browser/parts/sessionsEmptyStateActions.js';
import { SessionsEmptyStateLayout } from '../../../browser/parts/sessionsEmptyStateLayout.js';

export class SessionsBrowserEmptyState extends BrowserEditorContribution {
	private readonly element = $('.sessions-browser-empty-state');
	private root: HTMLElement | undefined;
	private empty = true;
	private emptyStateLayout: SessionsEmptyStateLayout | undefined;
	private readonly actions: SessionsEmptyStateActions;

	constructor(
		editor: BrowserEditor,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(editor);
		this.actions = this._register(instantiationService.createInstance(SessionsEmptyStateActions, this.element, Menus.EmptyBrowserEditorActions, {
			ariaLabel: localize('browser.emptyActions', "Browser actions"),
			telemetrySource: 'browser.emptyState',
			menuOptions: { arg: editor },
		}));
		this._register(toDisposable(() => this.root?.classList.remove('sessions-browser-empty')));
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.Toolbar, element: this.element, order: 1 }];
	}

	override onContainerCreated(container: HTMLElement): void {
		this.root = container.closest<HTMLElement>('.browser-root') ?? undefined;
		this.setEmpty(this.empty);
		if (this.root) {
			this.emptyStateLayout = this._register(new SessionsEmptyStateLayout(this.root, [this.element]));
		}
	}

	override onPaneResized(): void {
		this.emptyStateLayout?.layout();
	}

	override afterContainerLayout(): void {
		this.emptyStateLayout?.layout();
	}

	override tryFocus(): boolean {
		if (!this.empty) {
			return false;
		}
		this.actions.focus();
		return true;
	}

	override prerenderInput(input: BrowserEditorInput): void {
		this.setEmpty(!input.url);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this.setEmpty(!model.url);
		store.add(model.onWillNavigate(url => {
			if (url) {
				this.setEmpty(false);
			}
		}));
		store.add(model.onDidNavigate(event => this.setEmpty(!event.url)));
	}

	override onModelDetached(): void {
		this.setEmpty(true);
	}

	private setEmpty(empty: boolean): void {
		this.empty = empty;
		this.element.hidden = !empty;
		if (this.root && this.root.classList.contains('sessions-browser-empty') !== empty) {
			this.root.classList.toggle('sessions-browser-empty', empty);
			this.editor.layoutBrowserContainer();
		}
		this.emptyStateLayout?.layout();
	}
}

BrowserEditor.registerContribution(SessionsBrowserEmptyState);
MenuRegistry.appendMenuItems([
	{
		id: Menus.EmptyBrowserEditorActions,
		item: {
			command: {
				id: BrowserViewCommandId.FocusUrlInput,
				title: localize2('browser.openAddress', "Open Address..."),
				icon: registerIcon('sessions-browser-open-address', Codicon.link, localize('browser.openAddressIcon', "Icon for entering a browser address.")),
			},
			group: 'navigation',
			order: 1,
		},
	},
	{
		id: Menus.EmptyBrowserEditorActions,
		item: {
			command: {
				id: BrowserViewCommandId.ShowHistory,
				title: localize2('browser.history', "History"),
				icon: registerIcon('sessions-browser-history', Codicon.history, localize('browser.historyIcon', "Icon for browser history.")),
			},
			group: 'navigation',
			order: 2,
		},
	},
]);
