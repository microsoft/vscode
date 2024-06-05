/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import type { IUpdatableHover } from 'vs/base/browser/ui/hover/hover';
import { getBaseLayerHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate2';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { UILabelProvider } from 'vs/base/common/keybindingLabels';
import { ResolvedKeybinding, ResolvedChord } from 'vs/base/common/keybindings';
import { Disposable } from 'vs/base/common/lifecycle';
import { equals } from 'vs/base/common/objects';
import { OperatingSystem } from 'vs/base/common/platform';
import 'vs/css!./keybindingLabel';
import { localize } from 'vs/nls';

const $ = dom.$;

export interface ChordMatches {
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
	keyCode?: boolean;
}

export interface Matches {
	firstPart: ChordMatches;
	chordPart: ChordMatches;
}

export interface KeybindingLabelOptions extends IKeybindingLabelStyles {
	renderUnboundKeybindings?: boolean;
	/**
	 * Default false.
	 */
	disableTitle?: boolean;
}

export interface IKeybindingLabelStyles {
	keybindingLabelBackground: string | undefined;
	keybindingLabelForeground: string | undefined;
	keybindingLabelBorder: string | undefined;
	keybindingLabelBottomBorder: string | undefined;
	keybindingLabelShadow: string | undefined;
}

export const unthemedKeybindingLabelOptions: KeybindingLabelOptions = {
	keybindingLabelBackground: undefined,
	keybindingLabelForeground: undefined,
	keybindingLabelBorder: undefined,
	keybindingLabelBottomBorder: undefined,
	keybindingLabelShadow: undefined
};

export class KeybindingLabel extends Disposable {

	private domNode: HTMLElement;
	private options: KeybindingLabelOptions;

	private readonly keyElements = new Set<HTMLSpanElement>();

	private hover: IUpdatableHover;
	private keybinding: ResolvedKeybinding | undefined;
	private matches: Matches | undefined;
	private didEverRender: boolean;

	constructor(container: HTMLElement, private os: OperatingSystem, options?: KeybindingLabelOptions) {
		super();

		this.options = options || Object.create(null);

		const labelForeground = this.options.keybindingLabelForeground;

		this.domNode = dom.append(container, $('.monaco-keybinding'));
		if (labelForeground) {
			this.domNode.style.color = labelForeground;
		}

		this.hover = this._register(getBaseLayerHoverDelegate().setupUpdatableHover(getDefaultHoverDelegate('mouse'), this.domNode, ''));

		this.didEverRender = false;
		container.appendChild(this.domNode);
	}

	get element(): HTMLElement {
		return this.domNode;
	}

	set(keybinding: ResolvedKeybinding | undefined, matches?: Matches) {
		if (this.didEverRender && this.keybinding === keybinding && KeybindingLabel.areSame(this.matches, matches)) {
			return;
		}

		this.keybinding = keybinding;
		this.matches = matches;
		this.render();
	}

	private render() {
		this.clear();

		if (this.keybinding) {
			const chords = this.keybinding.getChords();
			if (chords[0]) {
				this.renderChord(this.domNode, chords[0], this.matches ? this.matches.firstPart : null);
			}
			for (let i = 1; i < chords.length; i++) {
				dom.append(this.domNode, $('span.monaco-keybinding-key-chord-separator', undefined, ' '));
				this.renderChord(this.domNode, chords[i], this.matches ? this.matches.chordPart : null);
			}
			const title = (this.options.disableTitle ?? false) ? undefined : this.keybinding.getAriaLabel() || undefined;
			this.hover.update(title);
			this.domNode.setAttribute('aria-label', title || '');
		} else if (this.options && this.options.renderUnboundKeybindings) {
			this.renderUnbound(this.domNode);
		}

		this.didEverRender = true;
	}

	private clear(): void {
		dom.clearNode(this.domNode);
		this.keyElements.clear();
	}

	private renderChord(parent: HTMLElement, chord: ResolvedChord, match: ChordMatches | null) {
		const modifierLabels = UILabelProvider.modifierLabels[this.os];
		if (chord.ctrlKey) {
			this.renderKey(parent, modifierLabels.ctrlKey, Boolean(match?.ctrlKey), modifierLabels.separator);
		}
		if (chord.shiftKey) {
			this.renderKey(parent, modifierLabels.shiftKey, Boolean(match?.shiftKey), modifierLabels.separator);
		}
		if (chord.altKey) {
			this.renderKey(parent, modifierLabels.altKey, Boolean(match?.altKey), modifierLabels.separator);
		}
		if (chord.metaKey) {
			this.renderKey(parent, modifierLabels.metaKey, Boolean(match?.metaKey), modifierLabels.separator);
		}
		const keyLabel = chord.keyLabel;
		if (keyLabel) {
			this.renderKey(parent, keyLabel, Boolean(match?.keyCode), '');
		}
	}

	private renderKey(parent: HTMLElement, label: string, highlight: boolean, separator: string): void {
		dom.append(parent, this.createKeyElement(label, highlight ? '.highlight' : ''));
		if (separator) {
			dom.append(parent, $('span.monaco-keybinding-key-separator', undefined, separator));
		}
	}

	private renderUnbound(parent: HTMLElement): void {
		dom.append(parent, this.createKeyElement(localize('unbound', "Unbound")));
	}

	private createKeyElement(label: string, extraClass = ''): HTMLElement {
		const keyElement = $('span.monaco-keybinding-key' + extraClass, undefined, label);
		this.keyElements.add(keyElement);

		if (this.options.keybindingLabelBackground) {
			keyElement.style.backgroundColor = this.options.keybindingLabelBackground;
		}
		if (this.options.keybindingLabelBorder) {
			keyElement.style.borderColor = this.options.keybindingLabelBorder;
		}
		if (this.options.keybindingLabelBottomBorder) {
			keyElement.style.borderBottomColor = this.options.keybindingLabelBottomBorder;
		}
		if (this.options.keybindingLabelShadow) {
			keyElement.style.boxShadow = `inset 0 -1px 0 ${this.options.keybindingLabelShadow}`;
		}

		return keyElement;
	}

	private static areSame(a: Matches | undefined, b: Matches | undefined): boolean {
		if (a === b || (!a && !b)) {
			return true;
		}
		return !!a && !!b && equals(a.firstPart, b.firstPart) && equals(a.chordPart, b.chordPart);
	}
}
