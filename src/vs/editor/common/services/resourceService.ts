/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEmitterEvent, ListenerCallback, ListenerUnbind} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';
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
	originalEvents: IEmitterEvent[];
}

export var IResourceService = createDecorator<IResourceService>('resourceService');

export interface IResourceService {
	serviceId: ServiceIdentifier<any>;
	insert(url: URI, element: IMirrorModel): void;
	get(url: URI): IMirrorModel;
	all(): IMirrorModel[];
	contains(url: URI): boolean;
	remove(url: URI): void;
	addListener_(eventType: 'resource.added', listener: (event: IResourceAddedEvent) => void): ListenerUnbind;
	addListener_(eventType: 'resource.removed', listener: (event: IResourceRemovedEvent) => void): ListenerUnbind;
	addListener_(eventType: 'resource.changed', listener: (event: IResourceChangedEvent) => void): ListenerUnbind;
	addListener_(eventType: string, listener: ListenerCallback): ListenerUnbind;
	addListener2_(eventType: 'resource.added', listener: (event: IResourceAddedEvent) => void): IDisposable;
	addListener2_(eventType: 'resource.removed', listener: (event: IResourceRemovedEvent) => void): IDisposable;
	addListener2_(eventType: 'resource.changed', listener: (event: IResourceChangedEvent) => void): IDisposable;
	addListener2_(eventType: string, listener: ListenerCallback): IDisposable;
}

