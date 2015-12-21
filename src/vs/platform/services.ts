/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import Severity from 'vs/base/common/severity';
import Async = require('vs/base/common/async');
import Strings = require('vs/base/common/strings');
import Network = require('vs/base/common/network');
import URI from 'vs/base/common/uri';
import Glob = require('vs/base/common/glob');
import Paths = require('vs/base/common/paths');
import EventEmitter = require('vs/base/common/eventEmitter');
import Timer = require('vs/base/common/timer');
import objects = require('vs/base/common/objects');
import Actions = require('vs/base/common/actions');
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import Lifecycle = require('vs/base/common/lifecycle');
import hash = require('vs/base/common/hash');
import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');

import http = require('vs/base/common/http');
import events = require('vs/base/common/events');
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IFileService} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IRequestService} from 'vs/platform/request/common/request';
import {ISearchService} from 'vs/platform/search/common/search';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IPluginService} from 'vs/platform/plugins/common/plugins';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export interface IServicesContext {
	[serviceName: string]: any;
	instantiationService: IInstantiationService;
}

export interface IPlatformServices extends IServicesContext {
	threadService:IThreadService;
	pluginService: IPluginService;
	instantiationService:IInstantiationService;
	lifecycleService: ILifecycleService;
	messageService:IMessageService;
	markerService: IMarkerService;
	editorService:IEditorService;
	requestService:IRequestService;
	keybindingService:IKeybindingService;
	contextService:IWorkspaceContextService;
	contextViewService:IContextViewService;
	contextMenuService:IContextMenuService;
	telemetryService:ITelemetryService;
	eventService:IEventService;
	storageService:IStorageService;
	searchService:ISearchService;
	configurationService:IConfigurationService;
	progressService:IProgressService;
	fileService:IFileService;
}


