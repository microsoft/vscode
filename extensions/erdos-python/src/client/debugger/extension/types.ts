// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { DebugAdapterDescriptorFactory, DebugAdapterTrackerFactory, DebugConfigurationProvider } from 'vscode';

export const IDebugConfigurationService = Symbol('IDebugConfigurationService');
export interface IDebugConfigurationService extends DebugConfigurationProvider {}

export const IDebugAdapterDescriptorFactory = Symbol('IDebugAdapterDescriptorFactory');
export interface IDebugAdapterDescriptorFactory extends DebugAdapterDescriptorFactory {}

export const IDebugSessionLoggingFactory = Symbol('IDebugSessionLoggingFactory');

export interface IDebugSessionLoggingFactory extends DebugAdapterTrackerFactory {}

export const IOutdatedDebuggerPromptFactory = Symbol('IOutdatedDebuggerPromptFactory');

export interface IOutdatedDebuggerPromptFactory extends DebugAdapterTrackerFactory {}

export enum PythonPathSource {
    launchJson = 'launch.json',
    settingsJson = 'settings.json',
}
