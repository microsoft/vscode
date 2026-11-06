/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';


export interface DevContainerConfigGeneratorArguments {
	rootUri: Uri;
	index: DevContainerConfigIndex;
}

export interface DevContainerConfigIndex {
	templates: DevContainerConfigTemplate[];
	features?: DevContainerConfigFeature[];
}

export interface DevContainerConfigTemplate {
	id: string;
	name?: string;
	description?: string;
}

export interface DevContainerConfigFeature {
	id: string;
	name?: string;
	description?: string;
}

export type DevContainerConfigGeneratorResult = {
	type: 'success';
	template: string | undefined;
	features: string[];
} | {
	type: 'cancelled';
} | {
	type: 'failure';
	message: string;
};

export const IDevContainerConfigurationService = createServiceIdentifier<IDevContainerConfigurationService>('IDevContainerConfigurationService');

export interface IDevContainerConfigurationService {
	readonly _serviceBrand: undefined;
	generateConfiguration(args: DevContainerConfigGeneratorArguments, cancellationToken: CancellationToken): Promise<DevContainerConfigGeneratorResult>;
}

/**
 * @remark For testing purposes only.
 */
export class FailingDevContainerConfigurationService implements IDevContainerConfigurationService {
	readonly _serviceBrand: undefined;
	generateConfiguration(_args: DevContainerConfigGeneratorArguments, _cancellationToken: CancellationToken): Promise<DevContainerConfigGeneratorResult> {
		return Promise.resolve({ type: 'failure', message: 'For testing: not implemented' });
	}
}
