/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EmitterEvent, ListenerCallback} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IMirrorModel} from 'vs/editor/common/editorCommon';

// Resource Service

export var ResourceEvents = {
	ADDED: 'resource.added',
	REMOVED: 'resource.removed',
	CHANGED: 'resource.changed'
};

export interface IResourceAddedEvent {
	url: URI;
	addedElement: IMirrorModel;
}

export interface IResourceRemovedEvent {
	url: URI;
	removedElement: IMirrorModel;
}

export interface IResourceChangedEvent {
	url: URI;
	originalEvents: EmitterEvent[];
}

export var IResourceService = createDecorator<IResourceService>('resourceService');

export interface IResourceService {
	_serviceBrand: any;
	insert(url: URI, element: IMirrorModel): void;
	get(url: URI): IMirrorModel;
	all(): IMirrorModel[];
	contains(url: URI): boolean;
	remove(url: URI): void;
	addListener2_(eventType: 'resource.added', listener: (event: IResourceAddedEvent) => void): IDisposable;
	addListener2_(eventType: 'resource.removed', listener: (event: IResourceRemovedEvent) => void): IDisposable;
	addListener2_(eventType: 'resource.changed', listener: (event: IResourceChangedEvent) => void): IDisposable;
	addListener2_(eventType: string, listener: ListenerCallback): IDisposable;
}

