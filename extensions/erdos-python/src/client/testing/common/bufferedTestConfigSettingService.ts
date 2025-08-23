// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Uri } from 'vscode';
import { ITestConfigSettingsService, UnitTestProduct } from './types';

export class BufferedTestConfigSettingsService implements ITestConfigSettingsService {
    private ops: [string, string | Uri, UnitTestProduct, string[]][];

    constructor() {
        this.ops = [];
    }

    public async updateTestArgs(testDirectory: string | Uri, product: UnitTestProduct, args: string[]): Promise<void> {
        this.ops.push(['updateTestArgs', testDirectory, product, args]);
        return Promise.resolve();
    }

    public async enable(testDirectory: string | Uri, product: UnitTestProduct): Promise<void> {
        this.ops.push(['enable', testDirectory, product, []]);
        return Promise.resolve();
    }

    public async disable(testDirectory: string | Uri, product: UnitTestProduct): Promise<void> {
        this.ops.push(['disable', testDirectory, product, []]);
        return Promise.resolve();
    }

    public async apply(cfg: ITestConfigSettingsService): Promise<void> {
        const { ops } = this;
        this.ops = [];
        // Note that earlier ops do not get rolled back if a later
        // one fails.
        for (const [op, testDir, prod, args] of ops) {
            switch (op) {
                case 'updateTestArgs':
                    await cfg.updateTestArgs(testDir, prod, args);
                    break;
                case 'enable':
                    await cfg.enable(testDir, prod);
                    break;
                case 'disable':
                    await cfg.disable(testDir, prod);
                    break;
                default:
                    break;
            }
        }
        return Promise.resolve();
    }

    // eslint-disable-next-line class-methods-use-this
    public getTestEnablingSetting(_: UnitTestProduct): string {
        throw new Error('Method not implemented.');
    }
}
