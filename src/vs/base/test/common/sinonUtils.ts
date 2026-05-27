/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';

export function asSinonMethodStub<T extends (...args: never[]) => unknown>(method: T): sinon.SinonStubbedMember<T> {
	return method as unknown as sinon.SinonStubbedMember<T>;
}
