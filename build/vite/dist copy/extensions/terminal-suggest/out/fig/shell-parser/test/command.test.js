"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const command_1 = require("../command");
suite('fig/shell-parser/ getCommand', () => {
    const aliases = {
        woman: 'man',
        quote: `'q'`,
        g: 'git',
    };
    const getTokenText = (command) => command?.tokens.map((token) => token.text) ?? [];
    test('works without matching aliases', () => {
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('git co ', {})), ['git', 'co', '']);
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('git co ', aliases)), ['git', 'co', '']);
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('woman ', {})), ['woman', '']);
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('another string ', aliases)), [
            'another',
            'string',
            '',
        ]);
    });
    test('works with regular aliases', () => {
        // Don't change a single token.
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('woman', aliases)), ['woman']);
        // Change first token if length > 1.
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('woman ', aliases)), ['man', '']);
        // Don't change later tokens.
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('man woman ', aliases)), ['man', 'woman', '']);
        // Handle quotes
        (0, node_assert_1.deepStrictEqual)(getTokenText((0, command_1.getCommand)('quote ', aliases)), ['q', '']);
    });
});
//# sourceMappingURL=command.test.js.map