/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./timer';
import {TimeKeeper, ITimerEvent, getTimeKeeper} from 'vs/base/common/timer';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import DomUtils = require('vs/base/browser/dom');

interface IUnmatchedStartTimerEvent {
	event: ITimerEvent;
	domNode: HTMLElement;
}

export class TimeKeeperRenderer {

	private listenersToRemove: IDisposable[];
	private timeKeeper: TimeKeeper;
	private outerDomNode: HTMLElement;
	private domNode: HTMLElement;
	private renderCnt: number;
	private lastEventIndex: number;

	private textFilter: string;
	private textFilterDomNode: HTMLInputElement;
	private timeFilter: number;
	private timeFilterDomNode: HTMLInputElement;
	private intervalTokenId: number;

	private renderedEvents: {
		[key: string]: ITimerEvent;
	};

	private onHide: () => void;

	constructor(onHide: () => void) {
		this.timeKeeper = getTimeKeeper();
		this.onHide = onHide;
		this.lastEventIndex = 0;
		this.renderedEvents = {};
		this.renderCnt = 0;
		this.listenersToRemove = [];
		this.domNode = this._createDomNode();
		this.intervalTokenId = window.setInterval(() => this._render(), 500);
	}

	public destroy(): void {
		document.body.removeChild(this.outerDomNode);
		window.clearInterval(this.intervalTokenId);
		this.listenersToRemove = disposeAll(this.listenersToRemove);
	}

	private _createDomNode(): HTMLElement {
		this.outerDomNode = document.createElement('div');
		this.outerDomNode.className = 'benchmarktimerbox';

		// Clear
		let cancel: HTMLInputElement = <HTMLInputElement>document.createElement('input');
		cancel.type = 'button';
		cancel.value = 'Clear';
		this.listenersToRemove.push(DomUtils.addDisposableListener(cancel, 'click', () => this._onClear()));
		this.outerDomNode.appendChild(cancel);

		// Text filter
		this.textFilterDomNode = <HTMLInputElement>document.createElement('input');
		this.textFilterDomNode.type = 'text';
		this.textFilterDomNode.className = 'textFilter';
		this.listenersToRemove.push(DomUtils.addDisposableListener(this.textFilterDomNode, 'keydown', () => this.onTextFilterChange()));
		this.textFilter = '';
		this.outerDomNode.appendChild(document.createTextNode('Filter'));
		this.outerDomNode.appendChild(this.textFilterDomNode);

		// Time filter
		this.timeFilterDomNode = <HTMLInputElement>document.createElement('input');
		this.timeFilterDomNode.type = 'text';
		this.timeFilterDomNode.value = '0';
		this.timeFilterDomNode.className = 'timeFilter';
		this.listenersToRemove.push(DomUtils.addDisposableListener(this.timeFilterDomNode, 'keydown', () => this.onTimeFilterChange()));
		this.timeFilter = 0;
		this.outerDomNode.appendChild(document.createTextNode('Hide time under'));
		this.outerDomNode.appendChild(this.timeFilterDomNode);

		let hide: HTMLInputElement = <HTMLInputElement>document.createElement('input');
		hide.type = 'button';
		hide.value = 'Close';
		this.listenersToRemove.push(DomUtils.addDisposableListener(hide, 'click', () => {
			this.onHide();
		}));
		this.outerDomNode.appendChild(hide);

		let heading = document.createElement('pre');
		heading.appendChild(document.createTextNode(this.renderRow('TOPIC', 'NAME', 'TOOK', 'START', 'END')));
		this.outerDomNode.appendChild(heading);
		this.outerDomNode.appendChild(document.createElement('hr'));

		let domNode = document.createElement('div');
		domNode.className = 'inner';
		this.outerDomNode.appendChild(domNode);

		document.body.appendChild(this.outerDomNode);

		return domNode;
	}

	private onTextFilterChange(): void {
		setTimeout(() => {
			this.refilter();
		});
	}

	private onTimeFilterChange(): void {
		setTimeout(() => {
			this.refilter();
		});
	}

	private matchesTextFilter(event: ITimerEvent): boolean {
		if (!this.textFilter) {
			return true;
		}
		if (event.topic.toLowerCase().indexOf(this.textFilter.toLowerCase()) >= 0) {
			return true;
		}
		if (event.name.toLowerCase().indexOf(this.textFilter.toLowerCase()) >= 0) {
			return true;
		}
		return false;
	}

