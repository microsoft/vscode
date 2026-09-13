/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IHasToolConfirmationMeta {
	readonly _meta?: Record<string, unknown>;
}

const confirmationIdKey = 'agentHost.confirmationId';

export function hasToolConfirmationId(source: IHasToolConfirmationMeta): boolean {
	return source._meta !== undefined && Object.hasOwn(source._meta, confirmationIdKey);
}

export function readToolConfirmationId(source: IHasToolConfirmationMeta): string | undefined {
	const value = source._meta?.[confirmationIdKey];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function withToolConfirmationId<T extends object>(source: T & IHasToolConfirmationMeta, id: string | undefined): T & IHasToolConfirmationMeta {
	return id === undefined ? source : { ...source, _meta: { ...source._meta, [confirmationIdKey]: id } };
}
