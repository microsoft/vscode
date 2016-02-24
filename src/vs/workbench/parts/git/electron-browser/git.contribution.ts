/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerContributions } from 'vs/workbench/parts/git/browser/gitWorkbenchContributions';
import { ElectronGitService } from 'vs/workbench/parts/git/electron-browser/electronGitService';
import { IGitService } from 'vs/workbench/parts/git/common/git';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';

registerContributions();

// Register Service
registerSingleton(IGitService, ElectronGitService);