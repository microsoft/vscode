/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { findLast } from '../../../../base/common/arraysFind.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatInputPickerResponsiveLayout } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { getLabeledPickerResponsiveItems } from './newChatComposerInput.js';
import type { ISessionOptionsIconOnlyPickers } from './iconOnlySessionPickers.js';

/** Whether the user last showed or hid the new-session options tray. */
const SESSION_OPTIONS_EXPANDED_STORAGE_KEY = 'agentSessions.newSession.sessionOptionsExpanded2';

let sessionOptionsIdPool = 0;

/** The session options visibility the user chose, `undefined` before they chose. */
export function getStoredSessionOptionsExpanded(storageService: IStorageService): boolean | undefined {
	return storageService.getBoolean(SESSION_OPTIONS_EXPANDED_STORAGE_KEY, StorageScope.PROFILE);
}

export function storeSessionOptionsExpanded(storageService: IStorageService, expanded: boolean): void {
	storageService.store(SESSION_OPTIONS_EXPANDED_STORAGE_KEY, expanded, StorageScope.PROFILE, StorageTarget.USER);
}

export interface ISessionOptionsRowOptions {
	/** Names the responsive layout, e.g. for its measurements. */
	readonly user: string;
	readonly hoverDelegate?: IHoverDelegate;
	readonly useExperimentalLayout: IObservable<boolean>;
	readonly screenReaderOptimized: IObservable<boolean>;
	readonly expanded: IObservable<boolean>;
	/** Whether a collapsed tray keeps its pickers as an icon rail rather than hiding them. */
	readonly collapsedShowIcons: IObservable<boolean>;
	/** The user showed or hid the session options with the disclosure toggle. */
	setExpanded(expanded: boolean): void;
	/** Whether the session options hold any control; without one there is no tray to show or hide. Defaults to always. */
	readonly hasDetails?: IObservable<boolean>;
	/** Called when the tray collapses, before {@link collapsedShowIcons} is read. */
	onDidCollapse?(): void;
	/** Called after the row's presentation changes. */
	onDidChangeLayout?(): void;
	/** In the experimental layout, lets the user collapse individual pickers to their icon from their context menu. */
	readonly iconOnlyPickers?: ISessionOptionsIconOnlyPickers;
}

/**
 * The options row above a new-session composer: the primary pickers already in `row` (such as the
 * workspace), followed by the session options ({@link details}) that the experimental composer layout
 * groups into a tray with a disclosure toggle. Keyboard users move through the row with the arrow keys.
 */
export class SessionOptionsRow extends Disposable {

	/** Session options that follow the primary pickers, collapsible in the experimental layout. */
	readonly details: HTMLElement;
	/** Where the composer's repository controls go while the experimental layout shows them in the row. */
	readonly repositoryControlsHost: HTMLElement;
	readonly toggle: Button;
	private readonly _responsiveLayout: ChatInputPickerResponsiveLayout;

