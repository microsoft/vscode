/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { ILoggerResource, LogLevel } from 'vs/platform/log/common/log';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { PolicyDefinition, PolicyValue } from 'vs/platform/policy/common/policy';
import { UriComponents, UriDto } from 'vs/base/common/uri';

export interface ISharedProcessConfiguration {
	readonly machineId: string;

	readonly sqmId: string;

	readonly devDeviceId: string;

	readonly codeCachePath: string | undefined;

	readonly args: NativeParsedArgs;

	readonly logLevel: LogLevel;

	readonly loggers: UriDto<ILoggerResource>[];

	readonly profiles: {
		readonly home: UriComponents;
		readonly all: readonly UriDto<IUserDataProfile>[];
	};

	readonly policiesData?: IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }>;
}
