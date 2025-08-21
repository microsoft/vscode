/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IErdosPlotClient, IExtendedErdosPlotMetadata } from '../../../services/erdosPlots/common/erdosPlots.js';

/**
 * WebviewPlotClient class - placeholder implementation
 */
export class WebviewPlotClient extends Disposable implements IErdosPlotClient {
	constructor(
		public readonly id: string,
		public readonly metadata: IExtendedErdosPlotMetadata
	) {
		super();
	}

	override dispose(): void {
		super.dispose();
	}
}
