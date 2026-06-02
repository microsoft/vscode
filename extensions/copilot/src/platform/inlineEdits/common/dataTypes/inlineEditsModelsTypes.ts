/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IValidator, vArray, vObj, vString } from '../../../configuration/common/validator';

export namespace WireTypes {

	export namespace Capabilities {
		export type t = {
			promptStrategy: string;
		};
		export function is(obj: unknown): obj is t {
			return !!obj && typeof obj === 'object' &&
				typeof (obj as t).promptStrategy === 'string';
		}
		export const validator: IValidator<t> = vObj({
			promptStrategy: vString(),
		});
	}

	export namespace Model {
		export type t = {
			serviceType: string;
			name: string;
			provider: string;
			capabilities: Capabilities.t;
		};
		export const validator: IValidator<t> = vObj({
			serviceType: vString(),
			name: vString(),
			provider: vString(),
			capabilities: Capabilities.validator,
		});
		export function is(obj: unknown): obj is t {
			return !!obj && typeof obj === 'object' &&
				typeof (obj as t).serviceType === 'string' &&
				typeof (obj as t).name === 'string' &&
				typeof (obj as t).provider === 'string' &&
				Capabilities.is((obj as t).capabilities);
		}
	}

	export namespace ModelList {
		export type t = {
			models: Model.t[];
		};
		export const validator: IValidator<t> = vObj({
			models: vArray(Model.validator),
		});
		export function is(obj: unknown): obj is t {
			return !!obj && typeof obj === 'object' && Array.isArray((obj as t).models) && (obj as t).models.every(Model.is);
		}
	}
}

