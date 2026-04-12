/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../base/browser/domStylesheets.js';
import * as cssJs from '../../../base/browser/cssValue.js';
import { DomEmitter } from '../../../base/browser/event.js';
import { Event } from '../../../base/common/event.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as GestureEventType } from '../../../base/browser/touch.js';
import { renderLabelWithIcons } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { IdGenerator } from '../../../base/common/idGenerator.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { parseLinkedText } from '../../../base/common/linkedText.js';
import { URI } from '../../../base/common/uri.js';
import './media/quickInput.css';
import { localize } from '../../../nls.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IQuickInputButton } from '../common/quickInput.js';
import { IAction } from '../../../base/common/actions.js';

const iconPathToClass: Record<string, string> = {};
const iconClassGenerator = new IdGenerator('quick-input-button-icon-');

function getIconClass(iconPath: { dark: URI; light?: URI } | undefined): string | undefined {
	if (!iconPath) {
		return undefined;
	}
	let iconClass: string;

	const key = iconPath.dark.toString();
	if (iconPathToClass[key]) {
		iconClass = iconPathToClass[key];
	} else {
		iconClass = iconClassGenerator.nextId();
		domStylesheetsJs.createCSSRule(`.${iconClass}, .hc-light .${iconClass}`, `background-image: ${cssJs.asCSSUrl(iconPath.light || iconPath.dark)}`);
		domStylesheetsJs.createCSSRule(`.vs-dark .${iconClass}, .hc-black .${iconClass}`, `background-image: ${cssJs.asCSSUrl(iconPath.dark)}`);
		iconPathToClass[key] = iconClass;
	}

	return iconClass;
}

class QuickInputToggleButtonAction implements IAction {
	class: string | undefined;

	constructor(
		public readonly id: string,
		public label: string,
		public tooltip: string,
		className: string | undefined,
		public enabled: boolean,
		private _checked: boolean,
		private _run: () => unknown
	) {
		this.class = className;
	}

	get checked(): boolean {
		return this._checked;
	}

	set checked(value: boolean) {
		this._checked = value;
		// Toggles behave like buttons. When clicked, they run... the only difference is that their checked state also changes.
		this._run();
	}

	run() {
		this._checked = !this._checked;
		return this._run();
	}
}

export function quickInputButtonToAction(button: IQuickInputButton, id: string, run: () => unknown): IAction {
	let cssClasses = button.iconClass || getIconClass(button.iconPath);
	if (button.alwaysVisible) {
		cssClasses = cssClasses ? `${cssClasses} always-visible` : 'always-visible';
	}

	const handler = () => {
		if (button.toggle) {
			button.toggle.checked = !button.toggle.checked;
		}
		return run();
	};

	const action = button.toggle
		? new QuickInputToggleButtonAction(
			id,
			button.tooltip || '',
			'',
			cssClasses,
			true,
			button.toggle.checked,
			handler
		)
		: {
			id,
			label: '',
			tooltip: button.tooltip || '',
			class: cssClasses,
			enabled: true,
			run: handler,
		};

	return action;
}

export function quickInputButtonsToActionArrays(
	buttons: readonly IQuickInputButton[],
	idPrefix: string,
	onTrigger: (button: IQuickInputButton) => unknown
): { primary: IAction[]; secondary: IAction[] } {
	const primary: IAction[] = [];
	const secondary: IAction[] = [];

	buttons.forEach((button, index) => {
		const action = quickInputButtonToAction(
			button,
			`${idPrefix}-${index}`,
			async () => onTrigger(button)
		);

		if (button.label) {
			action.label = button.label;
		}

		if (button.secondary) {
			secondary.push(action);
		} else {
			primary.push(action);
		}
	});

	return { primary, secondary };
}

export function renderQuickInputDescription(description: string, container: HTMLElement, actionHandler: { callback: (content: string) => void; disposables: DisposableStore }) {
	dom.reset(container);
	const parsed = parseLinkedText(description);
	let tabIndex = 0;
	for (const node of parsed.nodes) {
		if (typeof node === 'string') {
			container.append(...renderLabelWithIcons(node));
		} else {
			let title = node.title;

			if (!title && node.href.startsWith('command:')) {
				title = localize('executeCommand', "Click to execute command '{0}'", node.href.substring('command:'.length));
			} else if (!title) {
				title = node.href;
			}

			const anchor = dom.$('a', { href: node.href, title, tabIndex: tabIndex++ }, node.label);
			anchor.style.textDecoration = 'underline';
			const handleOpen = (e: unknown) => {
				if (dom.isEventLike(e)) {
					dom.EventHelper.stop(e, true);
				}

				actionHandler.callback(node.href);
			};

			const onClick = actionHandler.disposables.add(new DomEmitter(anchor, dom.EventType.CLICK)).event;
			const onKeydown = actionHandler.disposables.add(new DomEmitter(anchor, dom.EventType.KEY_DOWN)).event;
			const onSpaceOrEnter = Event.chain(onKeydown, $ => $.filter(e => {
				const event = new StandardKeyboardEvent(e);

				return event.equals(KeyCode.Space) || event.equals(KeyCode.Enter);
			}));

			actionHandler.disposables.add(Gesture.addTarget(anchor));
			const onTap = actionHandler.disposables.add(new DomEmitter(anchor, GestureEventType.Tap)).event;

			Event.any(onClick, onTap, onSpaceOrEnter)(handleOpen, null, actionHandler.disposables);
			container.appendChild(anchor);
		}
	}
}
