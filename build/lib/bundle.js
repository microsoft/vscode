"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeAllTSBoilerplate = removeAllTSBoilerplate;
function removeAllTSBoilerplate(source) {
    const seen = new Array(BOILERPLATE.length).fill(true, 0, BOILERPLATE.length);
    return removeDuplicateTSBoilerplate(source, seen);
}
// Taken from typescript compiler => emitFiles
const BOILERPLATE = [
    { start: /^var __extends/, end: /^}\)\(\);$/ },
    { start: /^var __assign/, end: /^};$/ },
    { start: /^var __decorate/, end: /^};$/ },
    { start: /^var __metadata/, end: /^};$/ },
    { start: /^var __param/, end: /^};$/ },
    { start: /^var __awaiter/, end: /^};$/ },
    { start: /^var __generator/, end: /^};$/ },
    { start: /^var __createBinding/, end: /^}\)\);$/ },
    { start: /^var __setModuleDefault/, end: /^}\);$/ },
    { start: /^var __importStar/, end: /^};$/ },
    { start: /^var __addDisposableResource/, end: /^};$/ },
    { start: /^var __disposeResources/, end: /^}\);$/ },
];
function removeDuplicateTSBoilerplate(source, SEEN_BOILERPLATE = []) {
    const lines = source.split(/\r\n|\n|\r/);
    const newLines = [];
    let IS_REMOVING_BOILERPLATE = false, END_BOILERPLATE;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (IS_REMOVING_BOILERPLATE) {
            newLines.push('');
            if (END_BOILERPLATE.test(line)) {
                IS_REMOVING_BOILERPLATE = false;
            }
        }
        else {
            for (let j = 0; j < BOILERPLATE.length; j++) {
                const boilerplate = BOILERPLATE[j];
                if (boilerplate.start.test(line)) {
                    if (SEEN_BOILERPLATE[j]) {
                        IS_REMOVING_BOILERPLATE = true;
                        END_BOILERPLATE = boilerplate.end;
                    }
                    else {
                        SEEN_BOILERPLATE[j] = true;
                    }
                }
            }
            if (IS_REMOVING_BOILERPLATE) {
                newLines.push('');
            }
            else {
                newLines.push(line);
            }
        }
    }
    return newLines.join('\n');
}
//# sourceMappingURL=bundle.js.map