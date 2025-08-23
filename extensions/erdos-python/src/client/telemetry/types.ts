// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import type { IEventNamePropertyMapping } from './index';
import { EventName } from './constants';

export type EditorLoadTelemetry = IEventNamePropertyMapping[EventName.EDITOR_LOAD];

export type PythonInterpreterTelemetry = IEventNamePropertyMapping[EventName.PYTHON_INTERPRETER];
export type TestTool = 'pytest' | 'unittest';
export type TestRunTelemetry = IEventNamePropertyMapping[EventName.UNITTEST_RUN];
export type TestDiscoveryTelemetry = IEventNamePropertyMapping[EventName.UNITTEST_DISCOVERY_DONE];
export type TestConfiguringTelemetry = IEventNamePropertyMapping[EventName.UNITTEST_CONFIGURING];
export const IImportTracker = Symbol('IImportTracker');
export interface IImportTracker {}
