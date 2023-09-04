/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, doesNotThrow, equal, ok, strictEqual, throws } from 'assert';
import { commands, ConfigurationTarget, Disposable, env, EnvironmentVariableMutator, EnvironmentVariableMutatorOptions, EnvironmentVariableMutatorType, EventEmitter, ExtensionContext, extensions, ExtensionTerminalOptions, Pseudoterminal, Terminal, TerminalDimensions, TerminalExitReason, TerminalOptions, TerminalState, UIKind, Uri, window, workspace } from 'vscode';
import { assertNoRpc, poll } from '../utils';

// Disable terminal tests:
// - Web https://github.com/microsoft/vscode/issues/92826
(env.uiKind === UIKind.Web ? suite.skip : suite)('vscode API - terminal', () => {
	let extensionContext: ExtensionContext;

	suiteSetup(async () => {
		// Trigger extension activation and grab the context as some tests depend on it
		await extensions.getExtension('vscode.vscode-api-tests')?.activate();
		extensionContext = (global as any).testExtensionContext;

		const config = workspace.getConfiguration('terminal.integrated');
		// Disable conpty in integration tests because of https://github.com/microsoft/vscode/issues/76548
		await config.update('windowsEnableConpty', false, ConfigurationTarget.Global);
		// Disable exit alerts as tests may trigger then and we're not testing the notifications
		await config.update('showExitAlert', false, ConfigurationTarget.Global);
		// Canvas may cause problems when running in a container
		await config.update('gpuAcceleration', 'off', ConfigurationTarget.Global);
		// Disable env var relaunch for tests to prevent terminals relaunching themselves
		await config.update('environmentChangesRelaunch', false, ConfigurationTarget.Global);
		await config.update('shellIntegration.enabled', false);
	});

	suite('Terminal', () => {
		const disposables: Disposable[] = [];

		teardown(async () => {
			assertNoRpc();
			disposables.forEach(d => d.dispose());
			disposables.length = 0;
			const config = workspace.getConfiguration('terminal.integrated');
			await config.update('shellIntegration.enabled', undefined);
		});

		test('sendText immediately after createTerminal should not throw', async () => {
			const terminal = window.createTerminal();
			const result = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(t);
					}
				}));
			});
			equal(result, terminal);
			doesNotThrow(terminal.sendText.bind(terminal, 'echo "foo"'));
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						r();
					}
				}));
				terminal.dispose();
			});
		});

		test('echo works in the default shell', async () => {
			const terminal = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(terminal);
					}
				}));
				// Use a single character to avoid winpty/conpty issues with injected sequences
				const terminal = window.createTerminal({
					env: { TEST: '`' }
				});
				terminal.show();
			});

			let data = '';
			await new Promise<void>(r => {
				disposables.push(window.onDidWriteTerminalData(e => {
					if (e.terminal === terminal) {
						data += e.data;
						if (data.indexOf('`') !== 0) {
							r();
						}
					}
				}));
				// Print an environment variable value so the echo statement doesn't get matched
				if (process.platform === 'win32') {
					terminal.sendText(`$env:TEST`);
				} else {
					terminal.sendText(`echo $TEST`);
				}
			});

			await new Promise<void>(r => {
				terminal.dispose();
				disposables.push(window.onDidCloseTerminal(t => {
					strictEqual(terminal, t);
					r();
				}));
			});
		});

		test('onDidCloseTerminal event fires when terminal is disposed', async () => {
			const terminal = window.createTerminal();
			const result = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(t);
					}
				}));
			});
			equal(result, terminal);
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						r();
					}
				}));
				terminal.dispose();
			});
		});

		test('processId immediately after createTerminal should fetch the pid', async () => {
			const terminal = window.createTerminal();
			const result = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(t);
					}
				}));
			});
			equal(result, terminal);
			const pid = await result.processId;
			equal(true, pid && pid > 0);
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						r();
					}
				}));
				terminal.dispose();
			});
		});

		test('name in constructor should set terminal.name', async () => {
			const terminal = window.createTerminal('a');
			const result = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(t);
					}
				}));
			});
			equal(result, terminal);
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						r();
					}
				}));
				terminal.dispose();
			});
		});

		test('creationOptions should be set and readonly for TerminalOptions terminals', async () => {
			const options = {
				name: 'foo',
				hideFromUser: true
			};
			const terminal = window.createTerminal(options);
			const terminalOptions = terminal.creationOptions as TerminalOptions;
			const result = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(t);
					}
				}));
			});
			equal(result, terminal);
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						r();
					}
				}));
				terminal.dispose();
			});
			throws(() => terminalOptions.name = 'bad', 'creationOptions should be readonly at runtime');
		});

		test('onDidOpenTerminal should fire when a terminal is created', async () => {
			const terminal = window.createTerminal('b');
			const result = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(t);
					}
				}));
			});
			equal(result, terminal);
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						r();
					}
				}));
				terminal.dispose();
			});
		});

		test('exitStatus.code should be set to undefined after a terminal is disposed', async () => {
			const terminal = window.createTerminal();
			const result = await new Promise<Terminal>(r => {
				disposables.push(window.onDidOpenTerminal(t => {
					if (t === terminal) {
						r(t);
					}
				}));
			});
			equal(result, terminal);
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						deepStrictEqual(t.exitStatus, { code: undefined, reason: TerminalExitReason.Extension });
						r();
					}
				}));
				terminal.dispose();
			});
		});

		test('onDidChangeTerminalState should fire after writing to a terminal', async () => {
			const terminal = window.createTerminal();
			deepStrictEqual(terminal.state, { isInteractedWith: false });
			const eventState = await new Promise<TerminalState>(r => {
				disposables.push(window.onDidChangeTerminalState(e => {
					if (e === terminal) {
						r(e.state);
					}
				}));
				terminal.sendText('test');
			});
			deepStrictEqual(eventState, { isInteractedWith: true });
			deepStrictEqual(terminal.state, { isInteractedWith: true });
			await new Promise<void>(r => {
				disposables.push(window.onDidCloseTerminal(t => {
					if (t === terminal) {
						r();
					}
				}));
				terminal.dispose();
			});
		});

		// test('onDidChangeActiveTerminal should fire when new terminals are created', (done) => {
		// 	const reg1 = window.onDidChangeActiveTerminal((active: Terminal | undefined) => {
		// 		equal(active, terminal);
		// 		equal(active, window.activeTerminal);
		// 		reg1.dispose();
		// 		const reg2 = window.onDidChangeActiveTerminal((active: Terminal | undefined) => {
		// 			equal(active, undefined);
		// 			equal(active, window.activeTerminal);
		// 			reg2.dispose();
		// 			done();
		// 		});
		// 		terminal.dispose();
		// 	});
		// 	const terminal = window.createTerminal();
		// 	terminal.show();
		// });

		// test('onDidChangeTerminalDimensions should fire when new terminals are created', (done) => {
		// 	const reg1 = window.onDidChangeTerminalDimensions(async (event: TerminalDimensionsChangeEvent) => {
		// 		equal(event.terminal, terminal1);
		// 		equal(typeof event.dimensions.columns, 'number');
		// 		equal(typeof event.dimensions.rows, 'number');
		// 		ok(event.dimensions.columns > 0);
		// 		ok(event.dimensions.rows > 0);
		// 		reg1.dispose();
		// 		let terminal2: Terminal;
		// 		const reg2 = window.onDidOpenTerminal((newTerminal) => {
		// 			// This is guarantees to fire before dimensions change event
		// 			if (newTerminal !== terminal1) {
		// 				terminal2 = newTerminal;
		// 				reg2.dispose();
		// 			}
		// 		});
		// 		let firstCalled = false;
		// 		let secondCalled = false;
		// 		const reg3 = window.onDidChangeTerminalDimensions((event: TerminalDimensionsChangeEvent) => {
		// 			if (event.terminal === terminal1) {
		// 				// The original terminal should fire dimension change after a split
		// 				firstCalled = true;
		// 			} else if (event.terminal !== terminal1) {
		// 				// The new split terminal should fire dimension change
		// 				secondCalled = true;
		// 			}
		// 			if (firstCalled && secondCalled) {
		// 				let firstDisposed = false;
		// 				let secondDisposed = false;
		// 				const reg4 = window.onDidCloseTerminal(term => {
		// 					if (term === terminal1) {
		// 						firstDisposed = true;
		// 					}
		// 					if (term === terminal2) {
		// 						secondDisposed = true;
		// 					}
		// 					if (firstDisposed && secondDisposed) {
		// 						reg4.dispose();
		// 						done();
		// 					}
		// 				});
		// 				terminal1.dispose();
		// 				terminal2.dispose();
		// 				reg3.dispose();
		// 			}
		// 		});
		// 		await timeout(500);
		// 		commands.executeCommand('workbench.action.terminal.split');
		// 	});
		// 	const terminal1 = window.createTerminal({ name: 'test' });
		// 	terminal1.show();
		// });

		suite('hideFromUser', () => {
			test('should be available to terminals API', async () => {
				const terminal = window.createTerminal({ name: 'bg', hideFromUser: true });
				const result = await new Promise<Terminal>(r => {
					disposables.push(window.onDidOpenTerminal(t => {
						if (t === terminal) {
							r(t);
						}
					}));
				});
				equal(result, terminal);
				equal(true, window.terminals.indexOf(terminal) !== -1);
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal(t => {
						if (t === terminal) {
							r();
						}
					}));
					terminal.dispose();
				});
			});
		});

		suite('selection', () => {
			test('should be undefined immediately after creation', async () => {
				const terminal = window.createTerminal({ name: 'selection test' });
				terminal.show();
				equal(terminal.selection, undefined);
				terminal.dispose();
			});
			test('should be defined after selecting all content', async () => {
				const terminal = window.createTerminal({ name: 'selection test' });
				terminal.show();
				// Wait for some terminal data
				await new Promise<void>(r => {
					const disposable = window.onDidWriteTerminalData(() => {
						disposable.dispose();
						r();
					});
				});
				await commands.executeCommand('workbench.action.terminal.selectAll');
				await poll<void>(() => Promise.resolve(), () => terminal.selection !== undefined, 'selection should be defined');
				terminal.dispose();
			});
			test('should be undefined after clearing a selection', async () => {
				const terminal = window.createTerminal({ name: 'selection test' });
				terminal.show();
				// Wait for some terminal data
				await new Promise<void>(r => {
					const disposable = window.onDidWriteTerminalData(() => {
						disposable.dispose();
						r();
					});
				});
				await commands.executeCommand('workbench.action.terminal.selectAll');
				await poll<void>(() => Promise.resolve(), () => terminal.selection !== undefined, 'selection should be defined');
				await commands.executeCommand('workbench.action.terminal.clearSelection');
				await poll<void>(() => Promise.resolve(), () => terminal.selection === undefined, 'selection should not be defined');
				terminal.dispose();
			});
		});

		suite('window.onDidWriteTerminalData', () => {
			test('should listen to all future terminal data events', function (done) {
				// This test has been flaky in the past but it's not clear why, possibly because
				// events from previous tests polluting the event recording in this test. Retries
				// was added so we continue to have coverage of the onDidWriteTerminalData API.
				this.retries(3);

				const openEvents: string[] = [];
				const dataEvents: { name: string; data: string }[] = [];
				const closeEvents: string[] = [];
				disposables.push(window.onDidOpenTerminal(e => openEvents.push(e.name)));

				let resolveOnceDataWritten: (() => void) | undefined;
				let resolveOnceClosed: (() => void) | undefined;

				disposables.push(window.onDidWriteTerminalData(e => {
					dataEvents.push({ name: e.terminal.name, data: e.data });

					resolveOnceDataWritten!();
				}));

				disposables.push(window.onDidCloseTerminal(e => {
					closeEvents.push(e.name);
					try {
						if (closeEvents.length === 1) {
							deepStrictEqual(openEvents, ['test1']);
							ok(dataEvents.some(e => e.name === 'test1' && e.data === 'write1'));
							deepStrictEqual(closeEvents, ['test1']);
						} else if (closeEvents.length === 2) {
							deepStrictEqual(openEvents, ['test1', 'test2']);
							ok(dataEvents.some(e => e.name === 'test1' && e.data === 'write1'));
							ok(dataEvents.some(e => e.name === 'test2' && e.data === 'write2'));
							deepStrictEqual(closeEvents, ['test1', 'test2']);
						}
						resolveOnceClosed!();
					} catch (e) {
						done(e);
					}
				}));

				const term1Write = new EventEmitter<string>();
				const term1Close = new EventEmitter<void>();
				window.createTerminal({
					name: 'test1', pty: {
						onDidWrite: term1Write.event,
						onDidClose: term1Close.event,
						open: async () => {
							term1Write.fire('write1');

							// Wait until the data is written
							await new Promise<void>(resolve => { resolveOnceDataWritten = resolve; });

							term1Close.fire();

							// Wait until the terminal is closed
							await new Promise<void>(resolve => { resolveOnceClosed = resolve; });

							const term2Write = new EventEmitter<string>();
							const term2Close = new EventEmitter<void>();
							window.createTerminal({
								name: 'test2', pty: {
									onDidWrite: term2Write.event,
									onDidClose: term2Close.event,
									open: async () => {
										term2Write.fire('write2');

										// Wait until the data is written
										await new Promise<void>(resolve => { resolveOnceDataWritten = resolve; });

										term2Close.fire();

										// Wait until the terminal is closed
										await new Promise<void>(resolve => { resolveOnceClosed = resolve; });

										done();
									},
									close: () => { }
								}
							});
						},
						close: () => { }
					}
				});
			});
		});

		suite('Extension pty terminals', () => {
			test('should fire onDidOpenTerminal and onDidCloseTerminal', async () => {
				const pty: Pseudoterminal = {
					onDidWrite: new EventEmitter<string>().event,
					open: () => { },
					close: () => { }
				};
				const terminal = await new Promise<Terminal>(r => {
					disposables.push(window.onDidOpenTerminal(t => {
						if (t.name === 'c') {
							r(t);
						}
					}));
					window.createTerminal({ name: 'c', pty });
				});
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal(() => r()));
					terminal.dispose();
				});
			});

			// The below tests depend on global UI state and each other
			// test('should not provide dimensions on start as the terminal has not been shown yet', (done) => {
			// 	const reg1 = window.onDidOpenTerminal(term => {
			// 		equal(terminal, term);
			// 		reg1.dispose();
			// 	});
			// 	const pty: Pseudoterminal = {
			// 		onDidWrite: new EventEmitter<string>().event,
			// 		open: (dimensions) => {
			// 			equal(dimensions, undefined);
			// 			const reg3 = window.onDidCloseTerminal(() => {
			// 				reg3.dispose();
			// 				done();
			// 			});
			// 			// Show a terminal and wait a brief period before dispose, this will cause
			// 			// the panel to init it's dimenisons and be provided to following terminals.
			// 			// The following test depends on this.
			// 			terminal.show();
			// 			setTimeout(() => terminal.dispose(), 200);
			// 		},
			// 		close: () => {}
			// 	};
			// 	const terminal = window.createTerminal({ name: 'foo', pty });
			// });
			// test('should provide dimensions on start as the terminal has been shown', (done) => {
			// 	const reg1 = window.onDidOpenTerminal(term => {
			// 		equal(terminal, term);
			// 		reg1.dispose();
			// 	});
			// 	const pty: Pseudoterminal = {
			// 		onDidWrite: new EventEmitter<string>().event,
			// 		open: (dimensions) => {
			// 			// This test depends on Terminal.show being called some time before such
			// 			// that the panel dimensions are initialized and cached.
			// 			ok(dimensions!.columns > 0);
			// 			ok(dimensions!.rows > 0);
			// 			const reg3 = window.onDidCloseTerminal(() => {
			// 				reg3.dispose();
			// 				done();
			// 			});
			// 			terminal.dispose();
			// 		},
			// 		close: () => {}
			// 	};
			// 	const terminal = window.createTerminal({ name: 'foo', pty });
			// });

			// TODO: Fix test, flaky in CI (local and remote) https://github.com/microsoft/vscode/issues/137155
			test.skip('should respect dimension overrides', async () => {
				const writeEmitter = new EventEmitter<string>();
				const overrideDimensionsEmitter = new EventEmitter<TerminalDimensions>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					onDidOverrideDimensions: overrideDimensionsEmitter.event,
					open: () => overrideDimensionsEmitter.fire({ columns: 10, rows: 5 }),
					close: () => { }
				};
				const terminal = await new Promise<Terminal>(r => {
					disposables.push(window.onDidOpenTerminal(t => {
						if (t === created) {
							r(t);
						}
					}));
					const created = window.createTerminal({ name: 'foo', pty });
				});
				// Exit the test early if dimensions already match which may happen if the exthost
				// has high latency
				if (terminal.dimensions?.columns === 10 && terminal.dimensions?.rows === 5) {
					return;
				}
				// TODO: Remove logs when the test is verified as non-flaky
				await new Promise<void>(r => {
					// Does this never fire because it's already set to 10x5?
					disposables.push(window.onDidChangeTerminalDimensions(e => {
						console.log(`window.onDidChangeTerminalDimensions event, dimensions = ${e.dimensions?.columns}x${e.dimensions?.rows}`);
						// The default pty dimensions have a chance to appear here since override
						// dimensions happens after the terminal is created. If so just ignore and
						// wait for the right dimensions
						if (e.terminal === terminal && e.dimensions.columns === 10 && e.dimensions.rows === 5) {
							disposables.push(window.onDidCloseTerminal(() => r()));
							terminal.dispose();
						}
					}));
					console.log(`listening for window.onDidChangeTerminalDimensions, current dimensions = ${terminal.dimensions?.columns}x${terminal.dimensions?.rows}`);
					terminal.show();
				});
			});

			test('should change terminal name', async () => {
				const changeNameEmitter = new EventEmitter<string>();
				const closeEmitter = new EventEmitter<number | undefined>();
				const pty: Pseudoterminal = {
					onDidWrite: new EventEmitter<string>().event,
					onDidChangeName: changeNameEmitter.event,
					onDidClose: closeEmitter.event,
					open: () => {
						changeNameEmitter.fire('bar');
						closeEmitter.fire(undefined);
					},
					close: () => { }
				};
				await new Promise<void>(r => {
					disposables.push(window.onDidOpenTerminal(t1 => {
						if (t1 === created) {
							disposables.push(window.onDidCloseTerminal(t2 => {
								if (t2 === created) {
									strictEqual(t1.name, 'bar');
									r();
								}
							}));
						}
					}));
					const created = window.createTerminal({ name: 'foo', pty });
				});
			});

			test('exitStatus.code should be set to the exit code (undefined)', async () => {
				const writeEmitter = new EventEmitter<string>();
				const closeEmitter = new EventEmitter<number | undefined>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					onDidClose: closeEmitter.event,
					open: () => closeEmitter.fire(undefined),
					close: () => { }
				};
				await new Promise<void>(r => {
					disposables.push(window.onDidOpenTerminal(t1 => {
						if (t1 === created) {
							strictEqual(created.exitStatus, undefined);
							disposables.push(window.onDidCloseTerminal(t2 => {
								if (t2 === created) {
									deepStrictEqual(created.exitStatus, { code: undefined, reason: TerminalExitReason.Process });
									r();
								}
							}));
						}
					}));
					const created = window.createTerminal({ name: 'foo', pty });
				});
			});

			test('exitStatus.code should be set to the exit code (zero)', async () => {
				const writeEmitter = new EventEmitter<string>();
				const closeEmitter = new EventEmitter<number | undefined>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					onDidClose: closeEmitter.event,
					open: () => closeEmitter.fire(0),
					close: () => { }
				};
				await new Promise<void>(r => {
					disposables.push(window.onDidOpenTerminal(t1 => {
						if (t1 === created) {
							strictEqual(created.exitStatus, undefined);
							disposables.push(window.onDidCloseTerminal(t2 => {
								if (t2 === created) {
									deepStrictEqual(created.exitStatus, { code: 0, reason: TerminalExitReason.Process });
									r();
								}
							}));
						}
					}));
					const created = window.createTerminal({ name: 'foo', pty });
				});
			});

			test('exitStatus.code should be set to the exit code (non-zero)', async () => {
				const writeEmitter = new EventEmitter<string>();
				const closeEmitter = new EventEmitter<number | undefined>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					onDidClose: closeEmitter.event,
					open: () => {
						// Wait 500ms as any exits that occur within 500ms of terminal launch are
						// are counted as "exiting during launch" which triggers a notification even
						// when showExitAlerts is true
						setTimeout(() => closeEmitter.fire(22), 500);
					},
					close: () => { }
				};
				await new Promise<void>(r => {
					disposables.push(window.onDidOpenTerminal(t1 => {
						if (t1 === created) {
							strictEqual(created.exitStatus, undefined);
							disposables.push(window.onDidCloseTerminal(t2 => {
								if (t2 === created) {
									deepStrictEqual(created.exitStatus, { code: 22, reason: TerminalExitReason.Process });
									r();
								}
							}));
						}
					}));
					const created = window.createTerminal({ name: 'foo', pty });
				});
			});

			test('creationOptions should be set and readonly for ExtensionTerminalOptions terminals', async () => {
				const writeEmitter = new EventEmitter<string>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					open: () => { },
					close: () => { }
				};
				const options = { name: 'foo', pty };
				await new Promise<void>(r => {
					disposables.push(window.onDidOpenTerminal(term => {
						if (term === terminal) {
							terminal.dispose();
							disposables.push(window.onDidCloseTerminal(() => r()));
						}
					}));
					const terminal = window.createTerminal(options);
					strictEqual(terminal.name, 'foo');
					const terminalOptions = terminal.creationOptions as ExtensionTerminalOptions;
					strictEqual(terminalOptions.name, 'foo');
					strictEqual(terminalOptions.pty, pty);
					throws(() => terminalOptions.name = 'bad', 'creationOptions should be readonly at runtime');
				});
			});
		});

		(process.platform === 'win32' ? suite.skip : suite)('environmentVariableCollection', () => {
			test('should have collection variables apply to terminals immediately after setting', async () => {
				// Setup collection and create terminal
				const collection = extensionContext.environmentVariableCollection;
				disposables.push({ dispose: () => collection.clear() });
				collection.replace('A', '~a2~');
				collection.append('B', '~b2~');
				collection.prepend('C', '~c2~');
				const terminal = window.createTerminal({
					env: {
						A: 'a1',
						B: 'b1',
						C: 'c1'
					}
				});

				// Listen for all data events
				let data = '';
				disposables.push(window.onDidWriteTerminalData(e => {
					if (terminal !== e.terminal) {
						return;
					}
					data += sanitizeData(e.data);
				}));

				// Run both PowerShell and sh commands, errors don't matter we're just looking for
				// the correct output
				terminal.sendText('$env:A');
				terminal.sendText('echo $A');
				terminal.sendText('$env:B');
				terminal.sendText('echo $B');
				terminal.sendText('$env:C');
				terminal.sendText('echo $C');

				// Poll for the echo results to show up
				await poll<void>(() => Promise.resolve(), () => data.includes('~a2~'), '~a2~ should be printed');
				await poll<void>(() => Promise.resolve(), () => data.includes('b1~b2~'), 'b1~b2~ should be printed');
				await poll<void>(() => Promise.resolve(), () => data.includes('~c2~c1'), '~c2~c1 should be printed');

				// Wait for terminal to be disposed
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal(() => r()));
					terminal.dispose();
				});
			});

			test('should have collection variables apply to environment variables that don\'t exist', async () => {
				// Setup collection and create terminal
				const collection = extensionContext.environmentVariableCollection;
				disposables.push({ dispose: () => collection.clear() });
				collection.replace('A', '~a2~');
				collection.append('B', '~b2~');
				collection.prepend('C', '~c2~');
				const terminal = window.createTerminal({
					env: {
						A: null,
						B: null,
						C: null
					}
				});

				// Listen for all data events
				let data = '';
				disposables.push(window.onDidWriteTerminalData(e => {
					if (terminal !== e.terminal) {
						return;
					}
					data += sanitizeData(e.data);
				}));

				// Run both PowerShell and sh commands, errors don't matter we're just looking for
				// the correct output
				terminal.sendText('$env:A');
				terminal.sendText('echo $A');
				terminal.sendText('$env:B');
				terminal.sendText('echo $B');
				terminal.sendText('$env:C');
				terminal.sendText('echo $C');

				// Poll for the echo results to show up
				await poll<void>(() => Promise.resolve(), () => data.includes('~a2~'), '~a2~ should be printed');
				await poll<void>(() => Promise.resolve(), () => data.includes('~b2~'), '~b2~ should be printed');
				await poll<void>(() => Promise.resolve(), () => data.includes('~c2~'), '~c2~ should be printed');

				// Wait for terminal to be disposed
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal(() => r()));
					terminal.dispose();
				});
			});

			test('should respect clearing entries', async () => {
				// Setup collection and create terminal
				const collection = extensionContext.environmentVariableCollection;
				disposables.push({ dispose: () => collection.clear() });
				collection.replace('A', '~a2~');
				collection.replace('B', '~a2~');
				collection.clear();
				const terminal = window.createTerminal({
					env: {
						A: '~a1~',
						B: '~b1~'
					}
				});

				// Listen for all data events
				let data = '';
				disposables.push(window.onDidWriteTerminalData(e => {
					if (terminal !== e.terminal) {
						return;
					}
					data += sanitizeData(e.data);
				}));

				// Run both PowerShell and sh commands, errors don't matter we're just looking for
				// the correct output
				terminal.sendText('$env:A');
				terminal.sendText('echo $A');
				terminal.sendText('$env:B');
				terminal.sendText('echo $B');

				// Poll for the echo results to show up
				await poll<void>(() => Promise.resolve(), () => data.includes('~a1~'), '~a1~ should be printed');
				await poll<void>(() => Promise.resolve(), () => data.includes('~b1~'), '~b1~ should be printed');

				// Wait for terminal to be disposed
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal(() => r()));
					terminal.dispose();
				});
			});

			test('should respect deleting entries', async () => {
				// Setup collection and create terminal
				const collection = extensionContext.environmentVariableCollection;
				disposables.push({ dispose: () => collection.clear() });
				collection.replace('A', '~a2~');
				collection.replace('B', '~b2~');
				collection.delete('A');
				const terminal = window.createTerminal({
					env: {
						A: '~a1~',
						B: '~b2~'
					}
				});

				// Listen for all data events
				let data = '';
				disposables.push(window.onDidWriteTerminalData(e => {
					if (terminal !== e.terminal) {
						return;
					}
					data += sanitizeData(e.data);
				}));

				// Run both PowerShell and sh commands, errors don't matter we're just looking for
				// the correct output
				terminal.sendText('$env:A');
				terminal.sendText('echo $A');
				terminal.sendText('$env:B');
				terminal.sendText('echo $B');

				// Poll for the echo results to show up
				await poll<void>(() => Promise.resolve(), () => data.includes('~a1~'), '~a1~ should be printed');
				await poll<void>(() => Promise.resolve(), () => data.includes('~b2~'), '~b2~ should be printed');

				// Wait for terminal to be disposed
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal(() => r()));
					terminal.dispose();
				});
			});

			test('get and forEach should work', () => {
				const collection = extensionContext.environmentVariableCollection;
				disposables.push({ dispose: () => collection.clear() });
				collection.replace('A', '~a2~');
				collection.append('B', '~b2~');
				collection.prepend('C', '~c2~');
				// Verify get
				const defaultOptions: Required<EnvironmentVariableMutatorOptions> = {
					applyAtProcessCreation: true,
					applyAtShellIntegration: false
				};
				deepStrictEqual(collection.get('A'), { value: '~a2~', type: EnvironmentVariableMutatorType.Replace, options: defaultOptions });
				deepStrictEqual(collection.get('B'), { value: '~b2~', type: EnvironmentVariableMutatorType.Append, options: defaultOptions });
				deepStrictEqual(collection.get('C'), { value: '~c2~', type: EnvironmentVariableMutatorType.Prepend, options: defaultOptions });
				// Verify forEach
				const entries: [string, EnvironmentVariableMutator][] = [];
				collection.forEach((v, m) => entries.push([v, m]));
				deepStrictEqual(entries, [
					['A', { value: '~a2~', type: EnvironmentVariableMutatorType.Replace, options: defaultOptions }],
					['B', { value: '~b2~', type: EnvironmentVariableMutatorType.Append, options: defaultOptions }],
					['C', { value: '~c2~', type: EnvironmentVariableMutatorType.Prepend, options: defaultOptions }]
				]);
			});

			test('get and forEach should work (scope)', () => {
				const collection = extensionContext.environmentVariableCollection;
				disposables.push({ dispose: () => collection.clear() });
				const scope = { workspaceFolder: { uri: Uri.file('workspace1'), name: 'workspace1', index: 0 } };
				const scopedCollection = collection.getScoped(scope);
				scopedCollection.replace('A', 'scoped~a2~');
				scopedCollection.append('B', 'scoped~b2~');
				scopedCollection.prepend('C', 'scoped~c2~');
				collection.replace('A', '~a2~');
				collection.append('B', '~b2~');
				collection.prepend('C', '~c2~');
				// Verify get for scope
				const defaultOptions: Required<EnvironmentVariableMutatorOptions> = {
					applyAtProcessCreation: true,
					applyAtShellIntegration: false
				};
				const expectedScopedCollection = collection.getScoped(scope);
				deepStrictEqual(expectedScopedCollection.get('A'), { value: 'scoped~a2~', type: EnvironmentVariableMutatorType.Replace, options: defaultOptions });
				deepStrictEqual(expectedScopedCollection.get('B'), { value: 'scoped~b2~', type: EnvironmentVariableMutatorType.Append, options: defaultOptions });
				deepStrictEqual(expectedScopedCollection.get('C'), { value: 'scoped~c2~', type: EnvironmentVariableMutatorType.Prepend, options: defaultOptions });

				// Verify forEach
				const entries: [string, EnvironmentVariableMutator][] = [];
				expectedScopedCollection.forEach((v, m) => entries.push([v, m]));
				deepStrictEqual(entries.map(v => v[1]), [
					{ value: 'scoped~a2~', type: EnvironmentVariableMutatorType.Replace, options: defaultOptions },
					{ value: 'scoped~b2~', type: EnvironmentVariableMutatorType.Append, options: defaultOptions },
					{ value: 'scoped~c2~', type: EnvironmentVariableMutatorType.Prepend, options: defaultOptions }
				]);
				deepStrictEqual(entries.map(v => v[0]), ['A', 'B', 'C']);
			});
		});
	});
});

function sanitizeData(data: string): string {
	// Strip NL/CR so terminal dimensions don't impact tests
	data = data.replace(/[\r\n]/g, '');

	// Strip escape sequences so winpty/conpty doesn't cause flakiness, do for all platforms for
	// consistency
	const terminalCodesRegex = /(?:\u001B|\u009B)[\[\]()#;?]*(?:(?:(?:[a-zA-Z0-9]*(?:;[a-zA-Z0-9]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PR-TZcf-ntqry=><~]))/g;
	data = data.replace(terminalCodesRegex, '');

	return data;
}
