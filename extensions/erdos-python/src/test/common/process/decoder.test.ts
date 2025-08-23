// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { encode, encodingExists } from 'iconv-lite';
import { decodeBuffer } from '../../../client/common/process/decoder';
import { initialize } from './../../initialize';

suite('Decoder', () => {
    setup(initialize);
    teardown(initialize);

    test('Test decoding utf8 strings', () => {
        const value = 'Sample input string Сделать это';
        const buffer = encode(value, 'utf8');
        const decodedValue = decodeBuffer([buffer]);
        expect(decodedValue).equal(value, 'Decoded string is incorrect');
    });

    test('Test decoding cp932 strings', function () {
        if (!encodingExists('cp866')) {
            this.skip();
        }
        const value = 'Sample input string Сделать это';
        const buffer = encode(value, 'cp866');
        let decodedValue = decodeBuffer([buffer]);
        expect(decodedValue).not.equal(value, 'Decoded string is the same');

        decodedValue = decodeBuffer([buffer], 'cp866');
        expect(decodedValue).equal(value, 'Decoded string is incorrect');
    });
});
