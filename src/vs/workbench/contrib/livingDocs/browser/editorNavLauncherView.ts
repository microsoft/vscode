/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { DOCUMENTS_CONTAINER_ID, ILivingDocsService } from '../common/livingDocs.js';
import { ScreenEditorInput } from './screenEditorInput.js';

// D25-B: what the "Editor" nav item opens. Preference order (all reuse the existing open-doc path -
// the editor resolver turns a `.md` resource into the Living Document editor):
//   1. the currently active Living Document (already there - just keep/reveal it),
//   2. the most-recently-active Living Document from editor history,
//   3. the first document in the open folder,
//   4. no documents at all -> the Home screen (the calm on-ramp; there is nothing to edit yet).
// A folder-scoped quick-pick is a deliberate later refinement; the recency-then-first default keeps
// iter 1 dependency-light and always lands the user on real prose when any exists.
export async function openEditorNavTarget(accessor: ServicesAccessor, pinned: boolean): Promise<void> {
	const editors = accessor.get(IEditorService);
	const history = accessor.get(IHistoryService);
	const livingDocs = accessor.get(ILivingDocsService);
	const instantiation = accessor.get(IInstantiationService);

	const docs = await livingDocs.listDocuments();
	const docResources = docs.map(doc => doc.resource);

	const isDoc = (resource: URI | undefined): boolean => !!resource && docResources.some(candidate => isEqual(candidate, resource));

	// 1. Already on a Living Document -> reveal it (no-op reopen).
	const active = editors.activeEditor?.resource;
	if (isDoc(active)) {
		await editors.openEditor({ resource: active!, options: { pinned, revealIfOpened: true } });
		return;
	}

	// 2. Most-recently-active Living Document from editor history.
	for (const entry of history.getHistory()) {
		const resource = entry.resource;
		if (isDoc(resource)) {
			await editors.openEditor({ resource: resource!, options: { pinned, revealIfOpened: true } });
			return;
		}
	}

	// 3. The first document in the open folder.
	if (docResources.length > 0) {
		await editors.openEditor({ resource: docResources[0], options: { pinned, revealIfOpened: true } });
		return;
	}

	// 4. No documents -> the Home screen (calm on-ramp).
	await editors.openEditor(instantiation.createInstance(ScreenEditorInput, 'home'), { pinned, revealIfOpened: true });
}

// The activity-bar launcher for the "Editor" nav item. Mirrors ScreenLauncherView: selecting the icon
// opens the target document in the main area, then bounces the sidebar back to the tree-rail so the
// comp's persistent left rail stays put rather than this stub launcher.
export class EditorNavLauncherView extends ViewPane {

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
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._body = append(container, $('.living-docs-launcher'));
		this._injectStyles(container);
		this._renderContent();
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
		const title = append(body, $('div.ldl-title'));
		title.textContent = 'Editor';
		const blurb = append(body, $('div.ldl-blurb'));
		blurb.textContent = 'Open the document you were working on, or the first document in this folder.';
		const open = append(body, $('button.ldl-open')) as HTMLButtonElement;
		open.textContent = 'Open Editor';
		this._register(addDisposableListener(open, 'click', () => this._open(true)));
	}

	private _open(pinned: boolean): void {
		void this.instantiationService.invokeFunction(accessor => openEditorNavTarget(accessor, pinned));
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
