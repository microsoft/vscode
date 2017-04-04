/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./keybindingLabel';
import { IDisposable } from 'vs/base/common/lifecycle';
import { equals } from 'vs/base/common/objects';
import { OperatingSystem } from 'vs/base/common/platform';
import { ResolvedKeybinding } from 'vs/base/common/keycodes';
import { UILabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import * as dom from 'vs/base/browser/dom';

const $ = dom.$;

export interface PartMatches {
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
	keyCode?: boolean;
}

export interface Matches {
	firstPart: PartMatches;
	chordPart: PartMatches;
}

export class KeybindingLabel implements IDisposable {

	private domNode: HTMLElement;
	private keybinding: ResolvedKeybinding;
	private matches: Matches;
	private didEverRender: boolean;

	constructor(container: HTMLElement, private os: OperatingSystem) {
		this.domNode = dom.append(container, $('.htmlkb'));
		this.didEverRender = false;
		container.appendChild(this.domNode);
	}

	get element(): HTMLElement {
		return this.domNode;
	}

	set(keybinding: ResolvedKeybinding, matches: Matches) {
		if (this.didEverRender && this.keybinding === keybinding && KeybindingLabel.areSame(this.matches, matches)) {
			return;
		}

		this.keybinding = keybinding;
		this.matches = matches;
		this.render();
	}

	private render() {
		dom.clearNode(this.domNode);

		if (this.keybinding) {
			let [firstPart, chordPart] = this.keybinding.getParts();
			if (firstPart) {
				this.renderPart(this.domNode, firstPart, this.matches ? this.matches.firstPart : null);
			}
			if (chordPart) {
				dom.append(this.domNode, $('span', null, ' '));
				this.renderPart(this.domNode, chordPart, this.matches ? this.matches.chordPart : null);
			}
			this.domNode.title = this.keybinding.getAriaLabel();
		}

		this.didEverRender = true;
	}

	private renderPart(parent: HTMLElement, part: ResolvedKeybinding, match: PartMatches) {
		const modifierLabels = UILabelProvider.modifierLabels[this.os];
		if (part.hasCtrlModifier()) {
			this.renderKey(parent, modifierLabels.ctrlKey, match && match.ctrlKey, modifierLabels.separator);
		}
		if (part.hasShiftModifier()) {
			this.renderKey(parent, modifierLabels.shiftKey, match && match.shiftKey, modifierLabels.separator);
		}
		if (part.hasAltModifier()) {
			this.renderKey(parent, modifierLabels.altKey, match && match.altKey, modifierLabels.separator);
		}
		if (part.hasMetaModifier()) {
			this.renderKey(parent, modifierLabels.metaKey, match && match.metaKey, modifierLabels.separator);
		}
		const keyLabel = part.getLabelWithoutModifiers();
		if (keyLabel) {
			this.renderKey(parent, keyLabel, match && match.keyCode, '');
		}
	}

	private renderKey(parent: HTMLElement, label: string, highlight: boolean, separator: string): void {
		dom.append(parent, $('span.monaco-kbkey' + (highlight ? '.highlight' : ''), null, label));
		if (separator) {
			dom.append(parent, $('span', null, separator));
		}
	}

	dispose() {
		this.keybinding = null;
	}

	private static areSame(a: Matches, b: Matches): boolean {
		if (a === b || (!a && !b)) {
			return true;
		}
		return !!a && !!b && equals(a.firstPart, b.firstPart) && equals(a.chordPart, b.chordPart);
	}
}
