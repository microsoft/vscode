/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SnapshotClient } from '@vitest/snapshot';
import { NodeSnapshotEnvironment } from '@vitest/snapshot/environment';
import * as assert from 'assert';
import { createServiceIdentifier } from '../../src/util/common/services';
import { Lazy } from '../../src/util/vs/base/common/lazy';

export const ITestSnapshots = createServiceIdentifier<ITestSnapshots>('ITestSnapshots');

export interface ITestSnapshots {
	readonly _serviceBrand: undefined;

	matches(value: unknown, message?: string): Promise<void>;
}

export class TestSnapshotsImpl implements ITestSnapshots {
	declare readonly _serviceBrand: undefined;

	private readonly client = new Lazy(async () => {
		const client = new SnapshotClient({
			isEqual: (received, expected) => {
				try {
					assert.deepStrictEqual(received, expected);
					return true;
				} catch {
					return false;
				}
			}
		});

		const name = this.runNumber !== undefined ? `${this.testName}-${this.runNumber}` : this.testName;
		await client.startCurrentRun(this.filePath, name, {
			updateSnapshot: 'new',
			snapshotEnvironment: new NodeSnapshotEnvironment(),
		});

		return client;
	});

	constructor(
		private readonly filePath: string,
		private readonly testName: string,
		private readonly runNumber?: number,
	) { }


	public async matches(value: unknown, message?: string): Promise<void> {
		(await this.client.value).assert({
			received: value,
			isInline: false,
			message,
		});
	}

	public async dispose() {
		const client = await this.client.rawValue;
		const r = await client?.finishCurrentRun();
		if (r?.unmatched) {
			throw new Error(`${r.unmatched} snapshot(s) failed to match`);
		}
	}
}
