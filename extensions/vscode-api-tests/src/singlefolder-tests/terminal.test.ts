/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, Terminal, Pseudoterminal, EventEmitter, TerminalDimensions, workspace, ConfigurationTarget } from 'vscode';
import { doesNotThrow, equal, ok } from 'assert';

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

		test('Terminal.sendText should fire Terminal.onInput', (done) => {
			const reg1 = window.onDidOpenTerminal(terminal => {
				reg1.dispose();
				const reg2 = renderer.onDidAcceptInput(data => {
					equal(data, 'bar');
					reg2.dispose();
					const reg3 = window.onDidCloseTerminal(() => {
						reg3.dispose();
						done();
					});
					terminal.dispose();
				});
				terminal.sendText('bar', false);
			});
			const renderer = window.createTerminalRenderer('foo');
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

		suite('Terminal renderers (deprecated)', () => {
			test('should fire onDidOpenTerminal and onDidCloseTerminal from createTerminalRenderer terminal', (done) => {
				const reg1 = window.onDidOpenTerminal(term => {
					equal(term.name, 'c');
					reg1.dispose();
					const reg2 = window.onDidCloseTerminal(() => {
						reg2.dispose();
						done();
					});
					term.dispose();
				});
				window.createTerminalRenderer('c');
			});

			test('should get maximum dimensions set when shown', (done) => {
				let terminal: Terminal;
				const reg1 = window.onDidOpenTerminal(term => {
					reg1.dispose();
					term.show();
					terminal = term;
				});
				const renderer = window.createTerminalRenderer('foo');
				const reg2 = renderer.onDidChangeMaximumDimensions(dimensions => {
					ok(dimensions.columns > 0);
					ok(dimensions.rows > 0);
					reg2.dispose();
					const reg3 = window.onDidCloseTerminal(() => {
						reg3.dispose();
						done();
					});
					terminal.dispose();
				});
			});

			test('should fire Terminal.onData on write', (done) => {
				const reg1 = window.onDidOpenTerminal(terminal => {
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
					renderer.write('bar');
				});
				const renderer = window.createTerminalRenderer('foo');
			});
		});

		suite('Virtual process terminals', () => {
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

			test('should fire provide dimensions on start as the terminal has been shown', (done) => {
				const reg1 = window.onDidOpenTerminal(term => {
					equal(terminal, term);
					reg1.dispose();
				});
				const pty: Pseudoterminal = {
					onDidWrite: new EventEmitter<string>().event,
					open: (dimensions) => {
						ok(dimensions!.columns > 0);
						ok(dimensions!.rows > 0);
						const reg3 = window.onDidCloseTerminal(() => {
							reg3.dispose();
							done();
						});
						terminal.dispose();
					},
					close: () => {}
				};
				const terminal = window.createTerminal({ name: 'foo', pty });
			});

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
					overrideDimensionsEmitter.fire({ columns: 10, rows: 5 });
				});
				const writeEmitter = new EventEmitter<string>();
				const overrideDimensionsEmitter = new EventEmitter<TerminalDimensions>();
				const pty: Pseudoterminal = {
					onDidWrite: writeEmitter.event,
					onDidOverrideDimensions: overrideDimensionsEmitter.event,
					open: () => {},
					close: () => {}
				};
				const terminal = window.createTerminal({ name: 'foo', pty });
			});
		});
	});
});
