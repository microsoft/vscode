/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { Cache } from './cache';

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 1) {
		console.log('Usage:');
		console.log('  npx tsx cache-cli check - Check if there are any duplicate keys in the databases');
		process.exit(1);
	}

	const cache = new Cache(path.resolve(__dirname, '..', 'simulation', 'cache'));

	try {
		switch (args[0]) {
			case 'check': {
				const result = await cache.checkDatabase();
				if (result.size === 0) {
					console.log('✅ No duplicate keys found.');
				} else {
					console.log('⛔ Duplicate keys found:');
					for (const [key, values] of result) {
						console.log(` - "${key}" found in: `, values.join(', '));
					}
					throw new Error('Duplicate keys found in the database.');
				}
				break;
			}
			default: {
				console.error('Invalid command. Use: check');
				process.exit(1);
			}
		}
	} catch (error) {
		console.error('⛔ Error:', error);
		process.exit(1);
	}
}

// Run main function if this file is executed directly
if (require.main === module) {
	main();
}