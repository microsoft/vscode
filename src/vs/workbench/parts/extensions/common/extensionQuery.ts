/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Query {

	constructor(public value: string, public sortBy: string, public sortOrder: string) {
		this.value = value.trim();
	}

	static parse(value: string): Query {
		let sortBy = '';
		let sortOrder = '';

		value = value.replace(/@sort:(\w+)(-\w*)?/g, (match, by: string, order: string) => {
			if (order === '-asc' || order === '-desc') {
				sortOrder = order.substr(1);
			}

			sortBy = by;

			return '';
		});

		return new Query(value, sortBy, sortOrder);
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