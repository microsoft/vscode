// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export type IStartupDurations = Record<
    'totalNonBlockingActivateTime' | 'totalActivateTime' | 'startActivateTime' | 'codeLoadingTime',
    number
>;
