/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export class Event {
	public time: number;
	public originalEvent: Event;
	public source: any;

	constructor(originalEvent?: Event) {
		this.time = (new Date()).getTime();
		this.originalEvent = originalEvent;
		this.source = null;
	}
}

export class PropertyChangeEvent extends Event {
	public key: string;
	public oldValue: any;
	public newValue: any;

	constructor(key?: string, oldValue?: any, newValue?: any, originalEvent?: Event) {
		super(originalEvent);

		this.key = key;
		this.oldValue = oldValue;
		this.newValue = newValue;
	}
}

export class ViewerEvent extends Event {
	public element: any;

	constructor(element: any, originalEvent?: Event) {
		super(originalEvent);

		this.element = element;
	}
}

export interface ISelectionEvent {
	selection: any[];
	payload?: any;
	source: any;
}

export interface IFocusEvent {
	focus: any;
	payload?: any;
	source: any;
}

export interface IHighlightEvent {
	highlight: any;
	payload?: any;
	source: any;
}

export const EventType = {
	PROPERTY_CHANGED: 'propertyChanged',
	SELECTION: 'selection',
	FOCUS: 'focus',
	BLUR: 'blur',
	HIGHLIGHT: 'highlight',
	EXPAND: 'expand',
	COLLAPSE: 'collapse',
	TOGGLE: 'toggle',
	BEFORE_RUN: 'beforeRun',
	RUN: 'run',
	EDIT: 'edit',
	SAVE: 'save',
	CANCEL: 'cancel',
	CHANGE: 'change',
	DISPOSE: 'dispose',
};

