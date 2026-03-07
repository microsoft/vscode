/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestService } from '../../request/common/request.js';
import { AbstractOneDataSystemAppender, IAppInsightsCore } from '../common/1dsAppender.js';

// Son of Anton: Microsoft 1DS telemetry has been removed.
// This class is a no-op stub that preserves the constructor signature.

export class OneDataSystemAppender extends AbstractOneDataSystemAppender {

	constructor(
		_requestService: IRequestService | undefined,
		isInternalTelemetry: boolean,
		eventPrefix: string,
		defaultData: { [key: string]: unknown } | null,
		iKeyOrClientFactory: string | (() => IAppInsightsCore),
	) {
		super(isInternalTelemetry, eventPrefix, defaultData, iKeyOrClientFactory);
	}
}
