// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Arguments = unknown[];

export enum LogLevel {
    Off = 0,
    Trace = 1,
    Debug = 2,
    Info = 3,
    Warning = 4,
    Error = 5,
}

export interface ILogging {
    traceLog(...data: Arguments): void;
    traceError(...data: Arguments): void;
    traceWarn(...data: Arguments): void;
    traceInfo(...data: Arguments): void;
    traceVerbose(...data: Arguments): void;
}

export type TraceDecoratorType = (
    _: Object,
    __: string,
    descriptor: TypedPropertyDescriptor<any>,
) => TypedPropertyDescriptor<any>;

// The information we want to log.
export enum TraceOptions {
    None = 0,
    Arguments = 1,
    ReturnValue = 2,
}
