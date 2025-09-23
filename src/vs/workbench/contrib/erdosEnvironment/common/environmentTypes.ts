/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageRuntimeMetadata } from '../../../services/languageRuntime/common/languageRuntimeService.js';

export const IErdosEnvironmentService = createDecorator<IErdosEnvironmentService>('erdosEnvironmentService');

export interface IPythonEnvironment {
	readonly name: string;
	readonly path: string;
	readonly type: 'conda' | 'venv' | 'system' | 'pyenv' | 'pipenv';
	readonly version: string;
	readonly isActive: boolean;
	readonly runtimeId?: string;
	readonly packages?: IPythonPackage[];
}

export interface IRPackage {
	readonly name: string;
	readonly version: string;
	readonly description?: string;
	readonly isLoaded: boolean;
	readonly priority?: string;
	readonly depends?: string[];
}

export interface IPythonPackage {
	readonly name: string;
	readonly version: string;
	readonly description?: string;
	readonly location?: string;
	readonly editable?: boolean;
}

export interface IErdosEnvironmentService {
	readonly _serviceBrand: undefined;
	
	// Events
	readonly onDidChangeEnvironments: Event<void>;
	readonly onDidChangePackages: Event<string>; // runtimeId
	readonly onDidChangeActiveEnvironment: Event<string>; // languageId
	
	// Python Environments
	getPythonEnvironments(): Promise<IPythonEnvironment[]>;
	refreshPythonEnvironments(): Promise<void>;
	getActiveEnvironment(languageId: 'python' | 'r'): ILanguageRuntimeMetadata | undefined;
	
	// R Packages
	getRPackages(runtimeId?: string): Promise<IRPackage[]>;
	refreshRPackages(runtimeId?: string): Promise<void>;
	
	// Python Packages
	getPythonPackages(runtimeId?: string): Promise<IPythonPackage[]>;
	refreshPythonPackages(runtimeId?: string): Promise<void>;
	
	// Package Management
	installPythonPackage(packageName: string, runtimeId?: string): Promise<void>;
	uninstallPythonPackage(packageName: string, runtimeId?: string): Promise<void>;
	installRPackage(packageName: string, runtimeId?: string): Promise<void>;
	removeRPackage(packageName: string, runtimeId?: string): Promise<void>;
}

export const ERDOS_ENVIRONMENT_VIEW_CONTAINER_ID = 'erdosEnvironment';
export const ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID = 'erdosEnvironment.pythonEnvironments';
export const ERDOS_R_PACKAGES_VIEW_ID = 'erdosEnvironment.rPackages';
export const ERDOS_PYTHON_PACKAGES_VIEW_ID = 'erdosEnvironment.pythonPackages';

