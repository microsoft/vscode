/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionActions';

export class Query {

	constructor(public value: string, public sortBy: string, public sortOrder: string) {}

	static parse(value: string): Query {
		let sortBy: string = undefined;
		let sortOrder: string = undefined;

		value = value.replace(/@sort:(\w+)(-asc|-desc)?\b/g, (match, by: string, order: string) => {
			if (order) {
				sortOrder = order.substr(1);
			}

			sortBy = by;

			return '';
		});

		return new Query(value.trim(), sortBy, sortOrder);
	}

	toString(): string {
		let result = this.value;

		if (this.sortBy) {
			result = `${ result }${ result ? ' ' : '' }@sort:${ this.sortBy }`;

			if (this.sortOrder) {
				result = `${ result }-${ this.sortOrder }`;
			}
		}

		return result;
	}

	isValid(): boolean {
		return !!this.sortBy || !this.sortOrder;
	}

	equals(other: Query): boolean {
		return this.value === other.value && this.sortBy === other.sortBy && this.sortOrder === other.sortOrder;
	}
}