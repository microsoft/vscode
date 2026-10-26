/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { WorkbenchHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { QuickInputButtonLocation } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import {
	BROWSER_EDITOR_ACTIVE,
	BrowserActionCategory,
	BrowserActionGroup,
	BrowserEditor,
	BrowserEditorContribution,
	BrowserWidgetLocation,
	CONTEXT_BROWSER_HAS_URL,
	IBrowserEditorWidget,
	IBrowserUrlPickerAction,
	IBrowserUrlPickerActionProvider,
	IBrowserUrlSuggestion,
	IBrowserUrlSuggestionAction,
	IBrowserUrlSuggestionProvider,
} from '../browserEditor.js';

const CONTEXT_BROWSER_URL_IS_FAVORITED = new RawContextKey<boolean>('browserUrlIsFavorited', false, localize('browser.urlIsFavorited', "Whether the current browser URL is a favorite"));

/**
 * Clickable star indicator shown in the URL bar's PostUrl slot when the
 * current page is a favorite. Clicking it removes the favorite.
 */
class FavoriteIndicator extends Disposable {
	readonly element: HTMLElement;
	private readonly _button: Button;
	private readonly _onDidClick = this._register(new Emitter<void>());
	readonly onDidClick = this._onDidClick.event;

	constructor(
		instantiationService: IInstantiationService,
		private readonly _keybindingService: IKeybindingService,
	) {
		super();
		const hoverDelegate = this._register(instantiationService.createInstance(
			WorkbenchHoverDelegate,
			'element',
			undefined,
			{ position: { hoverPosition: HoverPosition.ABOVE } }
		));

		this.element = $('.browser-favorite-indicator-container');
		this.element.style.display = 'none';
		this._button = this._register(new Button(this.element, {
			supportIcons: true,
			title: this._tooltip(),
			small: true,
			hoverDelegate
		}));
		this._button.element.classList.add('browser-favorite-indicator');
		this._button.label = `$(${Codicon.starFull.id})`;
		this._button.element.setAttribute('aria-label', localize('browser.removeFavorite', "Remove from Favorites"));
		this._register(this._button.onDidClick(() => this._onDidClick.fire()));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => {
			this._button.setTitle(this._tooltip());
		}));
	}

	private _tooltip(): string {
		const kb = this._keybindingService.lookupKeybinding(BrowserViewCommandId.ToggleFavorite)?.getLabel();
		return kb
			? localize('browser.removeFavoriteWithKb', "Remove from Favorites ({0})", kb)
			: localize('browser.removeFavorite', "Remove from Favorites");
	}

	setVisible(visible: boolean): void {
		this.element.style.display = visible ? '' : 'none';
	}
}

/**
 * Workspace-scoped favorites: persists a set of favorite URLs and surfaces
 * them as URL bar suggestions plus a toggle button in the picker chrome.
 *
 * Favorites are URL strings only — no titles, icons, or other metadata are
 * persisted. We can't reliably capture rich metadata for arbitrary pages
 * across reloads, and keeping the model simple avoids stale-display bugs.
 */
export class BrowserFavoritesFeature extends BrowserEditorContribution {

	private static readonly STORAGE_KEY = 'workbench.browser.favorites';

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	private _urls = new Set<string>();

	private readonly _suggestionProvider: IBrowserUrlSuggestionProvider;
	private readonly _actionProvider: IBrowserUrlPickerActionProvider;
	private readonly _indicator: FavoriteIndicator;
	private readonly _isFavoriteContext: IContextKey<boolean>;