	constructor(
		row: HTMLElement,
		container: HTMLElement,
		options: ISessionOptionsRowOptions,
	) {
		super();
		const sessionOptions = this.details = dom.append(row, dom.$('.new-chat-session-options-details'));
		sessionOptions.id = `new-chat-session-options-${++sessionOptionsIdPool}`;
		this.repositoryControlsHost = dom.append(sessionOptions, dom.$('.new-chat-repository-controls-host'));
		const toggle = this.toggle = this._register(new Button(row, {
			...defaultButtonStyles,
			hoverDelegate: options.hoverDelegate ?? getDefaultHoverDelegate('element'),
			buttonBackground: undefined,
			buttonHoverBackground: undefined,
			buttonForeground: undefined,
			buttonBorder: undefined,
		}));
		toggle.element.classList.add('new-chat-session-options-toggle');
		toggle.element.setAttribute('aria-controls', sessionOptions.id);
		this._register(toggle.onDidClick(() => options.setExpanded(!options.expanded.get())));
		const getRowControls = (includeDisabled = false): HTMLElement[] => {
			const controls: HTMLElement[] = [];
			const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_ELEMENT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				if (dom.isHTMLElement(node) && node.role === 'button'
					&& (includeDisabled || (node.getAttribute('aria-disabled') !== 'true' && !node.closest('.disabled')))
					&& !node.closest('[hidden], [inert], .loading, .resolving')
					&& node.checkVisibility()) {
					controls.push(node);
				}
			}
			return controls;
		};
		this._register(dom.addDisposableListener(row, dom.EventType.KEY_DOWN, event => {
			if (!options.useExperimentalLayout.get() || event.altKey || event.ctrlKey || event.metaKey || !['Tab', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
				return;
			}
			const controls = getRowControls(event.key !== 'Tab');
			const activeElement = dom.getActiveElement();
			const index = controls.findIndex(control => control === activeElement);
			if (index < 0) {
				return;
			}
			const previous = event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shiftKey);
			const nextIndex = index + (previous ? -1 : 1);
			if (event.key === 'Tab' && (nextIndex < 0 || nextIndex >= controls.length)) {
				return;
			}
			dom.EventHelper.stop(event, true);
			controls[(nextIndex + controls.length) % controls.length].focus();
		}, true));
		const iconOnlyPickers = options.iconOnlyPickers;
		const getIconOnlyPickerIds = (): ReadonlySet<string> => iconOnlyPickers && options.useExperimentalLayout.get()
			? iconOnlyPickers.iconOnlyPickerIds.get()
			: new Set();
		const responsiveLayout = this._responsiveLayout = this._register(new ChatInputPickerResponsiveLayout(options.user, container, {
			usePreferredWidth: true,
			getItems: () => {
				const iconOnlyPickerIds = getIconOnlyPickerIds();
				return getLabeledPickerResponsiveItems(row).map(item => {
					const pickerId = item.element && iconOnlyPickerIds.size ? iconOnlyPickers?.getPickerId(item.element) : undefined;
					const iconOnly = !!pickerId && iconOnlyPickerIds.has(pickerId);
					return item.element && sessionOptions.contains(item.element) ? {
						...item,
						setCompact: compact => item.setCompact(compact || iconOnly),
					} : {
						...item,
						// Keep primary controls outside the options tray fully labeled unless the user collapsed them.
						setCompact: () => {
							if (iconOnly || item.isCompact()) {
								item.setCompact(iconOnly);
							}
						},
					};
				});
			},
		}));
		if (iconOnlyPickers) {
			this._register(dom.addDisposableListener(row, dom.EventType.CONTEXT_MENU, event => {
				const target = event.target;
				if (!options.useExperimentalLayout.get() || !dom.isHTMLElement(target)) {
					return;
				}
				// The innermost picker under the pointer; its own context menu is replaced by one that also collapses it.
				const picker = findLast(getLabeledPickerResponsiveItems(row), item => !!item.element?.contains(target));
				const pickerId = picker?.element && iconOnlyPickers.getPickerId(picker.element);
				if (!pickerId) {
					return;
				}
				dom.EventHelper.stop(event, true);
				iconOnlyPickers.showContextMenu(pickerId, new StandardMouseEvent(dom.getWindow(row), event));
			}, true));
		}
		this._register(autorun(reader => {
			const useExperimentalLayout = options.useExperimentalLayout.read(reader);
			if (useExperimentalLayout) {
				// Re-measure below when the user collapses a picker to its icon or shows its label again.
				iconOnlyPickers?.iconOnlyPickerIds.read(reader);
			}
			const screenReaderOptimized = options.screenReaderOptimized.read(reader);
			const hasDetails = options.hasDetails?.read(reader) ?? true;
			// Screen reader users should never have the options collapsed out of the accessibility
			// tree: keep the tray expanded and drop the disclosure toggle entirely.
			const disclosureAvailable = useExperimentalLayout && !screenReaderOptimized && hasDetails;
			const expanded = options.expanded.read(reader);
			const collapsed = disclosureAvailable && !expanded;
			if (collapsed) {
				options.onDidCollapse?.();
			}
			// When collapsed, keep the repository and harness pickers as an always-available icon
			// rail (labels hidden) unless the user has opted to hide them entirely.
			const iconRail = collapsed && options.collapsedShowIcons.read(reader);
			const showDetails = hasDetails && (!disclosureAvailable || expanded || iconRail);
			row.classList.toggle('new-chat-session-options', useExperimentalLayout);
			sessionOptions.classList.toggle('legacy-session-options-details', !useExperimentalLayout);
			sessionOptions.classList.toggle('collapsed-icon-rail', iconRail);
			toggle.element.hidden = !disclosureAvailable;
			if (!showDetails && sessionOptions.contains(dom.getActiveElement())) {
				if (!toggle.element.hidden) {
					toggle.focus();
				} else {
					// No toggle to land on (the options went away entirely): the nearest primary picker instead.
					getRowControls().reverse().find(control => !sessionOptions.contains(control) && control !== toggle.element)?.focus();
				}
			}
			sessionOptions.inert = !showDetails;
			sessionOptions.hidden = !showDetails;
			toggle.icon = expanded ? Codicon.chevronLeftCompact : Codicon.chevronRightCompact;
			toggle.element.setAttribute('aria-expanded', String(expanded));
			const label = expanded
				? localize('newSessionOptions.collapse', "Hide Session Options")
				: localize('newSessionOptions.expand', "Show Session Options");
			toggle.setAriaLabel(label);
			toggle.setTitle(label);
			// Re-measure so labels compact or restore for the new expanded/rail state.
			responsiveLayout.layout();
			options.onDidChangeLayout?.();
		}));
	}

	/** Re-measures the row so labels compact or restore, e.g. after a picker was added. */
	layout(): void {
		this._responsiveLayout.layout();
	}
}
