"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSelectionRanges = getSelectionRanges;
const languageModes_1 = require("./languageModes");
const positions_1 = require("../utils/positions");
async function getSelectionRanges(languageModes, document, positions) {
    const htmlMode = languageModes.getMode('html');
    return Promise.all(positions.map(async (position) => {
        const htmlRange = await htmlMode.getSelectionRange(document, position);
        const mode = languageModes.getModeAtPosition(document, position);
        if (mode && mode.getSelectionRange) {
            const range = await mode.getSelectionRange(document, position);
            let top = range;
            while (top.parent && (0, positions_1.insideRangeButNotSame)(htmlRange.range, top.parent.range)) {
                top = top.parent;
            }
            top.parent = htmlRange;
            return range;
        }
        return htmlRange || languageModes_1.SelectionRange.create(languageModes_1.Range.create(position, position));
    }));
}
//# sourceMappingURL=selectionRanges.js.map