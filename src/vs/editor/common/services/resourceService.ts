/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {ListenerUnbind, ListenerCallback, IEventEmitter, IEmitterEvent} from 'vs/base/common/eventEmitter';
import EditorCommon = require('vs/editor/common/editorCommon');
import {EventProvider} from 'vs/base/common/eventProvider';
import URI from 'vs/base/common/uri';
import {URL} from 'vs/base/common/network';
import {IDisposable} from 'vs/base/common/lifecycle';

// Resource Service

export var ResourceEvents = {
	ADDED: 'resource.added',
	REMOVED: 'resource.removed',
	CHANGED: 'resource.changed'
};

export interface IResourceAddedEvent {
	url: URL;
	addedElement: EditorCommon.IMirrorModel;
}

export interface IResourceRemovedEvent {
	url: URL;
	removedElement: EditorCommon.IMirrorModel;
}

export interface IResourceChangedEvent {
	url: URL;
	originalEvents: IEmitterEvent[];
}

export var IResourceService = createDecorator<IResourceService>('resourceService');

export interface IResourceService {
	serviceId: ServiceIdentifier<any>;
	insert(url: URI, element: EditorCommon.IMirrorModel): void;
	get(url: URI): EditorCommon.IMirrorModel;
	all(): EditorCommon.IMirrorModel[];
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

