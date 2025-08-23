// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as crypto from 'crypto';
import { injectable } from 'inversify';
import { IRandom } from '../types';

function getRandom(): number {
    let num: number = 0;

    const buf: Buffer = crypto.randomBytes(2);
    num = (buf.readUInt8(0) << 8) + buf.readUInt8(1);

    const maxValue: number = Math.pow(16, 4) - 1;
    return num / maxValue;
}

function getRandomBetween(min: number = 0, max: number = 10): number {
    const randomVal: number = getRandom();
    return min + randomVal * (max - min);
}

@injectable()
export class Random implements IRandom {
    public getRandomInt(min: number = 0, max: number = 10): number {
        return getRandomBetween(min, max);
    }
}
