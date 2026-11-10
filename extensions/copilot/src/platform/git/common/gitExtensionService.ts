/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
// eslint-disable-next-line local/code-layering -- Pre-existing layering violation found when the zone check started resolving extensionless imports.
import { API } from '../vscode/git';

export const IGitExtensionService = createServiceIdentifier<IGitExtensionService>('IGitExtensionService');

export interface IGitExtensionService {

	readonly _serviceBrand: undefined;

	onDidChange: vscode.Event<{ enabled: boolean }>;

	readonly extensionAvailable: boolean;

	getExtensionApi(): API | undefined;
}
