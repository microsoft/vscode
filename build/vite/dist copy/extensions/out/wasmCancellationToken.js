"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WasmCancellationToken = void 0;
class WasmCancellationToken {
    shouldCancel;
    currentRequestId = undefined;
    setRequest(requestId) {
        this.currentRequestId = requestId;
    }
    resetRequest(requestId) {
        if (requestId === this.currentRequestId) {
            this.currentRequestId = undefined;
        }
        else {
            throw new Error(`Mismatched request id, expected ${this.currentRequestId} but got ${requestId}`);
        }
    }
    isCancellationRequested() {
        return this.currentRequestId !== undefined && !!this.shouldCancel && this.shouldCancel();
    }
}
exports.WasmCancellationToken = WasmCancellationToken;
//# sourceMappingURL=wasmCancellationToken.js.map