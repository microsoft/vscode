/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import lifecycle = require('vs/base/common/lifecycle');

export interface EventProvider<T extends Function> {
	add(callback: T, context?: any, bucket?: lifecycle.IDisposable[]): void;
	remove(callback: T, context?: any): void;
}
