/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-negated-condition: "error" */
export function checkCustomers(name: string, customers: { name: string }[]) {
	for (const customer of customers) {
		if (customer.name !== name) {
			checkCustomer(customer);
		}
		else {
			continue;
		}
	}
}
function checkCustomer(customer: { name: string }) {
	if (customer.name === 'n/a') {
		throw new Error('no customer');
	}
	// TODO: Finish this
}
