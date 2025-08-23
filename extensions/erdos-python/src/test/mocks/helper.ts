/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as TypeMoq from 'typemoq';
import { Readable } from 'stream';
// eslint-disable-next-line import/no-unresolved
import * as common from 'typemoq/Common/_all';

export class FakeReadableStream extends Readable {
    _read(_size: unknown): void | null {
        // custom reading logic here
        this.push(null); // end the stream
    }
}

export function createTypeMoq<T>(
    targetCtor?: common.CtorWithArgs<T>,
    behavior?: TypeMoq.MockBehavior,
    shouldOverrideTarget?: boolean,
    ...targetCtorArgs: any[]
): TypeMoq.IMock<T> {
    // Use typemoqs for those things that are resolved as promises. mockito doesn't allow nesting of mocks. ES6 Proxy class
    // is the problem. We still need to make it thenable though. See this issue: https://github.com/florinn/typemoq/issues/67
    const result = TypeMoq.Mock.ofType<T>(targetCtor, behavior, shouldOverrideTarget, ...targetCtorArgs);
    result.setup((x: any) => x.then).returns(() => undefined);
    return result;
}
