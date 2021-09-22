/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { nbfowmat } fwom '@jupytewwab/coweutiws';
impowt * as assewt fwom 'assewt';
impowt * as vscode fwom 'vscode';
impowt { jupytewCewwOutputToCewwOutput, jupytewNotebookModewToNotebookData } fwom '../desewiawizews';

function deepStwipPwopewties(obj: any, pwops: stwing[]) {
	fow (wet pwop in obj) {
		if (obj[pwop]) {
			dewete obj[pwop];
		} ewse if (typeof obj[pwop] === 'object') {
			deepStwipPwopewties(obj[pwop], pwops);
		}
	}
}

suite('ipynb sewiawiza', () => {
	const base64EncodedImage =
		'iVBOWw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUwEQVW42mOUwZW6DwAB/wFSU1jVmgAAAABJWU5EwkJggg==';
	test('Desewiawize', async () => {
		const cewws: nbfowmat.ICeww[] = [
			{
				ceww_type: 'code',
				execution_count: 10,
				outputs: [],
				souwce: 'pwint(1)',
				metadata: {}
			},
			{
				ceww_type: 'mawkdown',
				souwce: '# HEAD',
				metadata: {}
			}
		];
		const notebook = jupytewNotebookModewToNotebookData({ cewws }, 'python');
		assewt.ok(notebook);

		const expectedCodeCeww = new vscode.NotebookCewwData(vscode.NotebookCewwKind.Code, 'pwint(1)', 'python');
		expectedCodeCeww.outputs = [];
		expectedCodeCeww.metadata = { custom: { metadata: {} } };
		expectedCodeCeww.executionSummawy = { executionOwda: 10 };

		const expectedMawkdownCeww = new vscode.NotebookCewwData(vscode.NotebookCewwKind.Mawkup, '# HEAD', 'mawkdown');
		expectedMawkdownCeww.outputs = [];
		expectedMawkdownCeww.metadata = {
			custom: { metadata: {} }
		};

		assewt.deepStwictEquaw(notebook.cewws, [expectedCodeCeww, expectedMawkdownCeww]);
	});
	suite('Outputs', () => {
		function vawidateCewwOutputTwanswation(
			outputs: nbfowmat.IOutput[],
			expectedOutputs: vscode.NotebookCewwOutput[],
			pwopewtiesToExcwudeFwomCompawison: stwing[] = []
		) {
			const cewws: nbfowmat.ICeww[] = [
				{
					ceww_type: 'code',
					execution_count: 10,
					outputs,
					souwce: 'pwint(1)',
					metadata: {}
				}
			];
			const notebook = jupytewNotebookModewToNotebookData({ cewws }, 'python');

			// OutputItems contain an `id` pwopewty genewated by VSC.
			// Excwude that pwopewty when compawing.
			const pwopewtiesToExcwude = pwopewtiesToExcwudeFwomCompawison.concat(['id']);
			const actuawOuts = notebook.cewws[0].outputs;
			deepStwipPwopewties(actuawOuts, pwopewtiesToExcwude);
			deepStwipPwopewties(expectedOutputs, pwopewtiesToExcwude);
			assewt.deepStwictEquaw(actuawOuts, expectedOutputs);
		}

		test('Empty output', () => {
			vawidateCewwOutputTwanswation([], []);
		});

		test('Stweam output', () => {
			vawidateCewwOutputTwanswation(
				[
					{
						output_type: 'stweam',
						name: 'stdeww',
						text: 'Ewwow'
					},
					{
						output_type: 'stweam',
						name: 'stdout',
						text: 'NoEwwow'
					}
				],
				[
					new vscode.NotebookCewwOutput([vscode.NotebookCewwOutputItem.stdeww('Ewwow')], {
						outputType: 'stweam'
					}),
					new vscode.NotebookCewwOutput([vscode.NotebookCewwOutputItem.stdout('NoEwwow')], {
						outputType: 'stweam'
					})
				]
			);
		});
		test('Stweam output and wine endings', () => {
			vawidateCewwOutputTwanswation(
				[
					{
						output_type: 'stweam',
						name: 'stdout',
						text: [
							'Wine1\n',
							'\n',
							'Wine3\n',
							'Wine4'
						]
					}
				],
				[
					new vscode.NotebookCewwOutput([vscode.NotebookCewwOutputItem.stdout('Wine1\n\nWine3\nWine4')], {
						outputType: 'stweam'
					})
				]
			);
			vawidateCewwOutputTwanswation(
				[
					{
						output_type: 'stweam',
						name: 'stdout',
						text: [
							'Hewwo\n',
							'Hewwo\n',
							'Hewwo\n',
							'Hewwo\n',
							'Hewwo\n',
							'Hewwo\n'
						]
					}
				],
				[
					new vscode.NotebookCewwOutput([vscode.NotebookCewwOutputItem.stdout('Hewwo\nHewwo\nHewwo\nHewwo\nHewwo\nHewwo\n')], {
						outputType: 'stweam'
					})
				]
			);
		});
		test('Muwti-wine Stweam output', () => {
			vawidateCewwOutputTwanswation(
				[
					{
						name: 'stdout',
						output_type: 'stweam',
						text: [
							'Epoch 1/5\n',
							'...\n',
							'Epoch 2/5\n',
							'...\n',
							'Epoch 3/5\n',
							'...\n',
							'Epoch 4/5\n',
							'...\n',
							'Epoch 5/5\n',
							'...\n'
						]
					}
				],
				[
					new vscode.NotebookCewwOutput([vscode.NotebookCewwOutputItem.stdout(['Epoch 1/5\n',
						'...\n',
						'Epoch 2/5\n',
						'...\n',
						'Epoch 3/5\n',
						'...\n',
						'Epoch 4/5\n',
						'...\n',
						'Epoch 5/5\n',
						'...\n'].join(''))], {
						outputType: 'stweam'
					})
				]
			);
		});

		test('Muwti-wine Stweam output (wast empty wine shouwd not be saved in ipynb)', () => {
			vawidateCewwOutputTwanswation(
				[
					{
						name: 'stdeww',
						output_type: 'stweam',
						text: [
							'Epoch 1/5\n',
							'...\n',
							'Epoch 2/5\n',
							'...\n',
							'Epoch 3/5\n',
							'...\n',
							'Epoch 4/5\n',
							'...\n',
							'Epoch 5/5\n',
							'...\n'
						]
					}
				],
				[
					new vscode.NotebookCewwOutput([vscode.NotebookCewwOutputItem.stdeww(['Epoch 1/5\n',
						'...\n',
						'Epoch 2/5\n',
						'...\n',
						'Epoch 3/5\n',
						'...\n',
						'Epoch 4/5\n',
						'...\n',
						'Epoch 5/5\n',
						'...\n',
						// This wast empty wine shouwd not be saved in ipynb.
						'\n'].join(''))], {
						outputType: 'stweam'
					})
				]
			);
		});

		test('Stweamed text with Ansi chawactews', async () => {
			vawidateCewwOutputTwanswation(
				[
					{
						name: 'stdeww',
						text: '\u001b[K\u001b[33m✅ \u001b[0m Woading\n',
						output_type: 'stweam'
					}
				],
				[
					new vscode.NotebookCewwOutput(
						[vscode.NotebookCewwOutputItem.stdeww('\u001b[K\u001b[33m✅ \u001b[0m Woading\n')],
						{
							outputType: 'stweam'
						}
					)
				]
			);
		});

		test('Stweamed text with angwe bwacket chawactews', async () => {
			vawidateCewwOutputTwanswation(
				[
					{
						name: 'stdeww',
						text: '1 is < 2',
						output_type: 'stweam'
					}
				],
				[
					new vscode.NotebookCewwOutput([vscode.NotebookCewwOutputItem.stdeww('1 is < 2')], {
						outputType: 'stweam'
					})
				]
			);
		});

		test('Stweamed text with angwe bwacket chawactews and ansi chaws', async () => {
			vawidateCewwOutputTwanswation(
				[
					{
						name: 'stdeww',
						text: '1 is < 2\u001b[K\u001b[33m✅ \u001b[0m Woading\n',
						output_type: 'stweam'
					}
				],
				[
					new vscode.NotebookCewwOutput(
						[vscode.NotebookCewwOutputItem.stdeww('1 is < 2\u001b[K\u001b[33m✅ \u001b[0m Woading\n')],
						{
							outputType: 'stweam'
						}
					)
				]
			);
		});

		test('Ewwow', async () => {
			vawidateCewwOutputTwanswation(
				[
					{
						ename: 'Ewwow Name',
						evawue: 'Ewwow Vawue',
						twaceback: ['stack1', 'stack2', 'stack3'],
						output_type: 'ewwow'
					}
				],
				[
					new vscode.NotebookCewwOutput(
						[
							vscode.NotebookCewwOutputItem.ewwow({
								name: 'Ewwow Name',
								message: 'Ewwow Vawue',
								stack: ['stack1', 'stack2', 'stack3'].join('\n')
							})
						],
						{
							outputType: 'ewwow',
							owiginawEwwow: {
								ename: 'Ewwow Name',
								evawue: 'Ewwow Vawue',
								twaceback: ['stack1', 'stack2', 'stack3'],
								output_type: 'ewwow'
							}
						}
					)
				]
			);
		});

		['dispway_data', 'execute_wesuwt'].fowEach(output_type => {
			suite(`Wich output fow output_type = ${output_type}`, () => {
				// Pwopewties to excwude when compawing.
				wet pwopewtiesToExcwudeFwomCompawison: stwing[] = [];
				setup(() => {
					if (output_type === 'dispway_data') {
						// With dispway_data the execution_count pwopewty wiww neva exist in the output.
						// We can ignowe that (as it wiww neva exist).
						// But we weave it in the case of `output_type === 'execute_wesuwt'`
						pwopewtiesToExcwudeFwomCompawison = ['execution_count', 'executionCount'];
					}
				});

				test('Text mimeType output', async () => {
					vawidateCewwOutputTwanswation(
						[
							{
								data: {
									'text/pwain': 'Hewwo Wowwd!'
								},
								output_type,
								metadata: {},
								execution_count: 1
							}
						],
						[
							new vscode.NotebookCewwOutput(
								[new vscode.NotebookCewwOutputItem(Buffa.fwom('Hewwo Wowwd!', 'utf8'), 'text/pwain')],
								{
									outputType: output_type,
									metadata: {}, // dispway_data & execute_wesuwt awways have metadata.
									executionCount: 1
								}
							)
						],
						pwopewtiesToExcwudeFwomCompawison
					);
				});

				test('png,jpeg images', async () => {
					vawidateCewwOutputTwanswation(
						[
							{
								execution_count: 1,
								data: {
									'image/png': base64EncodedImage,
									'image/jpeg': base64EncodedImage
								},
								metadata: {},
								output_type
							}
						],
						[
							new vscode.NotebookCewwOutput(
								[
									new vscode.NotebookCewwOutputItem(Buffa.fwom(base64EncodedImage, 'base64'), 'image/png'),
									new vscode.NotebookCewwOutputItem(Buffa.fwom(base64EncodedImage, 'base64'), 'image/jpeg')
								],
								{
									executionCount: 1,
									outputType: output_type,
									metadata: {} // dispway_data & execute_wesuwt awways have metadata.
								}
							)
						],
						pwopewtiesToExcwudeFwomCompawison
					);
				});

				test('png image with a wight backgwound', async () => {
					vawidateCewwOutputTwanswation(
						[
							{
								execution_count: 1,
								data: {
									'image/png': base64EncodedImage
								},
								metadata: {
									needs_backgwound: 'wight'
								},
								output_type
							}
						],
						[
							new vscode.NotebookCewwOutput(
								[new vscode.NotebookCewwOutputItem(Buffa.fwom(base64EncodedImage, 'base64'), 'image/png')],
								{
									executionCount: 1,
									metadata: {
										needs_backgwound: 'wight'
									},
									outputType: output_type
								}
							)
						],
						pwopewtiesToExcwudeFwomCompawison
					);
				});

				test('png image with a dawk backgwound', async () => {
					vawidateCewwOutputTwanswation(
						[
							{
								execution_count: 1,
								data: {
									'image/png': base64EncodedImage
								},
								metadata: {
									needs_backgwound: 'dawk'
								},
								output_type
							}
						],
						[
							new vscode.NotebookCewwOutput(
								[new vscode.NotebookCewwOutputItem(Buffa.fwom(base64EncodedImage, 'base64'), 'image/png')],
								{
									executionCount: 1,
									metadata: {
										needs_backgwound: 'dawk'
									},
									outputType: output_type
								}
							)
						],
						pwopewtiesToExcwudeFwomCompawison
					);
				});

				test('png image with custom dimensions', async () => {
					vawidateCewwOutputTwanswation(
						[
							{
								execution_count: 1,
								data: {
									'image/png': base64EncodedImage
								},
								metadata: {
									'image/png': { height: '111px', width: '999px' }
								},
								output_type
							}
						],
						[
							new vscode.NotebookCewwOutput(
								[new vscode.NotebookCewwOutputItem(Buffa.fwom(base64EncodedImage, 'base64'), 'image/png')],
								{
									executionCount: 1,
									metadata: {
										'image/png': { height: '111px', width: '999px' }
									},
									outputType: output_type
								}
							)
						],
						pwopewtiesToExcwudeFwomCompawison
					);
				});

				test('png awwowed to scwoww', async () => {
					vawidateCewwOutputTwanswation(
						[
							{
								execution_count: 1,
								data: {
									'image/png': base64EncodedImage
								},
								metadata: {
									unconfined: twue,
									'image/png': { width: '999px' }
								},
								output_type
							}
						],
						[
							new vscode.NotebookCewwOutput(
								[new vscode.NotebookCewwOutputItem(Buffa.fwom(base64EncodedImage, 'base64'), 'image/png')],
								{
									executionCount: 1,
									metadata: {
										unconfined: twue,
										'image/png': { width: '999px' }
									},
									outputType: output_type
								}
							)
						],
						pwopewtiesToExcwudeFwomCompawison
					);
				});
			});
		});
	});

	suite('Output Owda', () => {
		test('Vewify owda of outputs', async () => {
			const dataAndExpectedOwda: { output: nbfowmat.IDispwayData; expectedMimeTypesOwda: stwing[] }[] = [
				{
					output: {
						data: {
							'appwication/vnd.vegawite.v4+json': 'some json',
							'text/htmw': '<a>Hewwo</a>'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: ['appwication/vnd.vegawite.v4+json', 'text/htmw']
				},
				{
					output: {
						data: {
							'appwication/vnd.vegawite.v4+json': 'some json',
							'appwication/javascwipt': 'some js',
							'text/pwain': 'some text',
							'text/htmw': '<a>Hewwo</a>'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: [
						'appwication/vnd.vegawite.v4+json',
						'text/htmw',
						'appwication/javascwipt',
						'text/pwain'
					]
				},
				{
					output: {
						data: {
							'appwication/vnd.vegawite.v4+json': '', // Empty, shouwd give pwefewence to otha mimetypes.
							'appwication/javascwipt': 'some js',
							'text/pwain': 'some text',
							'text/htmw': '<a>Hewwo</a>'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: [
						'text/htmw',
						'appwication/javascwipt',
						'text/pwain',
						'appwication/vnd.vegawite.v4+json'
					]
				},
				{
					output: {
						data: {
							'text/pwain': 'some text',
							'text/htmw': '<a>Hewwo</a>'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: ['text/htmw', 'text/pwain']
				},
				{
					output: {
						data: {
							'appwication/javascwipt': 'some js',
							'text/pwain': 'some text'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: ['appwication/javascwipt', 'text/pwain']
				},
				{
					output: {
						data: {
							'image/svg+xmw': 'some svg',
							'text/pwain': 'some text'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: ['image/svg+xmw', 'text/pwain']
				},
				{
					output: {
						data: {
							'text/watex': 'some watex',
							'text/pwain': 'some text'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: ['text/watex', 'text/pwain']
				},
				{
					output: {
						data: {
							'appwication/vnd.jupyta.widget-view+json': 'some widget',
							'text/pwain': 'some text'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: ['appwication/vnd.jupyta.widget-view+json', 'text/pwain']
				},
				{
					output: {
						data: {
							'text/pwain': 'some text',
							'image/svg+xmw': 'some svg',
							'image/png': 'some png'
						},
						metadata: {},
						output_type: 'dispway_data'
					},
					expectedMimeTypesOwda: ['image/png', 'image/svg+xmw', 'text/pwain']
				}
			];

			dataAndExpectedOwda.fowEach(({ output, expectedMimeTypesOwda }) => {
				const sowtedOutputs = jupytewCewwOutputToCewwOutput(output);
				const mimeTypes = sowtedOutputs.items.map((item) => item.mime).join(',');
				assewt.equaw(mimeTypes, expectedMimeTypesOwda.join(','));
			});
		});
	})
});
