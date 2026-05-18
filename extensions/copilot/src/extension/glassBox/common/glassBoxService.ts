/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import type { GlassBoxRequestAggregate } from './types';

export const IGlassBoxService = createServiceIdentifier<IGlassBoxService>('IGlassBoxService');

/**
 * Service interface for Glass Box AI data collection.
 */
export interface IGlassBoxService {
	readonly _serviceBrand: undefined;

	/** Fired when request aggregates change */
	readonly onDidChangeRequests: Event<void>;

	/** Get all stored request aggregates (sanitized, bounded) */
	getRequests(): readonly GlassBoxRequestAggregate[];

	/** Get a specific request by correlation ID */
	getRequestById(id: string): GlassBoxRequestAggregate | undefined;

	/** Whether Glass Box collection is currently enabled */
	readonly isEnabled: boolean;

	/** Enable or disable collection */
	setEnabled(enabled: boolean): void;
}