	private matchesTimeFilter(event: ITimerEvent): boolean {
		if (!this.timeFilter) {
			return true;
		}
		if (event.timeTaken() >= this.timeFilter) {
			return true;
		}
		return false;
	}

	private shouldShow(event: ITimerEvent): boolean {
		return this.matchesTextFilter(event) && this.matchesTimeFilter(event);
	}

	private refilter(): void {
		this.textFilter = this.textFilterDomNode.value;
		this.timeFilter = parseInt(this.timeFilterDomNode.value, 10);

		let domNodes = Array.prototype.slice.call(this.domNode.children, 0);
		for (let i = 0; i < domNodes.length; i++) {
			let eventId = domNodes[i].getAttribute('data-event-id');
			let event = this.renderedEvents[eventId];

			if (this.shouldShow(event)) {
				domNodes[i].style.display = 'inherit';
			} else {
				domNodes[i].style.display = 'none';
			}
		}
	}

	private _onClear(): void {
		this.lastEventIndex = this.timeKeeper.getCollectedEvents().length;
		this.renderedEvents = {};
		this.renderCnt = 0;
		DomUtils.clearNode(this.domNode);
	}

	private leftPaddedString(size: number, padChar: string, str: string): string {
		let spaces = this._repeatStr(padChar, Math.max(0, size - str.length));
		return spaces + str;
	}

	private rightPaddedString(size: number, padChar: string, str: string): string {
		let spaces = this._repeatStr(padChar, Math.max(0, size - str.length));
		return str + spaces;
	}

	private renderRow(topic: string, name: string, timeTook: string, timeStart: string, timerEnd: string): string {
		let result = ' ';
		result += this.rightPaddedString(10, ' ', topic);
		result += this.rightPaddedString(30, ' ', name);
		result += ' ' + this.leftPaddedString(15, ' ', timeTook);
		result += ' ' + this.leftPaddedString(13, ' ', timeStart);
		return result;
	}

	private _suffix0(s: string): string {
		if (s.charAt(s.length - 3) === '.') {
			return s;
		}
		if (s.charAt(s.length - 2) === '.') {
			return s + '0';
		}
		return s + '.00';
	}

	private _twoPrecision(a: number): string {
		return this._suffix0(Math.round(a * 100) / 100 + '');
	}

	private _absoluteTime(t: number): string {
		if (t < 1000) {
			return this._twoPrecision(t) + ' ms';
		}
		t /= 1000;
		if (t < 60) {
			return this._twoPrecision(t) + ' s';
		}
		t /= 60;
		if (t < 60) {
			return this._twoPrecision(t) + ' m';
		}
		t /= 60;
		return this._twoPrecision(t) + ' h';
	}

	private _renderEvent(domNode: HTMLElement, event: ITimerEvent): void {
		let start = event.startTime.getTime() - TimeKeeper.PARSE_TIME.getTime();

		let result = this.renderRow(
			event.topic,
			event.name,
			this._twoPrecision(event.timeTaken()),
			this._absoluteTime(start) + '',
			this._absoluteTime(start + event.timeTaken())
		);
		domNode.textContent = '';
		domNode.appendChild(document.createTextNode(result));
	}

	private _renderStartTimerEvent(event: ITimerEvent): void {
		let domNode = document.createElement('pre');
		this._renderEvent(domNode, event);
		this.domNode.appendChild(domNode);
		let idString = event.id.toString();

		domNode.setAttribute('data-event-id', idString);
		domNode.className = 'timer-event-' + (event.id % 2);
		this.renderedEvents[idString] = event;

		if (this.shouldShow(this.renderedEvents[idString])) {
			domNode.style.display = 'inherit';
		} else {
			domNode.style.display = 'none';
		}

		this.renderCnt++;
	}

	private _render(): void {
		let allEvents = this.timeKeeper.getCollectedEvents(), didSomething = false;

		for (let i = this.lastEventIndex; i < allEvents.length; i++) {
			let ev = allEvents[i];

			if (!ev.stopTime) {
				// This event is not yet finished => block
				this.lastEventIndex = i;
				if (didSomething) {
					this.domNode.scrollTop = 100000;
				}
				return;
			}

			this._renderStartTimerEvent(ev);
			didSomething = true;
		}

		if (didSomething) {
			this.domNode.scrollTop = 100000;
		}
		this.lastEventIndex = allEvents.length;
	}

	private _repeatStr(str: string, cnt: number): string {
		let r = '';
		for (let i = 0; i < cnt; i++) {
			r += str;
		}
		return r;
	}
}

