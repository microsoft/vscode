/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

suite('platform - terminalEnvironment', () => {
	// suite('injectShellIntegrationArgs', () => {
	// 	const env = {} as IProcessEnvironment;
	// 	const logService = new NullLogService();
	// 	const configurationService = new TestConfigurationService();
	// 	let shellIntegrationEnabled = true;

	// 	suite('should not enable', () => {
	// 		const executable = OS ? 'pwsh.exe' : 'pwsh';
	// 		test('when isFeatureTerminal or when no executable is provided', () => {
	// 			let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-l', '-NoLogo'], isFeatureTerminal: true }, OS);
	// 			terminalProfileArgsMatch(args, ['-l', '-NoLogo']);
	// 			strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 			({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { args: [] }, OS));
	// 			terminalProfileArgsMatch(args, []);
	// 			strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 		});
	// 	});

	// 	suite('pwsh', () => {

	// 		let executable = OS ? 'pwsh.exe' : 'pwsh';

	// 		suite('should override args', () => {
	// 			const expectedArgs = OS ? shellIntegrationArgs.get(ShellIntegrationExecutable.Pwsh) : shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwsh);
	// 			test('when undefined, [], empty string, or empty string in array', () => {
	// 				let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: [''] }, OS);
	// 				terminalProfileArgsMatch(args, expectedArgs);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: [] }, OS));
	// 				terminalProfileArgsMatch(args, expectedArgs);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: undefined }, OS));
	// 				terminalProfileArgsMatch(args, expectedArgs);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '' }, OS));
	// 				terminalProfileArgsMatch(args, expectedArgs);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 			});
	// 			suite('when no logo', () => {
	// 				test('array - case insensitive', () => {
	// 					let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-NoLogo'] }, OS);
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-NOLOGO'] }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-nol'] }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-NOL'] }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				});
	// 				test('string - case insensitive', () => {
	// 					let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-NoLogo' }, OS);
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-NOLOGO' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-nol' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-Nol' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				});
	// 				test('regardless of executable case', () => {
	// 					executable = OS ? 'pwSh.exe' : 'PWsh';
	// 					let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-NoLogo' }, OS);
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-NOLOGO' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-nol' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-Nol' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					executable = OS ? 'pwsh.exe' : 'pwsh';
	// 				});
	// 			});
	// 		});
	// 		suite('should incorporate login arg', () => {
	// 			const expectedArgs = OS ? shellIntegrationArgs.get(ShellIntegrationExecutable.PwshLogin) : shellIntegrationArgs.get(ShellIntegrationExecutable.WindowsPwshLogin);
	// 			test('when array contains no logo and login', () => {
	// 				const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-l', '-NoLogo'] }, OS);
	// 				terminalProfileArgsMatch(args, expectedArgs);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 			});
	// 			test('when string', () => {
	// 				const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-l' }, OS);
	// 				terminalProfileArgsMatch(args, expectedArgs);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 			});
	// 		});
	// 		suite('should not modify args', () => {
	// 			shellIntegrationEnabled = false;
	// 			test('when shell integration is disabled', () => {
	// 				let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-l' }, OS);
	// 				strictEqual(args, '-l');
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: undefined }, OS));
	// 				strictEqual(args, undefined);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 			});
	// 			test('when custom array entry', () => {
	// 				const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-l', '-NoLogo', '-i'] }, OS);
	// 				terminalProfileArgsMatch(args, ['-l', '-NoLogo', '-i']);
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 			});
	// 			test('when custom string', () => {
	// 				const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-i' }, OS);
	// 				terminalProfileArgsMatch(args, '-i');
	// 				strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 			});
	// 		});
	// 	});

	// 	if (OS !== OperatingSystem.Windows) {
	// 		suite('zsh', () => {

	// 			let executable = 'zsh';

	// 			suite('should override args', () => {
	// 				const expectedArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Zsh);
	// 				test('when undefined, [], empty string, or empty string in array', () => {
	// 					let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: [''] }, OS);
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: [] }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: undefined }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				});
	// 				suite('should incorporate login arg', () => {
	// 					const expectedArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.ZshLogin);
	// 					test('when array', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-l'] }, OS);
	// 						terminalProfileArgsMatch(args, expectedArgs);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 					test('when string', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-l' }, OS);
	// 						terminalProfileArgsMatch(args, expectedArgs);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 					test('regardless of executable case', () => {
	// 						executable = 'ZSH';
	// 						let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable }, OS);
	// 						terminalProfileArgsMatch(args, expectedArgs);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 						executable = 'zsh';
	// 					});
	// 				});
	// 				suite('should not modify args', () => {
	// 					shellIntegrationEnabled = false;
	// 					test('when shell integration is disabled', () => {
	// 						let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-l' }, OS);
	// 						strictEqual(args, '-l');
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 						({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: undefined }, OS));
	// 						strictEqual(args, undefined);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 					test('when custom array entry', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-l', '-i'] }, OS);
	// 						terminalProfileArgsMatch(args, ['-l', '-i']);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 					test('when custom string', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-i' }, OS);
	// 						terminalProfileArgsMatch(args, '-i');
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 				});
	// 			});
	// 		});
	// 		suite('bash', () => {
	// 			let executable = 'bash';

	// 			suite('should override args', () => {
	// 				const expectedArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
	// 				test('when undefined, [], empty string, or empty string in array', () => {
	// 					let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: [''] }, OS);
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: [] }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: undefined }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '' }, OS));
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				});
	// 				test('regardless of executable case', () => {
	// 					executable = 'BasH';
	// 					let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: [''] }, OS);
	// 					terminalProfileArgsMatch(args, expectedArgs);
	// 					strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 				});
	// 				suite('should set login env variable and not modify args', () => {
	// 					const expectedArgs = shellIntegrationArgs.get(ShellIntegrationExecutable.Bash);
	// 					test('when array', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-l'] }, OS);
	// 						terminalProfileArgsMatch(args, expectedArgs);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 					test('when string', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-l' }, OS);
	// 						terminalProfileArgsMatch(args, expectedArgs);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 				});
	// 				suite('should not modify args', () => {
	// 					shellIntegrationEnabled = false;
	// 					test('when shell integration is disabled', () => {
	// 						let { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-l' }, OS);
	// 						strictEqual(args, '-l');
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 						({ args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: undefined }, OS));
	// 						strictEqual(args, undefined);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 					test('when custom array entry', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: ['-l', '-i'] }, OS);
	// 						terminalProfileArgsMatch(args, ['-l', '-i']);
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 					test('when custom string', () => {
	// 						const { args, enableShellIntegration } = injectShellIntegrationArgs(logService, configurationService, env, shellIntegrationEnabled, { executable, args: '-i' }, OS);
	// 						terminalProfileArgsMatch(args, '-i');
	// 						strictEqual(enableShellIntegration, shellIntegrationEnabled);
	// 					});
	// 				});
	// 			});
	// 		});
	// 	}
	// });
});
