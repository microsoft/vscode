/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IErdosPlotClient, IExtendedErdosPlotMetadata } from './erdosPlots.js';

/**
 * StaticPlotClient - represents a static plot image
 */
export class StaticPlotClient extends Disposable implements IErdosPlotClient {
	constructor(
		public readonly id: string,
		public readonly metadata: IExtendedErdosPlotMetadata,
		public readonly uri: string,
		public readonly mimeType: string,
		public readonly data?: string
	) {
		super();
	}

	/**
	 * Creates a StaticPlotClient from image data
	 */
	static fromData(imageData: string, mimeType: string, metadata: any): StaticPlotClient {
		const extendedMetadata: IExtendedErdosPlotMetadata = {
			...metadata,
			session_id: metadata.session_id,
			suggested_file_name: metadata.suggested_file_name,
			language: metadata.language
		};

		return new StaticPlotClient(
			metadata.id,
			extendedMetadata,
			imageData, // URI (data URI)
			mimeType,
			imageData // Raw data
		);
	}

	/**
	 * Gets the code that generated this plot
	 */
	get code(): string {
		return this.metadata.code || '';
	}

	override dispose(): void {
		super.dispose();
	}
}