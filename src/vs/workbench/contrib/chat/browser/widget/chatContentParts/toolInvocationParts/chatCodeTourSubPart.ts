/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatCodeTourData, IChatCodeTourStop, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { ICodeTourService } from '../../../codeTour/codeTourService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatCodeTour.css';

/**
 * Renders a guided code tour: the agent contributes one stop per tool call, and
 * this widget shows the stops it has narrated so far. The current stop is
 * highlighted, clicking any stop re-opens its location, and "Stop Tour" ends the
 * tour so the agent stops taking over the editor.
 *
 * The widget reads the same live `stops` array the code tour service appends to,
 * so it grows in place instead of rendering one widget per stop. That array is
 * also what gets persisted, so a reloaded session still lists every stop and can
 * replay them — only the live "current stop" and "Stop Tour" affordances go away.
 */
export class ChatCodeTourSubPart extends BaseChatToolInvocationSubPart {

	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	private readonly _stopsContainer: HTMLElement;
	private readonly _footer: HTMLElement;
	private readonly _renderStore = this._register(new DisposableStore());

	/** Stop index most recently announced, so a re-render doesn't repeat it. */
	private _announcedIndex = -1;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly _data: IChatCodeTourData,
		_context: IChatContentPartRenderContext,
		private readonly _renderer: IMarkdownRenderer,
		@ICodeTourService private readonly _codeTourService: ICodeTourService,
		@ILabelService private readonly _labelService: ILabelService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(toolInvocation);

		this.domNode = dom.$('.chat-code-tour');

		const header = dom.append(this.domNode, dom.$('.chat-code-tour-header'));
		header.appendChild(renderIcon(Codicon.mapVertical));
		const title = dom.append(header, dom.$('.chat-code-tour-title'));
		title.textContent = this._data.title;

		this._stopsContainer = dom.append(this.domNode, dom.$('.chat-code-tour-stops'));
		this._stopsContainer.setAttribute('role', 'list');
		this._stopsContainer.setAttribute('aria-label', localize('codeTour.stopsLabel', "Code tour stops"));

		this._footer = dom.append(this.domNode, dom.$('.chat-code-tour-footer'));

		this._register(autorun(reader => {
			const runtime = this._codeTourService.observeRuntime(this._data.tourId).read(reader);
			const currentIndex = runtime?.currentIndex.read(reader) ?? -1;
			const finished = runtime?.finished.read(reader) ?? true;
			this._render(currentIndex, !finished);
		}));
	}

	protected override getIcon(): ThemeIcon {
		return Codicon.mapVertical;
	}

	private _render(currentIndex: number, isRunning: boolean): void {
		this._renderStore.clear();
		dom.clearNode(this._stopsContainer);
		dom.clearNode(this._footer);

		this._data.stops.forEach((stop, index) => {
			this._renderStop(stop, index, index === currentIndex);
		});

		if (isRunning) {
			const stopButton = this._renderStore.add(new Button(this._footer, {
				...defaultButtonStyles,
				secondary: true,
				supportIcons: true,
				title: localize('codeTour.stopTourTitle', "End the tour and stop opening files"),
			}));
			stopButton.label = `$(${Codicon.stopCircle.id}) ${localize('codeTour.stopTour', "Stop Tour")}`;
			this._renderStore.add(stopButton.onDidClick(() => this._codeTourService.stopTour(this._data.tourId)));
		}

		const current = currentIndex >= 0 ? this._data.stops[currentIndex] : undefined;
		if (current && currentIndex !== this._announcedIndex) {
			this._announcedIndex = currentIndex;
			status(localize('codeTour.announceStop', "Code tour stop {0} of {1}: {2}", currentIndex + 1, this._data.stops.length, current.title));
		}
	}

	private _renderStop(stop: IChatCodeTourStop, index: number, isCurrent: boolean): void {
		const row = dom.append(this._stopsContainer, dom.$('.chat-code-tour-stop'));
		row.setAttribute('role', 'listitem');
		row.classList.toggle('current', isCurrent);

		const marker = dom.append(row, dom.$('.chat-code-tour-stop-marker'));
		marker.textContent = String(index + 1);

		const body = dom.append(row, dom.$('.chat-code-tour-stop-body'));
		const heading = dom.append(body, dom.$('.chat-code-tour-stop-heading'));
		heading.textContent = stop.title;

		const location = this._locationLabel(stop);
		if (location) {
			// The heading names the idea; the location is the "go here" affordance,
			// so it is the only interactive element in the row.
			const link = dom.append(body, dom.$('a.chat-code-tour-stop-location'));
			link.tabIndex = 0;
			link.setAttribute('role', 'button');
			link.textContent = location;
			link.setAttribute('aria-label', localize('codeTour.stopAriaLabel', "Stop {0}: {1}, {2}", index + 1, stop.title, location));

			this._renderStore.add(this._hoverService.setupDelayedHover(link, {
				content: localize('codeTour.revealHover', "Reveal {0}", location),
			}));

			const reveal = () => this._codeTourService.revealStop(this._data.tourId, index, stop);
			this._renderStore.add(dom.addDisposableListener(link, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				reveal();
			}));
			this._renderStore.add(dom.addDisposableListener(link, dom.EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					dom.EventHelper.stop(e, true);
					reveal();
				}
			}));
		}

		const narration = this._renderStore.add(this._renderer.render({ value: stop.narration, isTrusted: false }));
		narration.element.classList.add('chat-code-tour-stop-narration');
		body.appendChild(narration.element);
	}

	/** A short, human-readable "where am I" label: `file.ts:12-40` or the URL host. */
	private _locationLabel(stop: IChatCodeTourStop): string | undefined {
		if (stop.uri) {
			const label = this._labelService.getUriLabel(URI.revive(stop.uri), { relative: true });
			if (!stop.range) {
				return label;
			}
			return stop.range.startLineNumber === stop.range.endLineNumber
				? `${label}:${stop.range.startLineNumber}`
				: `${label}:${stop.range.startLineNumber}-${stop.range.endLineNumber}`;
		}
		return stop.url;
	}
}
