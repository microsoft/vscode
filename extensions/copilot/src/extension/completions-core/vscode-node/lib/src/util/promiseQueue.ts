/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../../../util/common/services';

export const ICompletionsPromiseQueueService = createServiceIdentifier<ICompletionsPromiseQueueService>('completionsPromiseQueueService');
export interface ICompletionsPromiseQueueService {
	readonly _serviceBrand: undefined;

	register(promise: Promise<unknown>): void;
	flush(): Promise<void>;
}

export class PromiseQueue implements ICompletionsPromiseQueueService {
	declare _serviceBrand: undefined;

	protected promises = new Set<Promise<unknown>>();
	register(promise: Promise<unknown>) {
		this.promises.add(promise);
		void promise.finally(() => this.promises.delete(promise));
	}

	async flush() {
		await Promise.allSettled(this.promises);
	}
}
