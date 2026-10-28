/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType, getActiveElement, isAncestorOfActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';

/** Shared disclosure chrome for the Autopilot and Activities cards. */
export class ArtifactDetailsCard extends Disposable {
	readonly element = $('.artifact-details-card', { role: 'region' });
	readonly heading = append(this.element, $('.artifact-card-heading'));
	readonly disclosure: ButtonWithIcon;
	readonly content = append(this.element, $('.artifact-card-content', { id: generateUuid(), hidden: true }));
	private readonly headingControls: HTMLElement[] = [];

	constructor(onExpanded: (expanded: boolean) => void) {
		super();
		const title = append(this.heading, $('h3.artifact-card-title', { id: generateUuid() }));
		this.element.setAttribute('aria-labelledby', title.id);
		// The heading paints the hover feedback, so the disclosure stays transparent.
		this.disclosure = this._register(new ButtonWithIcon(title, {
			...defaultButtonStyles, secondary: true, small: true,
			buttonSecondaryBackground: 'transparent', buttonSecondaryHoverBackground: 'transparent', buttonSecondaryBorder: 'transparent', buttonSecondaryForeground: 'inherit',
		}));
		this.disclosure.element.classList.add('artifact-card-disclosure');
		this.disclosure.element.setAttribute('aria-controls', this.content.id);
		this.disclosure.iconElement.setAttribute('aria-hidden', 'true');
		this._register(this.disclosure.onDidClick(() => onExpanded(this.content.hidden === true)));
		// The disclosure remains the keyboard target; the rest of the heading is a larger pointer target for it.
		this._register(addDisposableListener(this.heading, EventType.CLICK, event => {
			const target = event.target;
			if (isHTMLElement(target) && (this.disclosure.element.contains(target) || this.headingControls.some(control => control.contains(target)))) {
				return;
			}
			this.disclosure.element.focus({ preventScroll: true });
			onExpanded(this.content.hidden === true);
		}));
		this._register(toDisposable(() => this.element.remove()));
	}

	/** Excludes a control in the heading from toggling expansion and from the heading's hover feedback. */
	protected addHeadingControl(control: HTMLElement): void {
		this.headingControls.push(control);
		this._register(addDisposableListener(control, EventType.MOUSE_ENTER, () => this.heading.classList.add('artifact-card-heading-control-hovered')));
		this._register(addDisposableListener(control, EventType.MOUSE_LEAVE, () => this.heading.classList.remove('artifact-card-heading-control-hovered')));
	}

	updateHeading(title: string, expanded: boolean): void {
		if (!expanded && isAncestorOfActiveElement(this.content)) {
			this.disclosure.element.focus({ preventScroll: true });
		}
		this.disclosure.label = title;
		this.disclosure.icon = expanded ? Codicon.chevronDown : Codicon.chevronRight;
		this.disclosure.element.setAttribute('aria-expanded', String(expanded));
		this.element.classList.toggle('artifact-card-expanded', expanded);
		this.content.hidden = !expanded;
	}
}

export function placeArtifactChildren(container: HTMLElement, elements: readonly HTMLElement[]): void {
	let next = container.firstElementChild;
	for (const element of elements) {
		if (next !== element) {
			const active = getActiveElement();
			const focused = isHTMLElement(active) && element.contains(active) ? active : undefined;
			container.insertBefore(element, next);
			focused?.focus({ preventScroll: true });
		}
		next = element.nextElementSibling;
	}
}
