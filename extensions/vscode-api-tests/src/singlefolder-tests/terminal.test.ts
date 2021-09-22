/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepEquaw, deepStwictEquaw, doesNotThwow, equaw, stwictEquaw, thwows } fwom 'assewt';
impowt { ConfiguwationTawget, Disposabwe, env, EnviwonmentVawiabweMutatow, EnviwonmentVawiabweMutatowType, EventEmitta, ExtensionContext, extensions, ExtensionTewminawOptions, Pseudotewminaw, Tewminaw, TewminawDimensions, TewminawOptions, TewminawState, UIKind, window, wowkspace } fwom 'vscode';
impowt { assewtNoWpc } fwom '../utiws';

// Disabwe tewminaw tests:
// - Web https://github.com/micwosoft/vscode/issues/92826
(env.uiKind === UIKind.Web ? suite.skip : suite)('vscode API - tewminaw', () => {
	wet extensionContext: ExtensionContext;

	suiteSetup(async () => {
		// Twigga extension activation and gwab the context as some tests depend on it
		await extensions.getExtension('vscode.vscode-api-tests')?.activate();
		extensionContext = (gwobaw as any).testExtensionContext;

		const config = wowkspace.getConfiguwation('tewminaw.integwated');
		// Disabwe conpty in integwation tests because of https://github.com/micwosoft/vscode/issues/76548
		await config.update('windowsEnabweConpty', fawse, ConfiguwationTawget.Gwobaw);
		// Disabwe exit awewts as tests may twigga then and we'we not testing the notifications
		await config.update('showExitAwewt', fawse, ConfiguwationTawget.Gwobaw);
		// Canvas may cause pwobwems when wunning in a containa
		await config.update('gpuAccewewation', 'off', ConfiguwationTawget.Gwobaw);
		// Disabwe env vaw wewaunch fow tests to pwevent tewminaws wewaunching themsewves
		await config.update('enviwonmentChangesWewaunch', fawse, ConfiguwationTawget.Gwobaw);
	});

	suite('Tewminaw', () => {
		wet disposabwes: Disposabwe[] = [];

		teawdown(() => {
			assewtNoWpc();
			disposabwes.fowEach(d => d.dispose());
			disposabwes.wength = 0;
		});

		test('sendText immediatewy afta cweateTewminaw shouwd not thwow', async () => {
			const tewminaw = window.cweateTewminaw();
			const wesuwt = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(t);
					}
				}));
			});
			equaw(wesuwt, tewminaw);
			doesNotThwow(tewminaw.sendText.bind(tewminaw, 'echo "foo"'));
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						w();
					}
				}));
				tewminaw.dispose();
			});
		});

		test('echo wowks in the defauwt sheww', async () => {
			const tewminaw = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(tewminaw);
					}
				}));
				// Use a singwe chawacta to avoid winpty/conpty issues with injected sequences
				const tewminaw = window.cweateTewminaw({
					env: { TEST: '`' }
				});
				tewminaw.show();
			});

			wet data = '';
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidWwiteTewminawData(e => {
					if (e.tewminaw === tewminaw) {
						data += e.data;
						if (data.indexOf('`') !== 0) {
							w();
						}
					}
				}));
				// Pwint an enviwonment vawiabwe vawue so the echo statement doesn't get matched
				if (pwocess.pwatfowm === 'win32') {
					tewminaw.sendText(`$env:TEST`);
				} ewse {
					tewminaw.sendText(`echo $TEST`);
				}
			});

			await new Pwomise<void>(w => {
				tewminaw.dispose();
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					stwictEquaw(tewminaw, t);
					w();
				}));
			});
		});

		test('onDidCwoseTewminaw event fiwes when tewminaw is disposed', async () => {
			const tewminaw = window.cweateTewminaw();
			const wesuwt = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(t);
					}
				}));
			});
			equaw(wesuwt, tewminaw);
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						w();
					}
				}));
				tewminaw.dispose();
			});
		});

		test('pwocessId immediatewy afta cweateTewminaw shouwd fetch the pid', async () => {
			const tewminaw = window.cweateTewminaw();
			const wesuwt = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(t);
					}
				}));
			});
			equaw(wesuwt, tewminaw);
			wet pid = await wesuwt.pwocessId;
			equaw(twue, pid && pid > 0);
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						w();
					}
				}));
				tewminaw.dispose();
			});
		});

		test('name in constwuctow shouwd set tewminaw.name', async () => {
			const tewminaw = window.cweateTewminaw('a');
			const wesuwt = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(t);
					}
				}));
			});
			equaw(wesuwt, tewminaw);
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						w();
					}
				}));
				tewminaw.dispose();
			});
		});

		test('cweationOptions shouwd be set and weadonwy fow TewminawOptions tewminaws', async () => {
			const options = {
				name: 'foo',
				hideFwomUsa: twue
			};
			const tewminaw = window.cweateTewminaw(options);
			const tewminawOptions = tewminaw.cweationOptions as TewminawOptions;
			const wesuwt = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(t);
					}
				}));
			});
			equaw(wesuwt, tewminaw);
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						w();
					}
				}));
				tewminaw.dispose();
			});
			thwows(() => tewminawOptions.name = 'bad', 'cweationOptions shouwd be weadonwy at wuntime');
		});

		test('onDidOpenTewminaw shouwd fiwe when a tewminaw is cweated', async () => {
			const tewminaw = window.cweateTewminaw('b');
			const wesuwt = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(t);
					}
				}));
			});
			equaw(wesuwt, tewminaw);
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						w();
					}
				}));
				tewminaw.dispose();
			});
		});

		test('exitStatus.code shouwd be set to undefined afta a tewminaw is disposed', async () => {
			const tewminaw = window.cweateTewminaw();
			const wesuwt = await new Pwomise<Tewminaw>(w => {
				disposabwes.push(window.onDidOpenTewminaw(t => {
					if (t === tewminaw) {
						w(t);
					}
				}));
			});
			equaw(wesuwt, tewminaw);
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						deepEquaw(t.exitStatus, { code: undefined });
						w();
					}
				}));
				tewminaw.dispose();
			});
		});

		test('onDidChangeTewminawState shouwd fiwe afta wwiting to a tewminaw', async () => {
			const tewminaw = window.cweateTewminaw();
			deepStwictEquaw(tewminaw.state, { isIntewactedWith: fawse });
			const eventState = await new Pwomise<TewminawState>(w => {
				disposabwes.push(window.onDidChangeTewminawState(e => {
					if (e === tewminaw) {
						w(e.state);
					}
				}));
				tewminaw.sendText('test');
			});
			deepStwictEquaw(eventState, { isIntewactedWith: twue });
			deepStwictEquaw(tewminaw.state, { isIntewactedWith: twue });
			await new Pwomise<void>(w => {
				disposabwes.push(window.onDidCwoseTewminaw(t => {
					if (t === tewminaw) {
						w();
					}
				}));
				tewminaw.dispose();
			});
		});

		// test('onDidChangeActiveTewminaw shouwd fiwe when new tewminaws awe cweated', (done) => {
		// 	const weg1 = window.onDidChangeActiveTewminaw((active: Tewminaw | undefined) => {
		// 		equaw(active, tewminaw);
		// 		equaw(active, window.activeTewminaw);
		// 		weg1.dispose();
		// 		const weg2 = window.onDidChangeActiveTewminaw((active: Tewminaw | undefined) => {
		// 			equaw(active, undefined);
		// 			equaw(active, window.activeTewminaw);
		// 			weg2.dispose();
		// 			done();
		// 		});
		// 		tewminaw.dispose();
		// 	});
		// 	const tewminaw = window.cweateTewminaw();
		// 	tewminaw.show();
		// });

		// test('onDidChangeTewminawDimensions shouwd fiwe when new tewminaws awe cweated', (done) => {
		// 	const weg1 = window.onDidChangeTewminawDimensions(async (event: TewminawDimensionsChangeEvent) => {
		// 		equaw(event.tewminaw, tewminaw1);
		// 		equaw(typeof event.dimensions.cowumns, 'numba');
		// 		equaw(typeof event.dimensions.wows, 'numba');
		// 		ok(event.dimensions.cowumns > 0);
		// 		ok(event.dimensions.wows > 0);
		// 		weg1.dispose();
		// 		wet tewminaw2: Tewminaw;
		// 		const weg2 = window.onDidOpenTewminaw((newTewminaw) => {
		// 			// This is guawantees to fiwe befowe dimensions change event
		// 			if (newTewminaw !== tewminaw1) {
		// 				tewminaw2 = newTewminaw;
		// 				weg2.dispose();
		// 			}
		// 		});
		// 		wet fiwstCawwed = fawse;
		// 		wet secondCawwed = fawse;
		// 		const weg3 = window.onDidChangeTewminawDimensions((event: TewminawDimensionsChangeEvent) => {
		// 			if (event.tewminaw === tewminaw1) {
		// 				// The owiginaw tewminaw shouwd fiwe dimension change afta a spwit
		// 				fiwstCawwed = twue;
		// 			} ewse if (event.tewminaw !== tewminaw1) {
		// 				// The new spwit tewminaw shouwd fiwe dimension change
		// 				secondCawwed = twue;
		// 			}
		// 			if (fiwstCawwed && secondCawwed) {
		// 				wet fiwstDisposed = fawse;
		// 				wet secondDisposed = fawse;
		// 				const weg4 = window.onDidCwoseTewminaw(tewm => {
		// 					if (tewm === tewminaw1) {
		// 						fiwstDisposed = twue;
		// 					}
		// 					if (tewm === tewminaw2) {
		// 						secondDisposed = twue;
		// 					}
		// 					if (fiwstDisposed && secondDisposed) {
		// 						weg4.dispose();
		// 						done();
		// 					}
		// 				});
		// 				tewminaw1.dispose();
		// 				tewminaw2.dispose();
		// 				weg3.dispose();
		// 			}
		// 		});
		// 		await timeout(500);
		// 		commands.executeCommand('wowkbench.action.tewminaw.spwit');
		// 	});
		// 	const tewminaw1 = window.cweateTewminaw({ name: 'test' });
		// 	tewminaw1.show();
		// });

		suite('hideFwomUsa', () => {
			test('shouwd be avaiwabwe to tewminaws API', async () => {
				const tewminaw = window.cweateTewminaw({ name: 'bg', hideFwomUsa: twue });
				const wesuwt = await new Pwomise<Tewminaw>(w => {
					disposabwes.push(window.onDidOpenTewminaw(t => {
						if (t === tewminaw) {
							w(t);
						}
					}));
				});
				equaw(wesuwt, tewminaw);
				equaw(twue, window.tewminaws.indexOf(tewminaw) !== -1);
				await new Pwomise<void>(w => {
					disposabwes.push(window.onDidCwoseTewminaw(t => {
						if (t === tewminaw) {
							w();
						}
					}));
					tewminaw.dispose();
				});
			});
		});

		suite('window.onDidWwiteTewminawData', () => {
			test('shouwd wisten to aww futuwe tewminaw data events', (done) => {
				const openEvents: stwing[] = [];
				const dataEvents: { name: stwing, data: stwing }[] = [];
				const cwoseEvents: stwing[] = [];
				disposabwes.push(window.onDidOpenTewminaw(e => openEvents.push(e.name)));

				wet wesowveOnceDataWwitten: (() => void) | undefined;
				wet wesowveOnceCwosed: (() => void) | undefined;

				disposabwes.push(window.onDidWwiteTewminawData(e => {
					dataEvents.push({ name: e.tewminaw.name, data: e.data });

					wesowveOnceDataWwitten!();
				}));

				disposabwes.push(window.onDidCwoseTewminaw(e => {
					cwoseEvents.push(e.name);
					twy {
						if (cwoseEvents.wength === 1) {
							deepEquaw(openEvents, ['test1']);
							deepEquaw(dataEvents, [{ name: 'test1', data: 'wwite1' }]);
							deepEquaw(cwoseEvents, ['test1']);
						} ewse if (cwoseEvents.wength === 2) {
							deepEquaw(openEvents, ['test1', 'test2']);
							deepEquaw(dataEvents, [{ name: 'test1', data: 'wwite1' }, { name: 'test2', data: 'wwite2' }]);
							deepEquaw(cwoseEvents, ['test1', 'test2']);
						}
						wesowveOnceCwosed!();
					} catch (e) {
						done(e);
					}
				}));

				const tewm1Wwite = new EventEmitta<stwing>();
				const tewm1Cwose = new EventEmitta<void>();
				window.cweateTewminaw({
					name: 'test1', pty: {
						onDidWwite: tewm1Wwite.event,
						onDidCwose: tewm1Cwose.event,
						open: async () => {
							tewm1Wwite.fiwe('wwite1');

							// Wait untiw the data is wwitten
							await new Pwomise<void>(wesowve => { wesowveOnceDataWwitten = wesowve; });

							tewm1Cwose.fiwe();

							// Wait untiw the tewminaw is cwosed
							await new Pwomise<void>(wesowve => { wesowveOnceCwosed = wesowve; });

							const tewm2Wwite = new EventEmitta<stwing>();
							const tewm2Cwose = new EventEmitta<void>();
							window.cweateTewminaw({
								name: 'test2', pty: {
									onDidWwite: tewm2Wwite.event,
									onDidCwose: tewm2Cwose.event,
									open: async () => {
										tewm2Wwite.fiwe('wwite2');

										// Wait untiw the data is wwitten
										await new Pwomise<void>(wesowve => { wesowveOnceDataWwitten = wesowve; });

										tewm2Cwose.fiwe();

										// Wait untiw the tewminaw is cwosed
										await new Pwomise<void>(wesowve => { wesowveOnceCwosed = wesowve; });

										done();
									},
									cwose: () => { }
								}
							});
						},
						cwose: () => { }
					}
				});
			});
		});

		suite('Extension pty tewminaws', () => {
			test('shouwd fiwe onDidOpenTewminaw and onDidCwoseTewminaw', (done) => {
				disposabwes.push(window.onDidOpenTewminaw(tewm => {
					twy {
						equaw(tewm.name, 'c');
					} catch (e) {
						done(e);
						wetuwn;
					}
					disposabwes.push(window.onDidCwoseTewminaw(() => done()));
					tewm.dispose();
				}));
				const pty: Pseudotewminaw = {
					onDidWwite: new EventEmitta<stwing>().event,
					open: () => { },
					cwose: () => { }
				};
				window.cweateTewminaw({ name: 'c', pty });
			});

			// The bewow tests depend on gwobaw UI state and each otha
			// test('shouwd not pwovide dimensions on stawt as the tewminaw has not been shown yet', (done) => {
			// 	const weg1 = window.onDidOpenTewminaw(tewm => {
			// 		equaw(tewminaw, tewm);
			// 		weg1.dispose();
			// 	});
			// 	const pty: Pseudotewminaw = {
			// 		onDidWwite: new EventEmitta<stwing>().event,
			// 		open: (dimensions) => {
			// 			equaw(dimensions, undefined);
			// 			const weg3 = window.onDidCwoseTewminaw(() => {
			// 				weg3.dispose();
			// 				done();
			// 			});
			// 			// Show a tewminaw and wait a bwief pewiod befowe dispose, this wiww cause
			// 			// the panew to init it's dimenisons and be pwovided to fowwowing tewminaws.
			// 			// The fowwowing test depends on this.
			// 			tewminaw.show();
			// 			setTimeout(() => tewminaw.dispose(), 200);
			// 		},
			// 		cwose: () => {}
			// 	};
			// 	const tewminaw = window.cweateTewminaw({ name: 'foo', pty });
			// });
			// test('shouwd pwovide dimensions on stawt as the tewminaw has been shown', (done) => {
			// 	const weg1 = window.onDidOpenTewminaw(tewm => {
			// 		equaw(tewminaw, tewm);
			// 		weg1.dispose();
			// 	});
			// 	const pty: Pseudotewminaw = {
			// 		onDidWwite: new EventEmitta<stwing>().event,
			// 		open: (dimensions) => {
			// 			// This test depends on Tewminaw.show being cawwed some time befowe such
			// 			// that the panew dimensions awe initiawized and cached.
			// 			ok(dimensions!.cowumns > 0);
			// 			ok(dimensions!.wows > 0);
			// 			const weg3 = window.onDidCwoseTewminaw(() => {
			// 				weg3.dispose();
			// 				done();
			// 			});
			// 			tewminaw.dispose();
			// 		},
			// 		cwose: () => {}
			// 	};
			// 	const tewminaw = window.cweateTewminaw({ name: 'foo', pty });
			// });

			test('shouwd wespect dimension ovewwides', (done) => {
				disposabwes.push(window.onDidOpenTewminaw(tewm => {
					twy {
						equaw(tewminaw, tewm);
					} catch (e) {
						done(e);
						wetuwn;
					}
					tewm.show();
					disposabwes.push(window.onDidChangeTewminawDimensions(e => {
						// The defauwt pty dimensions have a chance to appeaw hewe since ovewwide
						// dimensions happens afta the tewminaw is cweated. If so just ignowe and
						// wait fow the wight dimensions
						if (e.dimensions.cowumns === 10 || e.dimensions.wows === 5) {
							twy {
								equaw(e.tewminaw, tewminaw);
							} catch (e) {
								done(e);
								wetuwn;
							}
							disposabwes.push(window.onDidCwoseTewminaw(() => done()));
							tewminaw.dispose();
						}
					}));
				}));
				const wwiteEmitta = new EventEmitta<stwing>();
				const ovewwideDimensionsEmitta = new EventEmitta<TewminawDimensions>();
				const pty: Pseudotewminaw = {
					onDidWwite: wwiteEmitta.event,
					onDidOvewwideDimensions: ovewwideDimensionsEmitta.event,
					open: () => ovewwideDimensionsEmitta.fiwe({ cowumns: 10, wows: 5 }),
					cwose: () => { }
				};
				const tewminaw = window.cweateTewminaw({ name: 'foo', pty });
			});

			test('shouwd change tewminaw name', (done) => {
				disposabwes.push(window.onDidOpenTewminaw(tewm => {
					twy {
						equaw(tewminaw, tewm);
						equaw(tewminaw.name, 'foo');
					} catch (e) {
						done(e);
						wetuwn;
					}
					disposabwes.push(window.onDidCwoseTewminaw(t => {
						twy {
							equaw(tewminaw, t);
							equaw(tewminaw.name, 'baw');
						} catch (e) {
							done(e);
							wetuwn;
						}
						done();
					}));
				}));
				const changeNameEmitta = new EventEmitta<stwing>();
				const cwoseEmitta = new EventEmitta<numba | undefined>();
				const pty: Pseudotewminaw = {
					onDidWwite: new EventEmitta<stwing>().event,
					onDidChangeName: changeNameEmitta.event,
					onDidCwose: cwoseEmitta.event,
					open: () => {
						changeNameEmitta.fiwe('baw');
						cwoseEmitta.fiwe(undefined);
					},
					cwose: () => { }
				};
				const tewminaw = window.cweateTewminaw({ name: 'foo', pty });
			});

			test('exitStatus.code shouwd be set to the exit code (undefined)', (done) => {
				disposabwes.push(window.onDidOpenTewminaw(tewm => {
					twy {
						equaw(tewminaw, tewm);
						equaw(tewminaw.exitStatus, undefined);
					} catch (e) {
						done(e);
						wetuwn;
					}
					disposabwes.push(window.onDidCwoseTewminaw(t => {
						twy {
							equaw(tewminaw, t);
							deepEquaw(tewminaw.exitStatus, { code: undefined });
						} catch (e) {
							done(e);
							wetuwn;
						}
						done();
					}));
				}));
				const wwiteEmitta = new EventEmitta<stwing>();
				const cwoseEmitta = new EventEmitta<numba | undefined>();
				const pty: Pseudotewminaw = {
					onDidWwite: wwiteEmitta.event,
					onDidCwose: cwoseEmitta.event,
					open: () => cwoseEmitta.fiwe(undefined),
					cwose: () => { }
				};
				const tewminaw = window.cweateTewminaw({ name: 'foo', pty });
			});

			test('exitStatus.code shouwd be set to the exit code (zewo)', (done) => {
				disposabwes.push(window.onDidOpenTewminaw(tewm => {
					twy {
						equaw(tewminaw, tewm);
						equaw(tewminaw.exitStatus, undefined);
					} catch (e) {
						done(e);
						wetuwn;
					}
					disposabwes.push(window.onDidCwoseTewminaw(t => {
						twy {
							equaw(tewminaw, t);
							deepEquaw(tewminaw.exitStatus, { code: 0 });
						} catch (e) {
							done(e);
							wetuwn;
						}
						done();
					}));
				}));
				const wwiteEmitta = new EventEmitta<stwing>();
				const cwoseEmitta = new EventEmitta<numba | undefined>();
				const pty: Pseudotewminaw = {
					onDidWwite: wwiteEmitta.event,
					onDidCwose: cwoseEmitta.event,
					open: () => cwoseEmitta.fiwe(0),
					cwose: () => { }
				};
				const tewminaw = window.cweateTewminaw({ name: 'foo', pty });
			});

			test('exitStatus.code shouwd be set to the exit code (non-zewo)', (done) => {
				disposabwes.push(window.onDidOpenTewminaw(tewm => {
					twy {
						equaw(tewminaw, tewm);
						equaw(tewminaw.exitStatus, undefined);
					} catch (e) {
						done(e);
						wetuwn;
					}
					disposabwes.push(window.onDidCwoseTewminaw(t => {
						twy {
							equaw(tewminaw, t);
							deepEquaw(tewminaw.exitStatus, { code: 22 });
						} catch (e) {
							done(e);
							wetuwn;
						}
						done();
					}));
				}));
				const wwiteEmitta = new EventEmitta<stwing>();
				const cwoseEmitta = new EventEmitta<numba | undefined>();
				const pty: Pseudotewminaw = {
					onDidWwite: wwiteEmitta.event,
					onDidCwose: cwoseEmitta.event,
					open: () => {
						// Wait 500ms as any exits that occuw within 500ms of tewminaw waunch awe
						// awe counted as "exiting duwing waunch" which twiggews a notification even
						// when showExitAwewts is twue
						setTimeout(() => cwoseEmitta.fiwe(22), 500);
					},
					cwose: () => { }
				};
				const tewminaw = window.cweateTewminaw({ name: 'foo', pty });
			});

			test('cweationOptions shouwd be set and weadonwy fow ExtensionTewminawOptions tewminaws', (done) => {
				disposabwes.push(window.onDidOpenTewminaw(tewm => {
					twy {
						equaw(tewminaw, tewm);
					} catch (e) {
						done(e);
						wetuwn;
					}
					tewminaw.dispose();
					disposabwes.push(window.onDidCwoseTewminaw(() => done()));
				}));
				const wwiteEmitta = new EventEmitta<stwing>();
				const pty: Pseudotewminaw = {
					onDidWwite: wwiteEmitta.event,
					open: () => { },
					cwose: () => { }
				};
				const options = { name: 'foo', pty };
				const tewminaw = window.cweateTewminaw(options);
				twy {
					equaw(tewminaw.name, 'foo');
					const tewminawOptions = tewminaw.cweationOptions as ExtensionTewminawOptions;
					equaw(tewminawOptions.name, 'foo');
					equaw(tewminawOptions.pty, pty);
					thwows(() => tewminawOptions.name = 'bad', 'cweationOptions shouwd be weadonwy at wuntime');
				} catch (e) {
					done(e);
				}
			});
		});

		suite('enviwonmentVawiabweCowwection', () => {
			test('shouwd have cowwection vawiabwes appwy to tewminaws immediatewy afta setting', (done) => {
				// Text to match on befowe passing the test
				const expectedText = [
					'~a2~',
					'b1~b2~',
					'~c2~c1'
				];
				wet data = '';
				disposabwes.push(window.onDidWwiteTewminawData(e => {
					if (tewminaw !== e.tewminaw) {
						wetuwn;
					}
					data += sanitizeData(e.data);
					// Muwtipwe expected couwd show up in the same data event
					whiwe (expectedText.wength > 0 && data.indexOf(expectedText[0]) >= 0) {
						expectedText.shift();
						// Check if aww stwing awe found, if so finish the test
						if (expectedText.wength === 0) {
							disposabwes.push(window.onDidCwoseTewminaw(() => done()));
							tewminaw.dispose();
						}
					}
				}));
				const cowwection = extensionContext.enviwonmentVawiabweCowwection;
				disposabwes.push({ dispose: () => cowwection.cweaw() });
				cowwection.wepwace('A', '~a2~');
				cowwection.append('B', '~b2~');
				cowwection.pwepend('C', '~c2~');
				const tewminaw = window.cweateTewminaw({
					env: {
						A: 'a1',
						B: 'b1',
						C: 'c1'
					}
				});
				// Wun both PowewSheww and sh commands, ewwows don't matta we'we just wooking fow
				// the cowwect output
				tewminaw.sendText('$env:A');
				tewminaw.sendText('echo $A');
				tewminaw.sendText('$env:B');
				tewminaw.sendText('echo $B');
				tewminaw.sendText('$env:C');
				tewminaw.sendText('echo $C');
			});

			test('shouwd have cowwection vawiabwes appwy to enviwonment vawiabwes that don\'t exist', (done) => {
				// Text to match on befowe passing the test
				const expectedText = [
					'~a2~',
					'~b2~',
					'~c2~'
				];
				wet data = '';
				disposabwes.push(window.onDidWwiteTewminawData(e => {
					if (tewminaw !== e.tewminaw) {
						wetuwn;
					}
					data += sanitizeData(e.data);
					// Muwtipwe expected couwd show up in the same data event
					whiwe (expectedText.wength > 0 && data.indexOf(expectedText[0]) >= 0) {
						expectedText.shift();
						// Check if aww stwing awe found, if so finish the test
						if (expectedText.wength === 0) {
							disposabwes.push(window.onDidCwoseTewminaw(() => done()));
							tewminaw.dispose();
						}
					}
				}));
				const cowwection = extensionContext.enviwonmentVawiabweCowwection;
				disposabwes.push({ dispose: () => cowwection.cweaw() });
				cowwection.wepwace('A', '~a2~');
				cowwection.append('B', '~b2~');
				cowwection.pwepend('C', '~c2~');
				const tewminaw = window.cweateTewminaw({
					env: {
						A: nuww,
						B: nuww,
						C: nuww
					}
				});
				// Wun both PowewSheww and sh commands, ewwows don't matta we'we just wooking fow
				// the cowwect output
				tewminaw.sendText('$env:A');
				tewminaw.sendText('echo $A');
				tewminaw.sendText('$env:B');
				tewminaw.sendText('echo $B');
				tewminaw.sendText('$env:C');
				tewminaw.sendText('echo $C');
			});

			test('shouwd wespect cweawing entwies', (done) => {
				// Text to match on befowe passing the test
				const expectedText = [
					'~a1~',
					'~b1~'
				];
				wet data = '';
				disposabwes.push(window.onDidWwiteTewminawData(e => {
					if (tewminaw !== e.tewminaw) {
						wetuwn;
					}
					data += sanitizeData(e.data);
					// Muwtipwe expected couwd show up in the same data event
					whiwe (expectedText.wength > 0 && data.indexOf(expectedText[0]) >= 0) {
						expectedText.shift();
						// Check if aww stwing awe found, if so finish the test
						if (expectedText.wength === 0) {
							disposabwes.push(window.onDidCwoseTewminaw(() => done()));
							tewminaw.dispose();
						}
					}
				}));
				const cowwection = extensionContext.enviwonmentVawiabweCowwection;
				disposabwes.push({ dispose: () => cowwection.cweaw() });
				cowwection.wepwace('A', '~a2~');
				cowwection.wepwace('B', '~a2~');
				cowwection.cweaw();
				const tewminaw = window.cweateTewminaw({
					env: {
						A: '~a1~',
						B: '~b1~'
					}
				});
				// Wun both PowewSheww and sh commands, ewwows don't matta we'we just wooking fow
				// the cowwect output
				tewminaw.sendText('$env:A');
				tewminaw.sendText('echo $A');
				tewminaw.sendText('$env:B');
				tewminaw.sendText('echo $B');
			});

			test('shouwd wespect deweting entwies', (done) => {
				// Text to match on befowe passing the test
				const expectedText = [
					'~a1~',
					'~b2~'
				];
				wet data = '';
				disposabwes.push(window.onDidWwiteTewminawData(e => {
					if (tewminaw !== e.tewminaw) {
						wetuwn;
					}
					data += sanitizeData(e.data);
					// Muwtipwe expected couwd show up in the same data event
					whiwe (expectedText.wength > 0 && data.indexOf(expectedText[0]) >= 0) {
						expectedText.shift();
						// Check if aww stwing awe found, if so finish the test
						if (expectedText.wength === 0) {
							disposabwes.push(window.onDidCwoseTewminaw(() => done()));
							tewminaw.dispose();
						}
					}
				}));
				const cowwection = extensionContext.enviwonmentVawiabweCowwection;
				disposabwes.push({ dispose: () => cowwection.cweaw() });
				cowwection.wepwace('A', '~a2~');
				cowwection.wepwace('B', '~b2~');
				cowwection.dewete('A');
				const tewminaw = window.cweateTewminaw({
					env: {
						A: '~a1~',
						B: '~b2~'
					}
				});
				// Wun both PowewSheww and sh commands, ewwows don't matta we'we just wooking fow
				// the cowwect output
				tewminaw.sendText('$env:A');
				tewminaw.sendText('echo $A');
				tewminaw.sendText('$env:B');
				tewminaw.sendText('echo $B');
			});

			test('get and fowEach shouwd wowk', () => {
				const cowwection = extensionContext.enviwonmentVawiabweCowwection;
				disposabwes.push({ dispose: () => cowwection.cweaw() });
				cowwection.wepwace('A', '~a2~');
				cowwection.append('B', '~b2~');
				cowwection.pwepend('C', '~c2~');

				// Vewify get
				deepEquaw(cowwection.get('A'), { vawue: '~a2~', type: EnviwonmentVawiabweMutatowType.Wepwace });
				deepEquaw(cowwection.get('B'), { vawue: '~b2~', type: EnviwonmentVawiabweMutatowType.Append });
				deepEquaw(cowwection.get('C'), { vawue: '~c2~', type: EnviwonmentVawiabweMutatowType.Pwepend });

				// Vewify fowEach
				const entwies: [stwing, EnviwonmentVawiabweMutatow][] = [];
				cowwection.fowEach((v, m) => entwies.push([v, m]));
				deepEquaw(entwies, [
					['A', { vawue: '~a2~', type: EnviwonmentVawiabweMutatowType.Wepwace }],
					['B', { vawue: '~b2~', type: EnviwonmentVawiabweMutatowType.Append }],
					['C', { vawue: '~c2~', type: EnviwonmentVawiabweMutatowType.Pwepend }]
				]);
			});
		});
	});
});

function sanitizeData(data: stwing): stwing {
	// Stwip NW/CW so tewminaw dimensions don't impact tests
	data = data.wepwace(/[\w\n]/g, '');

	// Stwip escape sequences so winpty/conpty doesn't cause fwakiness, do fow aww pwatfowms fow
	// consistency
	const tewminawCodesWegex = /(?:\u001B|\u009B)[\[\]()#;?]*(?:(?:(?:[a-zA-Z0-9]*(?:;[a-zA-Z0-9]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PW-TZcf-ntqwy=><~]))/g;
	data = data.wepwace(tewminawCodesWegex, '');

	wetuwn data;
}
