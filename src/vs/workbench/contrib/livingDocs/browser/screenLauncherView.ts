/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { DOCUMENTS_CONTAINER_ID } from '../common/livingDocs.js';
import { ScreenEditorInput } from './screenEditorInput.js';
import { ScreenId } from './screenRender.js';

// Maps each activity-bar launcher view id to the screen it opens. Selecting the icon reveals this
// slim launcher and opens the full-width screen in the editor area (the comp's icon-nav behaviour).
const VIEW_TO_SCREEN: Record<string, { screen: ScreenId; title: string; blurb: string }> = {
	'workbench.view.livingDocs.home': { screen: 'home', title: 'Home', blurb: 'Your projects, quick-start actions, and what changed since your last visit.' },
	'workbench.view.livingDocs.templates': { screen: 'templates', title: 'Templates', blurb: 'Reusable starting points for new documents - use one, edit it, or create your own.' },
	'workbench.view.livingDocs.knowledge': { screen: 'knowledge', title: 'Knowledge', blurb: 'Every source your documents depend on - where it comes from, how fresh it is, and what relies on it.' },
	'workbench.view.livingDocs.agents': { screen: 'agents', title: 'Agents', blurb: 'Background agents that keep documents in sync with their sources. Open one to see its flow.' },
};

// A slim launcher in the activity-bar sidebar that opens its screen in the main editor area. The
// rich surface itself is a webview editor (ScreenEditor); this view is the icon-nav entry + a way
// back to the screen if its editor was closed.
export class ScreenLauncherView extends ViewPane {

	private _body: HTMLElement | undefined;
	private _stylesInjected = false;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IEditorService private readonly _editors: IEditorService,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	private get _meta() {
		return VIEW_TO_SCREEN[this.id] ?? VIEW_TO_SCREEN['workbench.view.livingDocs.templates'];
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._body = append(container, $('.living-docs-launcher'));
		this._injectStyles(container);
		this._renderContent();
		// Selecting the activity-bar icon reveals this view; open the screen in the main area so the
		// icon-nav behaves like the comp (icon -> full screen). Then bounce the sidebar back to the
		// tree-rail (Workspace) container so the comp's persistent left rail stays put rather than this
		// stub launcher (v3 iter 11 - closes the stub-launcher wrinkle). The bounce is deferred a tick so
		// it runs after the activity bar finishes revealing this container.
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this._open(false);
				this._register(disposableTimeout(() => void this._viewsService.openViewContainer(DOCUMENTS_CONTAINER_ID, false), 0));
			}
		}));
	}

	private _renderContent(): void {
		const body = this._body;
		if (!body) { return; }
		clearNode(body);
		const meta = this._meta;
		const title = append(body, $('div.ldl-title'));
		title.textContent = meta.title;
		const blurb = append(body, $('div.ldl-blurb'));
		blurb.textContent = meta.blurb;
		const open = append(body, $('button.ldl-open')) as HTMLButtonElement;
		open.textContent = `Open ${meta.title}`;
		this._register(addDisposableListener(open, 'click', () => this._open(true)));
	}

	private _open(pinned: boolean): void {
		const input = this.instantiationService.createInstance(ScreenEditorInput, this._meta.screen);
		void this._editors.openEditor(input, { pinned, preserveFocus: !pinned, revealIfOpened: true });
	}

	private _injectStyles(container: HTMLElement): void {
		if (this._stylesInjected) { return; }
		this._stylesInjected = true;
		const style = document.createElement('style');
		style.textContent = `
		.living-docs-launcher{padding:14px 12px;display:flex;flex-direction:column;gap:10px}
		.living-docs-launcher .ldl-title{font:600 14px/1.2 system-ui;color:var(--vscode-foreground)}
		.living-docs-launcher .ldl-blurb{font:400 12px/1.55 system-ui;color:var(--vscode-descriptionForeground)}
		.living-docs-launcher .ldl-open{margin-top:2px;border:none;border-radius:8px;padding:9px 11px;background:oklch(0.55 0.13 255);color:#fff;font:600 12px/1 system-ui;cursor:pointer}
		.living-docs-launcher .ldl-open:hover{background:oklch(0.5 0.13 255)}
		`;
		container.appendChild(style);
	}
}
