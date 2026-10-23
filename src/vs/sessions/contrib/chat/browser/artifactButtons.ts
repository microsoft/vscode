/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveElement, isHTMLElement, reset } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { renderArtifactIcon } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createChatPillButton } from '../../../../workbench/browser/chatPills.js';
import { IArtifactActionViewData } from './artifactDetailsView.js';

export interface IArtifactButton extends Omit<IArtifactActionViewData, 'run'> {
	readonly expanded?: boolean;
	readonly controls?: string;
	readonly stopPropagation?: boolean;
	run(target: HTMLElement): void;
}

export class ArtifactButtons extends Disposable {
	private readonly buttons = this._register(new DisposableMap<string, ArtifactButton>());
	private orderedButtons: readonly ArtifactButton[] = [];
	private focusable = true;

	constructor(readonly element: HTMLElement, private readonly hoverService: IHoverService, private readonly kind: 'action' | 'pill' | 'quiet' = 'action') {
		super();
		element.setAttribute('role', 'group');
	}

	update(items: readonly IArtifactButton[]): void {
		const active = getActiveElement();
		const hadFocus = !!active && this.element.contains(active);
		const ids = new Set(items.map(item => item.id));
		for (const id of this.buttons.keys()) {
			if (!ids.has(id)) {
				this.buttons.deleteAndDispose(id);
			}
		}
		let next = this.element.firstElementChild;
		const ordered: ArtifactButton[] = [];
		for (const item of items) {
			let slot = this.buttons.get(item.id);
			if (!slot) {
				slot = new ArtifactButton(this.element, item, this.hoverService, this.kind);
				this.buttons.set(item.id, slot);
			}
			slot.update(item);
			slot.button.element.tabIndex = this.focusable && slot.reachable ? 0 : -1;
			if (next !== slot.button.element) {
				this.element.insertBefore(slot.button.element, next);
			}
			next = slot.button.element.nextElementSibling;
			ordered.push(slot);
		}
		this.orderedButtons = ordered;
		this.element.hidden = items.length === 0;
		if (hadFocus && isHTMLElement(active)) {
			if (active.isConnected) {
				if (getActiveElement() !== active) {
					active.focus({ preventScroll: true });
				}
			} else {
				(this.tabbableElements[0] ?? this.element.closest<HTMLElement>('.artifact-integration-panel') ?? this.element.parentElement)?.focus({ preventScroll: true });
			}
		}
	}

	setFocusable(focusable: boolean): void {
		this.focusable = focusable;
		for (const slot of this.buttons.values()) {
			slot.button.element.tabIndex = focusable && slot.reachable ? 0 : -1;
		}
	}

	focus(id: string): boolean {
		const slot = this.buttons.get(id);
		if (!slot?.reachable) {
			return false;
		}
		slot.button.focus();
		return true;
	}

	get tabbableElements(): readonly HTMLElement[] {
		return this.element.hidden ? [] : this.orderedButtons.filter(slot => slot.reachable && slot.button.element.tabIndex === 0).map(slot => slot.button.element);
	}
}

class ArtifactButton extends Disposable {
	readonly button: Button;

	constructor(container: HTMLElement, private value: IArtifactButton, hoverService: IHoverService, private readonly kind: 'action' | 'pill' | 'quiet') {
		super();
		this.button = this._register(kind === 'pill' ? createChatPillButton(container) : new Button(container, {
			...defaultButtonStyles, secondary: kind !== 'action' || !value.primary, small: true,
			...(kind === 'quiet' ? { buttonSecondaryBackground: 'transparent', buttonSecondaryBorder: 'transparent' } : {}),
		}));
		this.button.element.classList.add('monaco-text-button');
		this._register(toDisposable(() => this.button.element.remove()));
		this._register(this.button.onDidClick(event => {
			if (this.value.stopPropagation) {
				event.stopPropagation();
			}
			this.value.run(this.button.element);
		}));
		this._register(hoverService.setupDelayedHover(this.button.element, () => ({ content: this.value.description ?? this.value.label })));
	}

	get reachable(): boolean {
		return this.button.enabled || (this.kind !== 'pill' && !!this.value.description);
	}

	update(value: IArtifactButton): void {
		this.value = value;
		const glyph = value.icon ? renderArtifactIcon(value.icon, this.kind === 'pill' ? 'chat-pill-icon' : undefined) : undefined;
		reset(this.button.element, ...(glyph ? [glyph] : []), ...value.iconOnly ? [] : [$(this.kind === 'pill' ? 'span.chat-pill-label' : 'span.artifact-button-label', undefined, value.label)]);
		this.button.enabled = value.enabled !== false;
		if (this.kind === 'action') {
			this.button.secondary = !value.primary;
		}
		this.button.element.setAttribute('aria-label', value.ariaLabel ?? (value.description ? localize('artifactButtonDescription', "{0}. {1}", value.label, value.description) : value.label));
		if (value.expanded !== undefined && value.controls) {
			this.button.element.setAttribute('aria-haspopup', 'dialog');
			this.button.element.setAttribute('aria-expanded', String(value.expanded));
			this.button.element.setAttribute('aria-controls', value.controls);
			this.button.element.dataset.artifactDetailsOwner = value.controls;
		}
	}
}
