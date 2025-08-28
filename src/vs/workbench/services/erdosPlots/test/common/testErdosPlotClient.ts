/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../base/common/uuid.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IErdosPlotClient, ZoomLevel, IExtendedErdosPlotMetadata } from '../../common/erdosPlots.js';

export class TestErdosPlotClient extends Disposable implements IErdosPlotClient {
	constructor(
		public readonly metadata: IExtendedErdosPlotMetadata = {
			id: generateUuid(),
			session_id: 'test-session',
			created: Date.now(),
			parent_id: '',
			code: 'test code',
			zoom_level: ZoomLevel.Fit,
		}
	) {
		super();
	}

	get id(): string {
		return this.metadata.id;
	}
}
