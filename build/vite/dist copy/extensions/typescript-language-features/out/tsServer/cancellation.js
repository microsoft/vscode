"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.noopRequestCancellerFactory = void 0;
const noopRequestCanceller = new class {
    cancellationPipeName = undefined;
    tryCancelOngoingRequest(_seq) {
        return false;
    }
};
exports.noopRequestCancellerFactory = new class {
    create(_serverId, _tracer) {
        return noopRequestCanceller;
    }
};
//# sourceMappingURL=cancellation.js.map