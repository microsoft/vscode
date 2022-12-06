/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { ISandboxConfiguration } from 'vs/base/parts/sandbox/common/sandboxTypes';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { LogLevel } from 'vs/platform/log/common/log';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { PolicyDefinition, PolicyValue } from 'vs/platform/policy/common/policy';
import { UriDto } from 'vs/base/common/uri';

export interface ISharedProcess {

	/**
	 * Toggles the visibility of the otherwise hidden
	 * shared process window.
	 */
	toggle(): Promise<void>;
}

export interface ISharedProcessConfiguration extends ISandboxConfiguration {
	readonly machineId: string;

	readonly args: NativeParsedArgs;

	readonly logLevel: LogLevel;

	readonly profiles: readonly UriDto<IUserDataProfile>[];

	readonly policiesData?: IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }>;
}
