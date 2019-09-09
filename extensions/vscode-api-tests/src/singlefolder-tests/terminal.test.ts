/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, Pseudoterminal, EventEmitter, TerminalDimensions, workspace, ConfigurationTarget } from 'vscode';
import { doesNotThrow, equal, ok, deepEqual } from 'assert';

suite('window namespace tests', () => {
	suiteSetup(async () => {
		// Disable conpty in integration tests because of https://github.com/microsoft/vscode/issues/76548
		await workspace.getConfiguration('terminal.integrated').update('windowsEnableConpty', false, ConfigurationTarget.Global);
	});
	suite('Terminal', () => {
		test('sendText immediately after createTerminal should not throw', (done) => {
			const reg1 = window.onDidOpenTerminal(term => {
				equal(terminal, term);
				terminal.dispose();
				reg1.dispose();
				const reg2 = window.onDidCloseTerminal(() => {
					reg2.dispose();
					done();
				});
			});
			const terminal = window.createTerminal();
			doesNotThrow(terminal.sendText.bind(terminal, 'echo "foo"'));
		});

		test('onDidCloseTerminal event fires when terminal is disposed', (done) => {
			const reg1 = window.onDidOpenTerminal(term => {
				equal(terminal, term);
				terminal.dispose();
				reg1.dispose();
				const reg2 = window.onDidCloseTerminal(() => {
					reg2.dispose();
					done();
				});
			});
			const terminal = window.createTerminal();
		});

		test('processId immediately after createTerminal should fetch the pid', (done) => {
			const reg1 = window.onDidOpenTerminal(term => {
				equal(terminal, term);
				reg1.dispose();
				terminal.processId.then(id => {
					ok(id > 0);
					terminal.dispose();
					const reg2 = window.onDidCloseTerminal(() => {
						reg2.dispose();
						done();
					});
				});
			});
			const terminal = window.createTerminal();
		});

		test('name in constructor should set terminal.name', (done) => {
			const reg1 = window.onDidOpenTerminal(term => {
				equal(terminal, term);
				terminal.dispose();
				reg1.dispose();
				const reg2 = window.onDidCloseTerminal(() => {
					reg2.dispose();
					done();
				});
			});
			const terminal = window.createTerminal('a');
			equal(terminal.name, 'a');
		});

		test('onDidOpenTerminal should fire when a terminal is created', (done) => {
			const reg1 = window.onDidOpenTerminal(term => {
				equal(term.name, 'b');
				reg1.dispose();
				const reg2 = window.onDidCloseTerminal(() => {
					reg2.dispose();
					done();
				});
				terminal.dispose();
			});
			const terminal = window.createTerminal('b');
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
			// test('should fire onDidWriteData correctly', done => {
			// 	const terminal = window.createTerminal({ name: 'bg', hideFromUser: true });
			// 	let data = '';
			// 	terminal.onDidWriteData(e => {
			// 		data += e;
			// 		if (data.indexOf('foo') !== -1) {
			// 			const reg3 = window.onDidCloseTerminal(() => {
			// 				reg3.dispose();
			// 				done();
			// 			});
			// 			terminal.dispose();
			// 		}
			// 	});
			// 	terminal.sendText('foo');
			// });

			test('should be available to terminals API', done => {
				const terminal = window.createTerminal({ name: 'bg', hideFromUser: true });
				window.onDidOpenTerminal(t => {
					equal(t, terminal);
					equal(t.name, 'bg');
					ok(window.terminals.indexOf(terminal) !== -1);
					const reg3 = window.onDidCloseTerminal(() => {
						reg3.dispose();
						done();
					});
					terminal.dispose();
				});
			});
		});

		suite('window.onDidWriteTerminalData', () => {
			test('should listen to all future terminal data events', (done) => {
				const openEvents: string[] = [];
				const dataEvents: { name: string, data: string }[] = [];
				const closeEvents: string[] = [];
				const reg1 = window.onDidOpenTerminal(e => openEvents.push(e.name));
				const reg2 = window.onDidWriteTerminalData(e => dataEvents.push({ name: e.terminal.name, data: e.data }));
				const reg3 = window.onDidCloseTerminal(e => {
					closeEvents.push(e.name);
					if (closeEvents.length === 2) {
						deepEqual(openEvents, [ 'test1', 'test2' ]);
						deepEqual(dataEvents, [ { name: 'test1', data: 'write1' }, { name: 'test2', data: 'write2' } ]);
						deepEqual(closeEvents, [ 'test1', 'test2' ]);
						reg1.dispose();
						reg2.dispose();
						reg3.dispose();
						done();
					}
				});

				const term1Write = new EventEmitter<string>();
				const term1Close = new EventEmitter<void>();
				window.createTerminal({ name: 'test1', pty: {
					onDidWrite: term1Write.event,
					onDidClose: term1Close.event,
					open: () => {
						term1Write.fire('write1');
						term1Close.fire();
						const term2Write = new EventEmitter<string>();
						const term2Close = new EventEmitter<void>();
						window.createTerminal({ name: 'test2', pty: {
							onDidWrite: term2Write.event,
							onDidClose: term2Close.event,
							open: () => {
								term2Write.fire('write2');
								term2Close.fire();
							},
							close: () => {}
						}});
					},
					close: () => {}
				}});
			});
		});

		suite('Extension pty terminals', () => {
			test('should fire onDidOpenTerminal and onDidCloseTerminal', (done) => {
				const reg1 = window.onDidOpenTerminal(term => {
					equal(term.name, 'c');
					reg1.dispose();
					const reg2 = window.onDidCloseTerminal(() => {
						reg2.dispose();
						done();
					});
					term.dispose();
				});
				const pty: Pseudoterminal = {
					onDidWrite: new EventEmitter<string>().event,
					open: () => {},
					close: () => {}
				};
				window.createTerminal({ name: 'c', pty });
			});

			test('should fire Terminal.onData on write', (done) => {
				const reg1 = window.onDidOpenTerminal(async term => {
					equal(terminal, term);
					reg1.dispose();
					const reg2 = terminal.onDidWriteData(data => {
						equal(data, 'bar');
						reg2.dispose();
						const reg3 = window.onDidCloseTerminal(() => {
							reg3.dispose();
							done();
						});
						terminal.dispose();
					});
					await startPromise;
					writeEmitter.fire('bar');
				});
				let startResolve: () => void;
				const startPromise: Promise<void> = new Promise<void>(r => startResolve = r);
				const writeEmitter = new EventEmitter<string>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					open: () => startResolve(),
					close: () => {}
				};
				const terminal = window.createTerminal({ name: 'foo', pty });
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

			test('should respect dimension overrides', (done) => {
				const reg1 = window.onDidOpenTerminal(term => {
					equal(terminal, term);
					reg1.dispose();
					term.show();
					const reg2 = window.onDidChangeTerminalDimensions(e => {
						equal(e.dimensions.columns, 10);
						equal(e.dimensions.rows, 5);
						equal(e.terminal, terminal);
						reg2.dispose();
						const reg3 = window.onDidCloseTerminal(() => {
							reg3.dispose();
							done();
						});
						terminal.dispose();
					});
				});
				const writeEmitter = new EventEmitter<string>();
				const overrideDimensionsEmitter = new EventEmitter<TerminalDimensions>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					onDidOverrideDimensions: overrideDimensionsEmitter.event,
					open: () => {
						overrideDimensionsEmitter.fire({ columns: 10, rows: 5 });
					},
					close: () => {}
				};
				const terminal = window.createTerminal({ name: 'foo', pty });
			});
		});
	});
});
