/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

/// <reference no-default-lib="true"/>
/// <reference path="lib.es2015.symbol.d.ts" />
/// <reference path="lib.es2015.symbol.wellknown.d.ts" />

interface SharedArrayBuffer {
    /**
      * Read-only. The length of the ArrayBuffer (in bytes).
      */
    readonly byteLength: number;

    /*
     * The SharedArrayBuffer constructor's length property whose value is 1.
     */
    length: number;
    /**
      * Returns a section of an SharedArrayBuffer.
      */
    slice(begin:number, end?:number): SharedArrayBuffer;
    readonly [Symbol.species]: SharedArrayBuffer;
    readonly [Symbol.toStringTag]: "SharedArrayBuffer";
}

interface SharedArrayBufferConstructor {
    readonly prototype: SharedArrayBuffer;
    new (byteLength: number): SharedArrayBuffer;
}

declare var SharedArrayBuffer: SharedArrayBufferConstructor;