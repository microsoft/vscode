/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/pinnedCanvasPage.css';
import { getWindow } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { CanvasView, ICanvasViewInput } from '../../../../workbench/contrib/canvases/electron-browser/canvasView.js';
import { Menus } from '../../../browser/menus.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { IPinnedCanvasService, PINNED_CANVAS_PAGE_ID, PinnedCanvasConnectedContext, PinnedCanvasState } from '../browser/pinnedCanvases.js';

/** Shows the selected pinned canvas full-bleed in place of the sessions grid. */
export class PinnedCanvasPage extends AbstractCustomView {

	readonly title: IObservable<string>;
	override readonly description: IObservable<string | undefined>;
	// The page fills the whole surface instead of the centered session measure.
	override readonly maxWidth = Number.MAX_SAFE_INTEGER;

	private container: HTMLElement | undefined;
	private view: CanvasView | undefined;

	constructor(
		@IPinnedCanvasService private readonly pinnedCanvasService: IPinnedCanvasService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.title = derived(this, reader => this.pinnedCanvasService.selected.read(reader)?.title.read(reader) ?? localize('pinnedCanvasPage.title', "Canvas"));
		this.description = derived(this, reader => {
			const chatTitle = this.pinnedCanvasService.selected.read(reader)?.chatTitle.read(reader);
			return chatTitle ? localize('pinnedCanvasPage.description', "From {0}", chatTitle) : undefined;
		});
	}

	render(container: HTMLElement): void {
		this.container = container;
		container.classList.add('pinned-canvas-page');
		const notPresentableMessage = derived(this, reader => {
			const entry = this.pinnedCanvasService.selected.read(reader);
			if (!entry) {
				return '';
			}
			if (entry.state.read(reader) === PinnedCanvasState.Unavailable) {
				return localize('pinnedCanvasPage.unavailable', "This canvas is no longer open in its chat. Remove it from the sidebar, or go to its chat to open it again.");
			}
			if (entry.reference.read(reader)) {
				return localize('pinnedCanvasPage.hidden', "This canvas is not shown.");
			}
			return entry.reconnecting.read(reader)
				? localize('pinnedCanvasPage.reconnecting', "Reconnecting to this canvas…")
				: localize('pinnedCanvasPage.reconnect', "This canvas reconnects when its chat is shown. Use Go to Chat to reconnect it.");
		});
		// The page can also return through Back or Forward, so it reconnects the pin it shows.
		this._register(autorun(reader => {
			const entry = this.pinnedCanvasService.selected.read(reader);
			if (entry) {
				this.pinnedCanvasService.reconnect(entry);
			}
		}));
		const view = this.view = this._register(this.instantiationService.createInstance(CanvasView, container, getWindow(container), {
			logPrefix: '[PinnedCanvasPage]',
			notPresentableMessage,
			getHelpContent: () => getPinnedCanvasPageHelpContent(),
		}));
		const input = derived<ICanvasViewInput | undefined>(this, reader => {
			const entry = this.pinnedCanvasService.selected.read(reader);
			const reference = entry?.reference.read(reader);
			if (!entry || !reference) {
				return undefined;
			}
			return {
				reference,
				canvas: entry.canvas,
				membershipPending: derived(reader => {
					const canvas = entry.canvas.read(reader);
					return canvas !== undefined && canvas.instanceId === undefined;
				}),
			};
		});
		this._register(autorun(reader => view.setInput(input.read(reader))));
		view.setVisible(true);
	}

	layout(_width: number, height: number): void {
		if (this.container) {
			this.container.style.height = `${height}px`;
		}
		this.view?.layout();
	}

	override focus(): void {
		this.view?.focus();
	}
}

function getPinnedCanvasPageHelpContent(): string {
	return [
		localize('pinnedCanvasPage.help.overview', "This canvas is pinned to the sidebar. It belongs to its chat, whose agent can keep updating it, and it stays live while you work in other chats."),
		localize('pinnedCanvasPage.help.navigation', "Tab moves through page controls. Use <keybinding:workbench.action.focusNextPart> to leave the page."),
		localize('pinnedCanvasPage.help.externalLinks', "User-initiated HTTP and HTTPS links that request a new tab or window open outside the canvas."),
		localize('pinnedCanvasPage.help.actions', "The page header offers Go to Chat to show the chat that owns this canvas, Remove from Sidebar to unpin it, and Close Canvas to close the canvas itself, which also notifies the canvas extension that provides it."),
		localize('pinnedCanvasPage.help.sidebar', "Pinned canvases are listed in the sidebar after Automations. Their context menu offers the same actions."),
	].join('\n\n');
}

/** Registers the pinned canvas page and the context its header actions depend on. */
export class PinnedCanvasPageContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.pinnedCanvasPage';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
		@IPinnedCanvasService pinnedCanvasService: IPinnedCanvasService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		// A reloaded window returns to its sessions; choosing a pin shows the page again and reconnects it.
		this._register(customViewService.registerCustomView({
			id: PINNED_CANVAS_PAGE_ID,
			ctor: new SyncDescriptor(PinnedCanvasPage),
			actions: { style: 'toolbar', menuId: Menus.CustomViewCanvas },
			// Each opening shows one pin; Back and Forward skip pins removed meanwhile.
			acceptsState: pinId => pinnedCanvasService.entries.get().some(entry => entry.id === pinId),
		}, { restore: false }));

		const connected = PinnedCanvasConnectedContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			connected.set(pinnedCanvasService.selected.read(reader)?.canvas.read(reader) !== undefined);
		}));
	}
}