	constructor(
		editor: BrowserEditor,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(editor);
		this._load();
		this._isFavoriteContext = CONTEXT_BROWSER_URL_IS_FAVORITED.bindTo(contextKeyService);

		this._indicator = this._register(new FavoriteIndicator(instantiationService, this._keybindingService));
		this._register(this._indicator.onDidClick(() => this.toggleCurrent()));

		// React to external storage updates (e.g. another window writing the key).
		const storageListenerStore = this._register(new DisposableStore());
		this._register(this._storageService.onDidChangeValue(
			StorageScope.WORKSPACE, BrowserFavoritesFeature.STORAGE_KEY, storageListenerStore,
		)(() => {
			this._load();
			this._refresh();
			this._onDidChangeState.fire();
		}));

		this._suggestionProvider = {
			label: localize('browser.favorites', "Favorites"),
			order: 50,
			actions: [],
			onDidChange: this._onDidChangeState.event,
			getSuggestions: async ({ input }) => {
				const suggestions: IBrowserUrlSuggestion[] = [];
				const current = input.url;
				for (const url of this._urls) {
					if (url === current) {
						continue;
					}
					const deleteAction: IBrowserUrlSuggestionAction = {
						id: 'browser.favorites.delete',
						iconClass: ThemeIcon.asClassName(Codicon.trash),
						tooltip: localize('browser.removeFavorite', "Remove from Favorites"),
						run: () => this._remove(url),
					};
					suggestions.push({
						id: 'favorite:' + url,
						label: url,
						icon: Codicon.star,
						apply: target => target.navigate(url),
						actions: [deleteAction],
					});
				}
				return suggestions;
			},
		};

		this._actionProvider = {
			onDidChange: this._onDidChangeState.event,
			getActions: input => {
				const url = input.url;
				if (!url) {
					return [];
				}
				const favorite = this._urls.has(url);
				const tooltip = favorite
					? localize('browser.removeFavorite', "Remove from Favorites")
					: localize('browser.addFavorite', "Add to Favorites");
				const action: IBrowserUrlPickerAction = {
					id: 'browser.toggleFavorite',
					iconClass: ThemeIcon.asClassName(favorite ? Codicon.starFull : Codicon.star),
					tooltip,
					alwaysVisible: true,
					toggle: { checked: favorite },
					location: QuickInputButtonLocation.Input,
					run: target => {
						const u = target.url;
						if (u) {
							this._toggle(u);
						}
					},
				};
				return [action];
			},
		};
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.PostUrl, element: this._indicator.element, order: 60 }];
	}

	override get urlSuggestionProviders(): readonly IBrowserUrlSuggestionProvider[] {
		return [this._suggestionProvider];
	}

	override get urlPickerActionProviders(): readonly IBrowserUrlPickerActionProvider[] {
		return [this._actionProvider];
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		// Button visuals, indicator visibility, and context key depend on input.url.
		store.add(model.onDidNavigate(() => {
			this._refresh();
			this._onDidChangeState.fire();
		}));
		this._refresh();
	}

	override onModelDetached(): void {
		this._isFavoriteContext.reset();
		this._indicator.setVisible(false);
	}

	isFavorite(url: string): boolean {
		return this._urls.has(url);
	}

	toggleCurrent(): void {
		const url = this.editor.model?.url;
		if (url) {
			this._toggle(url);
		}
	}

	private _refresh(): void {
		const url = this.editor.model?.url ?? '';
		const favorite = !!url && this._urls.has(url);
		this._isFavoriteContext.set(favorite);
		this._indicator.setVisible(favorite);
	}

	private _load(): void {
		const raw = this._storageService.get(BrowserFavoritesFeature.STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			this._urls = new Set();
			return;
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			this._urls = new Set(
				Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : []
			);
		} catch {
			this._urls = new Set();
		}
	}

	private _toggle(url: string): void {
		if (this._urls.has(url)) {
			this._urls.delete(url);
		} else {
			this._urls.add(url);
		}
		this._storageService.store(
			BrowserFavoritesFeature.STORAGE_KEY,
			JSON.stringify([...this._urls]),
			StorageScope.WORKSPACE,
			StorageTarget.USER,
		);
		this._refresh();
		this._onDidChangeState.fire();
	}

	// Idempotent: callers that should never re-add a favorite (e.g. the per-item
	// delete button on suggestions) must use this rather than `_toggle`.
	private _remove(url: string): void {
		if (!this._urls.has(url)) {
			return;
		}
		this._urls.delete(url);
		this._storageService.store(
			BrowserFavoritesFeature.STORAGE_KEY,
			JSON.stringify([...this._urls]),
			StorageScope.WORKSPACE,
			StorageTarget.USER,
		);
		this._refresh();
		this._onDidChangeState.fire();
	}
}

BrowserEditor.registerContribution(BrowserFavoritesFeature);

// -- Actions ----------------------------------------------------------

class ToggleFavoriteAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ToggleFavorite;

	constructor() {
		super({
			id: ToggleFavoriteAction.ID,
			title: localize2('browser.addFavoriteAction', 'Add to Favorites'),
			category: BrowserActionCategory,
			icon: Codicon.star,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
			toggled: {
				condition: CONTEXT_BROWSER_URL_IS_FAVORITED,
				icon: Codicon.starFull,
			},
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Data,
				order: 2,
				isHiddenByDefault: true,
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
				primary: KeyMod.CtrlCmd | KeyCode.KeyD,
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserFavoritesFeature)?.toggleCurrent();
		}
	}
}

registerAction2(ToggleFavoriteAction);
