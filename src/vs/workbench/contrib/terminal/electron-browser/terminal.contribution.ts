/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { TerminalNativeContribution } from 'vs/workbench/contrib/terminal/electron-browser/terminalNativeContribution';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { getTerminalShellConfiguration } from 'vs/workbench/contrib/terminal/common/terminalConfiguration';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { getSystemShell } from 'vs/base/node/shell';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { OperatingSystem } from 'vs/base/common/platform';

// This file contains additional desktop-only contributions on top of those in browser/

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(TerminalNativeContribution, LifecyclePhase.Ready);

// Register configurations
const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

const systemShell = async (os: OperatingSystem) => getSystemShell(os, await process.shellEnv());
getTerminalShellConfiguration(systemShell).then(config => configurationRegistry.registerConfiguration(config));
