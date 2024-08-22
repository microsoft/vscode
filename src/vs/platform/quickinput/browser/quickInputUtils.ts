/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom';
import { DomEmitter } from '../../../base/browser/event';
import { Event } from '../../../base/common/event';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent';
import { Gesture, EventType as GestureEventType } from '../../../base/browser/touch';
import { renderLabelWithIcons } from '../../../base/browser/ui/iconLabel/iconLabels';
import { IdGenerator } from '../../../base/common/idGenerator';
import { KeyCode } from '../../../base/common/keyCodes';
import { parseLinkedText } from '../../../base/common/linkedText';
import { URI } from '../../../base/common/uri';
import 'vs/css!./media/quickInput';
import { localize } from '../../../nls';
import { DisposableStore } from '../../../base/common/lifecycle';
import { IQuickInputButton } from '../common/quickInput';
import { IAction } from '../../../base/common/actions';

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
		dom.createCSSRule(`.${iconClass}, .hc-light .${iconClass}`, `background-image: ${dom.asCSSUrl(iconPath.light || iconPath.dark)}`);
		dom.createCSSRule(`.vs-dark .${iconClass}, .hc-black .${iconClass}`, `background-image: ${dom.asCSSUrl(iconPath.dark)}`);
		iconPathToClass[key] = iconClass;
	}

	return iconClass;
}

export function quickInputButtonToAction(button: IQuickInputButton, id: string, run: () => unknown): IAction {
	let cssClasses = button.iconClass || getIconClass(button.iconPath);
	if (button.alwaysVisible) {
		cssClasses = cssClasses ? `${cssClasses} always-visible` : 'always-visible';
	}

	return {
		id,
		label: '',
		tooltip: button.tooltip || '',
		class: cssClasses,
		enabled: true,
		run
	};
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
