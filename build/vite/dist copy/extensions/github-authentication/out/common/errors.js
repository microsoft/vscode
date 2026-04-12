"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANCELLATION_ERROR = exports.NETWORK_ERROR = exports.USER_CANCELLATION_ERROR = exports.TIMED_OUT_ERROR = void 0;
exports.TIMED_OUT_ERROR = 'Timed out';
// These error messages are internal and should not be shown to the user in any way.
exports.USER_CANCELLATION_ERROR = 'User Cancelled';
exports.NETWORK_ERROR = 'network error';
// This is the error message that we throw if the login was cancelled for any reason. Extensions
// calling `getSession` can handle this error to know that the user cancelled the login.
exports.CANCELLATION_ERROR = 'Cancelled';
//# sourceMappingURL=errors.js.map