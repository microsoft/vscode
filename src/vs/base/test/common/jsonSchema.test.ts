/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getCompressedContent, IJSONSchema } from 'vs/base/common/jsonSchema';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('JSON Schema', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getCompressedContent 1', () => {

		const schema: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'object',
					description: 'a',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				},
				e: {
					type: 'object',
					description: 'e',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				}
			}
		};

		const expected: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'object',
					description: 'a',
					properties: {
						b: {
							$ref: '#/$defs/_0'
						}
					}
				},
				e: {
					type: 'object',
					description: 'e',
					properties: {
						b: {
							$ref: '#/$defs/_0'
						}
					}
				}
			},
			$defs: {
				"_0": {
					type: 'object',
					properties: {
						c: {
							type: 'object',
							properties: {
								d: {
									type: 'string'
								}
							}
						}
					}
				}
			}

		};

		assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
	});

	test('getCompressedContent 2', () => {

		const schema: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				},
				e: {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				}
			}
		};

		const expected: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					$ref: '#/$defs/_0'

				},
				e: {
					$ref: '#/$defs/_0'
				}
			},
			$defs: {
				"_0": {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				}
			}

		};

		assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
	});

	test('getCompressedContent 3', () => {


		const schema: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'object',
					oneOf: [
						{
							allOf: [
								{
									properties: {
										name: {
											type: 'string'
										},
										description: {
											type: 'string'
										}
									}
								},
								{
									properties: {
										street: {
											type: 'string'
										},
									}
								}
							]
						},
						{
							allOf: [
								{
									properties: {
										name: {
											type: 'string'
										},
										description: {
											type: 'string'
										}
									}
								},
								{
									properties: {
										river: {
											type: 'string'
										},
									}
								}
							]
						},
						{
							allOf: [
								{
									properties: {
										name: {
											type: 'string'
										},
										description: {
											type: 'string'
										}
									}
								},
								{
									properties: {
										mountain: {
											type: 'string'
										},
									}
								}
							]
						}
					]
				},
				b: {
					type: 'object',
					properties: {
						street: {
							properties: {
								street: {
									type: 'string'
								}
							}
						}
					}
				}
			}
		};

		const expected: IJSONSchema = {
			"type": "object",
			"properties": {
				"a": {
					"type": "object",
					"oneOf": [
						{
							"allOf": [
								{
									"$ref": "#/$defs/_0"
								},
								{
									"$ref": "#/$defs/_1"
								}
							]
						},
						{
							"allOf": [
								{
									"$ref": "#/$defs/_0"
								},
								{
									"properties": {
										"river": {
											"type": "string"
										}
									}
								}
							]
						},
						{
							"allOf": [
								{
									"$ref": "#/$defs/_0"
								},
								{
									"properties": {
										"mountain": {
											"type": "string"
										}
									}
								}
							]
						}
					]
				},
				"b": {
					"type": "object",
					"properties": {
						"street": {
							"$ref": "#/$defs/_1"
						}
					}
				}
			},
			"$defs": {
				"_0": {
					"properties": {
						"name": {
							"type": "string"
						},
						"description": {
							"type": "string"
						}
					}
				},
				"_1": {
					"properties": {
						"street": {
							"type": "string"
						}
					}
				}
			}
		};

		const actual = getCompressedContent(schema);
		assert.deepEqual(actual, JSON.stringify(expected));
	});

	test('getCompressedContent 4', () => {

		const schema: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				},
				e: {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				},
				f: {
					type: 'object',
					properties: {
						d: {
							type: 'string'
						}
					}
				}
			}
		};

		const expected: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					$ref: '#/$defs/_0'
				},
				e: {
					$ref: '#/$defs/_0'
				},
				f: {
					$ref: '#/$defs/_1'
				}
			},
			$defs: {
				"_0": {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									$ref: '#/$defs/_1'
								}
							}
						}
					}
				},
				"_1": {
					type: 'object',
					properties: {
						d: {
							type: 'string'
						}
					}
				}
			}

		};

		assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
	});

	test('getCompressedContent 5', () => {

		const schema: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							c: {
								type: 'object',
								properties: {
									d: {
										type: 'string'
									}
								}
							}
						}
					}
				},
				e: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							c: {
								type: 'object',
								properties: {
									d: {
										type: 'string'
									}
								}
							}
						}
					}
				},
				f: {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				},
				g: {
					type: 'object',
					properties: {
						b: {
							type: 'object',
							properties: {
								c: {
									type: 'object',
									properties: {
										d: {
											type: 'string'
										}
									}
								}
							}
						}
					}
				}
			}
		};

		const expected: IJSONSchema = {
			type: 'object',
			properties: {
				a: {
					$ref: '#/$defs/_0'
				},
				e: {
					$ref: '#/$defs/_0'
				},
				f: {
					$ref: '#/$defs/_1'
				},
				g: {
					$ref: '#/$defs/_1'
				}
			},
			$defs: {
				"_0": {
					type: 'array',
					items: {
						$ref: '#/$defs/_2'
					}
				},
				"_1": {
					type: 'object',
					properties: {
						b: {
							$ref: '#/$defs/_2'
						}
					}
				},
				"_2": {
					type: 'object',
					properties: {
						c: {
							type: 'object',
							properties: {
								d: {
									type: 'string'
								}
							}
						}
					}
				}
			}

		};

		assert.deepEqual(getCompressedContent(schema), JSON.stringify(expected));
	});


});
