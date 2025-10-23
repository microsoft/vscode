/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual, ok } from 'assert';
import { parse, ParseOptions, YamlParseError, Position, YamlNode } from '../../common/yaml.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';


function assertValidParse(input: string[], expected: YamlNode, expectedErrors: YamlParseError[], options?: ParseOptions): void {
	const errors: YamlParseError[] = [];
	const text = input.join('\n');
	const actual1 = parse(text, errors, options);
	deepStrictEqual(actual1, expected);
	deepStrictEqual(errors, expectedErrors);
}

function pos(line: number, character: number): Position {
	return { line, character };
}

suite('YAML Parser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('scalars', () => {

		test('numbers', () => {
			assertValidParse(['1'], { type: 'number', start: pos(0, 0), end: pos(0, 1), value: 1 }, []);
			assertValidParse(['1.234'], { type: 'number', start: pos(0, 0), end: pos(0, 5), value: 1.234 }, []);
			assertValidParse(['-42'], { type: 'number', start: pos(0, 0), end: pos(0, 3), value: -42 }, []);
		});

		test('boolean', () => {
			assertValidParse(['true'], { type: 'boolean', start: pos(0, 0), end: pos(0, 4), value: true }, []);
			assertValidParse(['false'], { type: 'boolean', start: pos(0, 0), end: pos(0, 5), value: false }, []);
		});

		test('null', () => {
			assertValidParse(['null'], { type: 'null', start: pos(0, 0), end: pos(0, 4), value: null }, []);
			assertValidParse(['~'], { type: 'null', start: pos(0, 0), end: pos(0, 1), value: null }, []);
		});

		test('string', () => {
			assertValidParse(['A Developer'], { type: 'string', start: pos(0, 0), end: pos(0, 11), value: 'A Developer' }, []);
			assertValidParse(['\'A Developer\''], { type: 'string', start: pos(0, 0), end: pos(0, 13), value: 'A Developer' }, []);
			assertValidParse(['"A Developer"'], { type: 'string', start: pos(0, 0), end: pos(0, 13), value: 'A Developer' }, []);
			assertValidParse(['*.js,*.ts'], { type: 'string', start: pos(0, 0), end: pos(0, 9), value: '*.js,*.ts' }, []);
		});
	});

	suite('objects', () => {

		test('simple properties', () => {
			assertValidParse(['name: John Doe'], {
				type: 'object', start: pos(0, 0), end: pos(0, 14), properties: [
					{
						key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'name' },
						value: { type: 'string', start: pos(0, 6), end: pos(0, 14), value: 'John Doe' }
					}
				]
			}, []);
			assertValidParse(['age: 30'], {
				type: 'object', start: pos(0, 0), end: pos(0, 7), properties: [
					{
						key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'age' },
						value: { type: 'number', start: pos(0, 5), end: pos(0, 7), value: 30 }
					}
				]
			}, []);
			assertValidParse(['active: true'], {
				type: 'object', start: pos(0, 0), end: pos(0, 12), properties: [
					{
						key: { type: 'string', start: pos(0, 0), end: pos(0, 6), value: 'active' },
						value: { type: 'boolean', start: pos(0, 8), end: pos(0, 12), value: true }
					}
				]
			}, []);
			assertValidParse(['value: null'], {
				type: 'object', start: pos(0, 0), end: pos(0, 11), properties: [
					{
						key: { type: 'string', start: pos(0, 0), end: pos(0, 5), value: 'value' },
						value: { type: 'null', start: pos(0, 7), end: pos(0, 11), value: null }
					}
				]
			}, []);
		});

		test('value on next line', () => {
			assertValidParse(
				[
					'name:',
					'  John Doe',
					'colors:',
					'  [ Red, Green, Blue ]',
				],
				{
					type: 'object', start: pos(0, 0), end: pos(3, 22), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'name' },
							value: { type: 'string', start: pos(1, 2), end: pos(1, 10), value: 'John Doe' }
						},
						{
							key: { type: 'string', start: pos(2, 0), end: pos(2, 6), value: 'colors' },
							value: {
								type: 'array', start: pos(3, 2), end: pos(3, 22), items: [
									{ type: 'string', start: pos(3, 4), end: pos(3, 7), value: 'Red' },
									{ type: 'string', start: pos(3, 9), end: pos(3, 14), value: 'Green' },
									{ type: 'string', start: pos(3, 16), end: pos(3, 20), value: 'Blue' }
								]
							}
						}
					]
				},
				[]
			);
		});

		test('multiple properties', () => {
			assertValidParse(
				[
					'name: John Doe',
					'age: 30'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 7), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'name' },
							value: { type: 'string', start: pos(0, 6), end: pos(0, 14), value: 'John Doe' }
						},
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 3), value: 'age' },
							value: { type: 'number', start: pos(1, 5), end: pos(1, 7), value: 30 }
						}
					]
				},
				[]
			);
		});

		test('nested object', () => {
			assertValidParse(
				[
					'person:',
					'  name: John Doe',
					'  age: 30'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(2, 9), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 6), value: 'person' },
							value: {
								type: 'object', start: pos(1, 2), end: pos(2, 9), properties: [
									{
										key: { type: 'string', start: pos(1, 2), end: pos(1, 6), value: 'name' },
										value: { type: 'string', start: pos(1, 8), end: pos(1, 16), value: 'John Doe' }
									},
									{
										key: { type: 'string', start: pos(2, 2), end: pos(2, 5), value: 'age' },
										value: { type: 'number', start: pos(2, 7), end: pos(2, 9), value: 30 }
									}
								]
							}
						}
					]

				},
				[]
			);
		});


		test('nested objects with address', () => {
			assertValidParse(
				[
					'person:',
					'  name: John Doe',
					'  age: 30',
					'  address:',
					'    street: 123 Main St',
					'    city: Example City'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(5, 22), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 6), value: 'person' },
							value: {
								type: 'object', start: pos(1, 2), end: pos(5, 22),
								properties: [
									{
										key: { type: 'string', start: pos(1, 2), end: pos(1, 6), value: 'name' },
										value: { type: 'string', start: pos(1, 8), end: pos(1, 16), value: 'John Doe' }
									},
									{
										key: { type: 'string', start: pos(2, 2), end: pos(2, 5), value: 'age' },
										value: { type: 'number', start: pos(2, 7), end: pos(2, 9), value: 30 }
									},
									{
										key: { type: 'string', start: pos(3, 2), end: pos(3, 9), value: 'address' },
										value: {
											type: 'object', start: pos(4, 4), end: pos(5, 22), properties: [
												{
													key: { type: 'string', start: pos(4, 4), end: pos(4, 10), value: 'street' },
													value: { type: 'string', start: pos(4, 12), end: pos(4, 23), value: '123 Main St' }
												},
												{
													key: { type: 'string', start: pos(5, 4), end: pos(5, 8), value: 'city' },
													value: { type: 'string', start: pos(5, 10), end: pos(5, 22), value: 'Example City' }
												}
											]
										}
									}
								]
							}
						}
					]
				},
				[]
			);
		});

		test('properties without space after colon', () => {
			assertValidParse(
				['name:John'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 9), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'name' },
							value: { type: 'string', start: pos(0, 5), end: pos(0, 9), value: 'John' }
						}
					]
				},
				[]
			);

			// Test mixed: some properties with space, some without
			assertValidParse(
				[
					'config:',
					'  database:',
					'    host:localhost',
					'    port: 5432',
					'    credentials:',
					'      username:admin',
					'      password: secret123'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(6, 25), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 6), value: 'config' },
							value: {
								type: 'object', start: pos(1, 2), end: pos(6, 25), properties: [
									{
										key: { type: 'string', start: pos(1, 2), end: pos(1, 10), value: 'database' },
										value: {
											type: 'object', start: pos(2, 4), end: pos(6, 25), properties: [
												{
													key: { type: 'string', start: pos(2, 4), end: pos(2, 8), value: 'host' },
													value: { type: 'string', start: pos(2, 9), end: pos(2, 18), value: 'localhost' }
												},
												{
													key: { type: 'string', start: pos(3, 4), end: pos(3, 8), value: 'port' },
													value: { type: 'number', start: pos(3, 10), end: pos(3, 14), value: 5432 }
												},
												{
													key: { type: 'string', start: pos(4, 4), end: pos(4, 15), value: 'credentials' },
													value: {
														type: 'object', start: pos(5, 6), end: pos(6, 25), properties: [
															{
																key: { type: 'string', start: pos(5, 6), end: pos(5, 14), value: 'username' },
																value: { type: 'string', start: pos(5, 15), end: pos(5, 20), value: 'admin' }
															},
															{
																key: { type: 'string', start: pos(6, 6), end: pos(6, 14), value: 'password' },
																value: { type: 'string', start: pos(6, 16), end: pos(6, 25), value: 'secret123' }
															}
														]
													}
												}
											]
										}
									}
								]
							}
						}
					]
				},
				[]
			);
		});

		test('inline objects', () => {
			assertValidParse(
				['{name: John, age: 30}'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 21), properties: [
						{
							key: { type: 'string', start: pos(0, 1), end: pos(0, 5), value: 'name' },
							value: { type: 'string', start: pos(0, 7), end: pos(0, 11), value: 'John' }
						},
						{
							key: { type: 'string', start: pos(0, 13), end: pos(0, 16), value: 'age' },
							value: { type: 'number', start: pos(0, 18), end: pos(0, 20), value: 30 }
						}
					]
				},
				[]
			);

			// Test with different data types
			assertValidParse(
				['{active: true, score: 85.5, role: null}'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 39), properties: [
						{
							key: { type: 'string', start: pos(0, 1), end: pos(0, 7), value: 'active' },
							value: { type: 'boolean', start: pos(0, 9), end: pos(0, 13), value: true }
						},
						{
							key: { type: 'string', start: pos(0, 15), end: pos(0, 20), value: 'score' },
							value: { type: 'number', start: pos(0, 22), end: pos(0, 26), value: 85.5 }
						},
						{
							key: { type: 'string', start: pos(0, 28), end: pos(0, 32), value: 'role' },
							value: { type: 'null', start: pos(0, 34), end: pos(0, 38), value: null }
						}
					]
				},
				[]
			);

			// Test empty inline object
			assertValidParse(
				['{}'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 2), properties: []
				},
				[]
			);

			// Test inline object with quoted keys and values
			assertValidParse(
				['{"name": "John Doe", "age": 30}'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 31), properties: [
						{
							key: { type: 'string', start: pos(0, 1), end: pos(0, 7), value: 'name' },
							value: { type: 'string', start: pos(0, 9), end: pos(0, 19), value: 'John Doe' }
						},
						{
							key: { type: 'string', start: pos(0, 21), end: pos(0, 26), value: 'age' },
							value: { type: 'number', start: pos(0, 28), end: pos(0, 30), value: 30 }
						}
					]
				},
				[]
			);

			// Test inline object without spaces
			assertValidParse(
				['{name:John,age:30}'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 18), properties: [
						{
							key: { type: 'string', start: pos(0, 1), end: pos(0, 5), value: 'name' },
							value: { type: 'string', start: pos(0, 6), end: pos(0, 10), value: 'John' }
						},
						{
							key: { type: 'string', start: pos(0, 11), end: pos(0, 14), value: 'age' },
							value: { type: 'number', start: pos(0, 15), end: pos(0, 17), value: 30 }
						}
					]
				},
				[]
			);

			// Test multi-line inline object with internal comment line between properties
			assertValidParse(
				['{a:1, # comment about b', ' b:2, c:3}'],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 10), properties: [
						{
							key: { type: 'string', start: pos(0, 1), end: pos(0, 2), value: 'a' },
							value: { type: 'number', start: pos(0, 3), end: pos(0, 4), value: 1 }
						},
						{
							key: { type: 'string', start: pos(1, 1), end: pos(1, 2), value: 'b' },
							value: { type: 'number', start: pos(1, 3), end: pos(1, 4), value: 2 }
						},
						{
							key: { type: 'string', start: pos(1, 6), end: pos(1, 7), value: 'c' },
							value: { type: 'number', start: pos(1, 8), end: pos(1, 9), value: 3 }
						}
					]
				},
				[]
			);
		});

		test('special characters in values', () => {
			// Test values with special characters
			assertValidParse(
				[`key: value with \t special chars`],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 31), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'key' },
							value: { type: 'string', start: pos(0, 5), end: pos(0, 31), value: `value with \t special chars` }
						}
					]
				},
				[]
			);
		});

		test('various whitespace types', () => {
			// Test different types of whitespace
			assertValidParse(
				[`key:\t \t \t value`],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 15), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'key' },
							value: { type: 'string', start: pos(0, 10), end: pos(0, 15), value: 'value' }
						}
					]
				},
				[]
			);
		});
	});

	suite('arrays', () => {


		test('arrays', () => {
			assertValidParse(
				[
					'- Boston Red Sox',
					'- Detroit Tigers',
					'- New York Yankees'
				],
				{
					type: 'array', start: pos(0, 0), end: pos(2, 18), items: [
						{ type: 'string', start: pos(0, 2), end: pos(0, 16), value: 'Boston Red Sox' },
						{ type: 'string', start: pos(1, 2), end: pos(1, 16), value: 'Detroit Tigers' },
						{ type: 'string', start: pos(2, 2), end: pos(2, 18), value: 'New York Yankees' }
					]

				},
				[]
			);
		});


		test('inline arrays', () => {
			assertValidParse(
				['[Apple, Banana, Cherry]'],
				{
					type: 'array', start: pos(0, 0), end: pos(0, 23), items: [
						{ type: 'string', start: pos(0, 1), end: pos(0, 6), value: 'Apple' },
						{ type: 'string', start: pos(0, 8), end: pos(0, 14), value: 'Banana' },
						{ type: 'string', start: pos(0, 16), end: pos(0, 22), value: 'Cherry' }
					]

				},
				[]
			);
		});

		test('inline array with internal comment line', () => {
			assertValidParse(
				['[one # comment about two', ',two, three]'],
				{
					type: 'array', start: pos(0, 0), end: pos(1, 12), items: [
						{ type: 'string', start: pos(0, 1), end: pos(0, 4), value: 'one' },
						{ type: 'string', start: pos(1, 1), end: pos(1, 4), value: 'two' },
						{ type: 'string', start: pos(1, 6), end: pos(1, 11), value: 'three' }
					]
				},
				[]
			);
		});

		test('multi-line inline arrays', () => {
			assertValidParse(
				[
					'[',
					'    geen, ',
					'    yello, red]'
				],
				{
					type: 'array', start: pos(0, 0), end: pos(2, 15), items: [
						{ type: 'string', start: pos(1, 4), end: pos(1, 8), value: 'geen' },
						{ type: 'string', start: pos(2, 4), end: pos(2, 9), value: 'yello' },
						{ type: 'string', start: pos(2, 11), end: pos(2, 14), value: 'red' }
					]
				},
				[]
			);
		});

		test('arrays of arrays', () => {
			assertValidParse(
				[
					'-',
					'  - Apple',
					'  - Banana',
					'  - Cherry'
				],
				{
					type: 'array', start: pos(0, 0), end: pos(3, 10), items: [
						{
							type: 'array', start: pos(1, 2), end: pos(3, 10), items: [
								{ type: 'string', start: pos(1, 4), end: pos(1, 9), value: 'Apple' },
								{ type: 'string', start: pos(2, 4), end: pos(2, 10), value: 'Banana' },
								{ type: 'string', start: pos(3, 4), end: pos(3, 10), value: 'Cherry' }
							]
						}
					]
				},
				[]
			);
		});

		test('inline arrays of inline arrays', () => {
			assertValidParse(
				[
					'[',
					'  [ee], [ff, gg]',
					']',
				],
				{
					type: 'array', start: pos(0, 0), end: pos(2, 1), items: [
						{
							type: 'array', start: pos(1, 2), end: pos(1, 6), items: [
								{ type: 'string', start: pos(1, 3), end: pos(1, 5), value: 'ee' },
							],
						},
						{
							type: 'array', start: pos(1, 8), end: pos(1, 16), items: [
								{ type: 'string', start: pos(1, 9), end: pos(1, 11), value: 'ff' },
								{ type: 'string', start: pos(1, 13), end: pos(1, 15), value: 'gg' },
							],
						}
					]
				},
				[]
			);
		});

		test('object with array containing single object', () => {
			assertValidParse(
				[
					'items:',
					'- name: John',
					'  age: 30'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(2, 9), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 5), value: 'items' },
							value: {
								type: 'array', start: pos(1, 0), end: pos(2, 9), items: [
									{
										type: 'object', start: pos(1, 2), end: pos(2, 9), properties: [
											{
												key: { type: 'string', start: pos(1, 2), end: pos(1, 6), value: 'name' },
												value: { type: 'string', start: pos(1, 8), end: pos(1, 12), value: 'John' }
											},
											{
												key: { type: 'string', start: pos(2, 2), end: pos(2, 5), value: 'age' },
												value: { type: 'number', start: pos(2, 7), end: pos(2, 9), value: 30 }
											}
										]
									}
								]
							}
						}
					]
				},
				[]
			);
		});

		test('arrays of objects', () => {
			assertValidParse(
				[
					'-',
					'  name: one',
					'- name: two',
					'-',
					'  name: three'
				],
				{
					type: 'array', start: pos(0, 0), end: pos(4, 13), items: [
						{
							type: 'object', start: pos(1, 2), end: pos(1, 11), properties: [
								{
									key: { type: 'string', start: pos(1, 2), end: pos(1, 6), value: 'name' },
									value: { type: 'string', start: pos(1, 8), end: pos(1, 11), value: 'one' }
								}
							]
						},
						{
							type: 'object', start: pos(2, 2), end: pos(2, 11), properties: [
								{
									key: { type: 'string', start: pos(2, 2), end: pos(2, 6), value: 'name' },
									value: { type: 'string', start: pos(2, 8), end: pos(2, 11), value: 'two' }
								}
							]
						},
						{
							type: 'object', start: pos(4, 2), end: pos(4, 13), properties: [
								{
									key: { type: 'string', start: pos(4, 2), end: pos(4, 6), value: 'name' },
									value: { type: 'string', start: pos(4, 8), end: pos(4, 13), value: 'three' }
								}
							]
						}
					]
				},
				[]
			);
		});
	});

	suite('complex structures', () => {

		test('array of objects', () => {
			assertValidParse(
				[
					'products:',
					'  - name: Laptop',
					'    price: 999.99',
					'    in_stock: true',
					'  - name: Mouse',
					'    price: 25.50',
					'    in_stock: false'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(6, 19), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 8), value: 'products' },
							value: {
								type: 'array', start: pos(1, 2), end: pos(6, 19), items: [
									{
										type: 'object', start: pos(1, 4), end: pos(3, 18), properties: [
											{
												key: { type: 'string', start: pos(1, 4), end: pos(1, 8), value: 'name' },
												value: { type: 'string', start: pos(1, 10), end: pos(1, 16), value: 'Laptop' }
											},
											{
												key: { type: 'string', start: pos(2, 4), end: pos(2, 9), value: 'price' },
												value: { type: 'number', start: pos(2, 11), end: pos(2, 17), value: 999.99 }
											},
											{
												key: { type: 'string', start: pos(3, 4), end: pos(3, 12), value: 'in_stock' },
												value: { type: 'boolean', start: pos(3, 14), end: pos(3, 18), value: true }
											}
										]
									},
									{
										type: 'object', start: pos(4, 4), end: pos(6, 19), properties: [
											{
												key: { type: 'string', start: pos(4, 4), end: pos(4, 8), value: 'name' },
												value: { type: 'string', start: pos(4, 10), end: pos(4, 15), value: 'Mouse' }
											},
											{
												key: { type: 'string', start: pos(5, 4), end: pos(5, 9), value: 'price' },
												value: { type: 'number', start: pos(5, 11), end: pos(5, 16), value: 25.50 }
											},
											{
												key: { type: 'string', start: pos(6, 4), end: pos(6, 12), value: 'in_stock' },
												value: { type: 'boolean', start: pos(6, 14), end: pos(6, 19), value: false }
											}
										]
									}
								]
							}
						}
					]
				},
				[]
			);
		});

		test('inline array mixed primitives', () => {
			assertValidParse(
				['vals: [1, true, null, "str"]'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 28), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'vals' },
							value: {
								type: 'array', start: pos(0, 6), end: pos(0, 28), items: [
									{ type: 'number', start: pos(0, 7), end: pos(0, 8), value: 1 },
									{ type: 'boolean', start: pos(0, 10), end: pos(0, 14), value: true },
									{ type: 'null', start: pos(0, 16), end: pos(0, 20), value: null },
									{ type: 'string', start: pos(0, 22), end: pos(0, 27), value: 'str' }
								]
							}
						}
					]
				},
				[]
			);
		});

		test('mixed inline structures', () => {
			assertValidParse(
				['config: {env: "prod", settings: [true, 42], debug: false}'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 57), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 6), value: 'config' },
							value: {
								type: 'object', start: pos(0, 8), end: pos(0, 57), properties: [
									{
										key: { type: 'string', start: pos(0, 9), end: pos(0, 12), value: 'env' },
										value: { type: 'string', start: pos(0, 14), end: pos(0, 20), value: 'prod' }
									},
									{
										key: { type: 'string', start: pos(0, 22), end: pos(0, 30), value: 'settings' },
										value: {
											type: 'array', start: pos(0, 32), end: pos(0, 42), items: [
												{ type: 'boolean', start: pos(0, 33), end: pos(0, 37), value: true },
												{ type: 'number', start: pos(0, 39), end: pos(0, 41), value: 42 }
											]
										}
									},
									{
										key: { type: 'string', start: pos(0, 44), end: pos(0, 49), value: 'debug' },
										value: { type: 'boolean', start: pos(0, 51), end: pos(0, 56), value: false }
									}
								]
							}
						}
					]
				},
				[]
			);
		});

		test('with comments', () => {
			assertValidParse(
				[
					`# This is a comment`,
					'name: John Doe  # inline comment',
					'age: 30'
				],
				{
					type: 'object', start: pos(1, 0), end: pos(2, 7), properties: [
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 4), value: 'name' },
							value: { type: 'string', start: pos(1, 6), end: pos(1, 14), value: 'John Doe' }
						},
						{
							key: { type: 'string', start: pos(2, 0), end: pos(2, 3), value: 'age' },
							value: { type: 'number', start: pos(2, 5), end: pos(2, 7), value: 30 }
						}
					]
				},
				[]
			);
		});
	});

	suite('edge cases and error handling', () => {


		// Edge cases
		test('duplicate keys error', () => {
			assertValidParse(
				[
					'key: 1',
					'key: 2'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 6), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'key' },
							value: { type: 'number', start: pos(0, 5), end: pos(0, 6), value: 1 }
						},
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 3), value: 'key' },
							value: { type: 'number', start: pos(1, 5), end: pos(1, 6), value: 2 }
						}
					]
				},
				[
					{
						message: 'Duplicate key \'key\'',
						code: 'duplicateKey',
						start: pos(1, 0),
						end: pos(1, 3)
					}
				]
			);
		});

		test('duplicate keys allowed with option', () => {
			assertValidParse(
				[
					'key: 1',
					'key: 2'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 6), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'key' },
							value: { type: 'number', start: pos(0, 5), end: pos(0, 6), value: 1 }
						},
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 3), value: 'key' },
							value: { type: 'number', start: pos(1, 5), end: pos(1, 6), value: 2 }
						}
					]
				},
				[],
				{ allowDuplicateKeys: true }
			);
		});

		test('unexpected indentation error with recovery', () => {
			// Parser reports error but still captures the over-indented property.
			assertValidParse(
				[
					'key: 1',
					'    stray: value'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 16), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'key' },
							value: { type: 'number', start: pos(0, 5), end: pos(0, 6), value: 1 }
						},
						{
							key: { type: 'string', start: pos(1, 4), end: pos(1, 9), value: 'stray' },
							value: { type: 'string', start: pos(1, 11), end: pos(1, 16), value: 'value' }
						}
					]
				},
				[
					{
						message: 'Unexpected indentation',
						code: 'indentation',
						start: pos(1, 0),
						end: pos(1, 16)
					}
				]
			);
		});

		test('empty values and inline empty array', () => {
			assertValidParse(
				[
					'empty:',
					'array: []'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 9), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 5), value: 'empty' },
							value: { type: 'string', start: pos(0, 6), end: pos(0, 6), value: '' }
						},
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 5), value: 'array' },
							value: { type: 'array', start: pos(1, 7), end: pos(1, 9), items: [] }
						}
					]
				},
				[]
			);
		});



		test('nested empty objects', () => {
			// Parser should create nodes for both parent and child, with child having empty string value.
			assertValidParse(
				[
					'parent:',
					'  child:'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 8), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 6), value: 'parent' },
							value: {
								type: 'object', start: pos(1, 2), end: pos(1, 8), properties: [
									{
										key: { type: 'string', start: pos(1, 2), end: pos(1, 7), value: 'child' },
										value: { type: 'string', start: pos(1, 8), end: pos(1, 8), value: '' }
									}
								]
							}
						}
					]
				},
				[]
			);
		});

		test('empty object with only colons', () => {
			// Test object with empty values
			assertValidParse(
				['key1:', 'key2:', 'key3:'],
				{
					type: 'object', start: pos(0, 0), end: pos(2, 5), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'key1' },
							value: { type: 'string', start: pos(0, 5), end: pos(0, 5), value: '' }
						},
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 4), value: 'key2' },
							value: { type: 'string', start: pos(1, 5), end: pos(1, 5), value: '' }
						},
						{
							key: { type: 'string', start: pos(2, 0), end: pos(2, 4), value: 'key3' },
							value: { type: 'string', start: pos(2, 5), end: pos(2, 5), value: '' }
						}
					]
				},
				[]
			);
		});

		test('large input performance', () => {
			// Test that large inputs are handled efficiently
			const input = Array.from({ length: 1000 }, (_, i) => `key${i}: value${i}`);
			const expectedProperties = Array.from({ length: 1000 }, (_, i) => ({
				key: { type: 'string' as const, start: pos(i, 0), end: pos(i, `key${i}`.length), value: `key${i}` },
				value: { type: 'string' as const, start: pos(i, `key${i}: `.length), end: pos(i, `key${i}: value${i}`.length), value: `value${i}` }
			}));

			const start = Date.now();
			assertValidParse(
				input,
				{
					type: 'object',
					start: pos(0, 0),
					end: pos(999, 'key999: value999'.length),
					properties: expectedProperties
				},
				[]
			);
			const duration = Date.now() - start;

			ok(duration < 100, `Parsing took ${duration}ms, expected < 100ms`);
		});

		test('deeply nested structure performance', () => {
			// Test that deeply nested structures are handled efficiently
			const lines = [];
			for (let i = 0; i < 50; i++) {
				const indent = '  '.repeat(i);
				lines.push(`${indent}level${i}:`);
			}
			lines.push('  '.repeat(50) + 'deepValue: reached');

			const start = Date.now();
			const errors: YamlParseError[] = [];
			const result = parse(lines.join('\n'), errors);
			const duration = Date.now() - start;

			ok(result);
			strictEqual(result.type, 'object');
			strictEqual(errors.length, 0);
			ok(duration < 100, `Parsing took ${duration}ms, expected < 100ms`);
		});

		test('malformed array with position issues', () => {
			// Test malformed arrays that might cause position advancement issues
			assertValidParse(
				[
					'key: [',
					'',
					'',
					'',
					''
				],
				{
					type: 'object', start: pos(0, 0), end: pos(5, 0), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'key' },
							value: { type: 'array', start: pos(0, 5), end: pos(5, 0), items: [] }
						}
					]
				},
				[]
			);
		});

		test('self-referential like structure', () => {
			// Test structures that might appear self-referential
			assertValidParse(
				[
					'a:',
					'  b:',
					'    a:',
					'      b:',
					'        value: test'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(4, 19), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 1), value: 'a' },
							value: {
								type: 'object', start: pos(1, 2), end: pos(4, 19), properties: [
									{
										key: { type: 'string', start: pos(1, 2), end: pos(1, 3), value: 'b' },
										value: {
											type: 'object', start: pos(2, 4), end: pos(4, 19), properties: [
												{
													key: { type: 'string', start: pos(2, 4), end: pos(2, 5), value: 'a' },
													value: {
														type: 'object', start: pos(3, 6), end: pos(4, 19), properties: [
															{
																key: { type: 'string', start: pos(3, 6), end: pos(3, 7), value: 'b' },
																value: {
																	type: 'object', start: pos(4, 8), end: pos(4, 19), properties: [
																		{
																			key: { type: 'string', start: pos(4, 8), end: pos(4, 13), value: 'value' },
																			value: { type: 'string', start: pos(4, 15), end: pos(4, 19), value: 'test' }
																		}
																	]
																}
															}
														]
													}
												}
											]
										}
									}
								]
							}
						}
					]
				},
				[]
			);
		});

		test('array with empty lines', () => {
			// Test arrays spanning multiple lines with empty lines
			assertValidParse(
				['arr: [', '', 'item1,', '', 'item2', '', ']'],
				{
					type: 'object', start: pos(0, 0), end: pos(6, 1), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'arr' },
							value: {
								type: 'array', start: pos(0, 5), end: pos(6, 1), items: [
									{ type: 'string', start: pos(2, 0), end: pos(2, 5), value: 'item1' },
									{ type: 'string', start: pos(4, 0), end: pos(4, 5), value: 'item2' }
								]
							}
						}
					]
				},
				[]
			);
		});

		test('whitespace advancement robustness', () => {
			// Test that whitespace advancement works correctly
			assertValidParse(
				[`key:      value`],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 15), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 3), value: 'key' },
							value: { type: 'string', start: pos(0, 10), end: pos(0, 15), value: 'value' }
						}
					]
				},
				[]
			);
		});


		test('missing end quote in string values', () => {
			// Test unclosed double quote - parser treats it as bare string with quote included
			assertValidParse(
				['name: "John'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 11), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'name' },
							value: { type: 'string', start: pos(0, 6), end: pos(0, 11), value: 'John' }
						}
					]
				},
				[]
			);

			// Test unclosed single quote - parser treats it as bare string with quote included
			assertValidParse(
				['description: \'Hello world'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 25), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 11), value: 'description' },
							value: { type: 'string', start: pos(0, 13), end: pos(0, 25), value: 'Hello world' }
						}
					]
				},
				[]
			);

			// Test unclosed quote in multi-line context
			assertValidParse(
				[
					'data: "incomplete',
					'next: value'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(1, 11), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'data' },
							value: { type: 'string', start: pos(0, 6), end: pos(0, 17), value: 'incomplete' }
						},
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 4), value: 'next' },
							value: { type: 'string', start: pos(1, 6), end: pos(1, 11), value: 'value' }
						}
					]
				},
				[]
			);

			// Test properly quoted strings for comparison
			assertValidParse(
				['name: "John"'],
				{
					type: 'object', start: pos(0, 0), end: pos(0, 12), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'name' },
							value: { type: 'string', start: pos(0, 6), end: pos(0, 12), value: 'John' }
						}
					]
				},
				[]
			);
		});

		test('comment in inline array #269078', () => {
			// Test malformed array with comment-like content - should not cause endless loop
			assertValidParse(
				[
					'mode: agent',
					'tools: [#r'
				],
				{
					type: 'object', start: pos(0, 0), end: pos(2, 0), properties: [
						{
							key: { type: 'string', start: pos(0, 0), end: pos(0, 4), value: 'mode' },
							value: { type: 'string', start: pos(0, 6), end: pos(0, 11), value: 'agent' }
						},
						{
							key: { type: 'string', start: pos(1, 0), end: pos(1, 5), value: 'tools' },
							value: { type: 'array', start: pos(1, 7), end: pos(2, 0), items: [] }
						}
					]
				},
				[]
			);
		});


	});

});
