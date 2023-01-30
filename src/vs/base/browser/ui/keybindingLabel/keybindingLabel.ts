/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { UILabelProvider } from 'vs/base/common/keybindingLabels';
import { ResolvedKeybinding, ResolvedChord } from 'vs/base/common/keybindings';
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

export type CSSValueString = string;

export interface IKeybindingLabelStyles {
	keybindingLabelBackground?: CSSValueString;
	keybindingLabelForeground?: CSSValueString;
	keybindingLabelBorder?: CSSValueString;
	keybindingLabelBottomBorder?: CSSValueString;
	keybindingLabelShadow?: CSSValueString;
}

export class KeybindingLabel {

	private domNode: HTMLElement;
	private options: KeybindingLabelOptions;

	private readonly keyElements = new Set<HTMLSpanElement>();

	private keybinding: ResolvedKeybinding | undefined;
	private matches: Matches | undefined;
	private didEverRender: boolean;

	private labelBackground: CSSValueString | undefined;
	private labelBorder: CSSValueString | undefined;
	private labelBottomBorder: CSSValueString | undefined;
	private labelShadow: CSSValueString | undefined;

	constructor(container: HTMLElement, private os: OperatingSystem, options?: KeybindingLabelOptions) {
		this.options = options || Object.create(null);

		this.labelBackground = this.options.keybindingLabelBackground;
		this.labelBorder = this.options.keybindingLabelBorder;
		this.labelBottomBorder = this.options.keybindingLabelBottomBorder;
		this.labelShadow = this.options.keybindingLabelShadow;

		const labelForeground = this.options.keybindingLabelForeground;

		this.domNode = dom.append(container, $('.monaco-keybinding'));
		if (labelForeground) {
			this.domNode.style.color = labelForeground;
		}

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
			const [firstChord, secondChord] = this.keybinding.getChords();// TODO@chords
			if (firstChord) {
				this.renderChord(this.domNode, firstChord, this.matches ? this.matches.firstPart : null);
			}
			if (secondChord) {
				dom.append(this.domNode, $('span.monaco-keybinding-key-chord-separator', undefined, ' '));
				this.renderChord(this.domNode, secondChord, this.matches ? this.matches.chordPart : null);
			}
			const title = (this.options.disableTitle ?? false) ? undefined : this.keybinding.getAriaLabel() || undefined;
			if (title !== undefined) {
				this.domNode.title = title;
			} else {
				this.domNode.removeAttribute('title');
			}
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

		if (this.labelBackground) {
			keyElement.style.backgroundColor = this.labelBackground;
		}
		if (this.labelBorder) {
			keyElement.style.borderColor = this.labelBorder;
		}
		if (this.labelBottomBorder) {
			keyElement.style.borderBottomColor = this.labelBottomBorder;
		}
		if (this.labelShadow) {
			keyElement.style.boxShadow = `inset 0 -1px 0 ${this.labelShadow}`;
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
