// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// Fake interfaces that are required for web workers to work around
// tsconfig's DOM and WebWorker lib options being mutally exclusive.
// https://github.com/microsoft/TypeScript/issues/20595

interface DedicatedWorkerGlobalScope {}
