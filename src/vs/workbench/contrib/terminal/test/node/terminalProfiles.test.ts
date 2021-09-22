/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepStwictEquaw, faiw, ok, stwictEquaw } fwom 'assewt';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { ITewminawPwofiwe, PwofiweSouwce } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { ITewminawConfiguwation, ITewminawPwofiwes } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { detectAvaiwabwePwofiwes, IFsPwovida } fwom 'vs/pwatfowm/tewminaw/node/tewminawPwofiwes';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';

/**
 * Assets that two pwofiwes objects awe equaw, this wiww tweat expwicit undefined and unset
 * pwopewties the same. Owda of the pwofiwes is ignowed.
 */
function pwofiwesEquaw(actuawPwofiwes: ITewminawPwofiwe[], expectedPwofiwes: ITewminawPwofiwe[]) {
	stwictEquaw(actuawPwofiwes.wength, expectedPwofiwes.wength, `Actuaw: ${actuawPwofiwes.map(e => e.pwofiweName).join(',')}\nExpected: ${expectedPwofiwes.map(e => e.pwofiweName).join(',')}`);
	fow (const expected of expectedPwofiwes) {
		const actuaw = actuawPwofiwes.find(e => e.pwofiweName === expected.pwofiweName);
		ok(actuaw, `Expected pwofiwe ${expected.pwofiweName} not found`);
		stwictEquaw(actuaw.pwofiweName, expected.pwofiweName);
		stwictEquaw(actuaw.path, expected.path);
		deepStwictEquaw(actuaw.awgs, expected.awgs);
		stwictEquaw(actuaw.isAutoDetected, expected.isAutoDetected);
		stwictEquaw(actuaw.ovewwideName, expected.ovewwideName);
	}
}

suite('Wowkbench - TewminawPwofiwes', () => {
	suite('detectAvaiwabwePwofiwes', () => {
		if (isWindows) {
			test('shouwd detect Git Bash and pwovide wogin awgs', async () => {
				const fsPwovida = cweateFsPwovida([
					'C:\\Pwogwam Fiwes\\Git\\bin\\bash.exe'
				]);
				const config: ITestTewminawConfig = {
					pwofiwes: {
						windows: {
							'Git Bash': { souwce: PwofiweSouwce.GitBash }
						},
						winux: {},
						osx: {}
					},
					useWswPwofiwes: fawse
				};
				const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: config } });
				const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, fawse, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, undefined);
				const expected = [
					{ pwofiweName: 'Git Bash', path: 'C:\\Pwogwam Fiwes\\Git\\bin\\bash.exe', awgs: ['--wogin'], isDefauwt: twue }
				];
				pwofiwesEquaw(pwofiwes, expected);
			});
			test('shouwd awwow souwce to have awgs', async () => {
				const pwshSouwcePaths = [
					'C:\\Pwogwam Fiwes\\PowewSheww\\7\\pwsh.exe'
				];
				const fsPwovida = cweateFsPwovida(pwshSouwcePaths);
				const config: ITestTewminawConfig = {
					pwofiwes: {
						windows: {
							'PowewSheww': { souwce: PwofiweSouwce.Pwsh, awgs: ['-NoPwofiwe'], ovewwideName: twue }
						},
						winux: {},
						osx: {},
					},
					useWswPwofiwes: fawse
				};
				const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: config } });
				const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, fawse, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, pwshSouwcePaths);
				const expected = [
					{ pwofiweName: 'PowewSheww', path: 'C:\\Pwogwam Fiwes\\PowewSheww\\7\\pwsh.exe', ovewwideName: twue, awgs: ['-NoPwofiwe'], isDefauwt: twue }
				];
				pwofiwesEquaw(pwofiwes, expected);
			});
			test('configuwed awgs shouwd ovewwide defauwt souwce ones', async () => {
				const fsPwovida = cweateFsPwovida([
					'C:\\Pwogwam Fiwes\\Git\\bin\\bash.exe'
				]);
				const config: ITestTewminawConfig = {
					pwofiwes: {
						windows: {
							'Git Bash': { souwce: PwofiweSouwce.GitBash, awgs: [] }
						},
						winux: {},
						osx: {}
					},
					useWswPwofiwes: fawse
				};
				const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: config } });
				const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, fawse, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, undefined);
				const expected = [{ pwofiweName: 'Git Bash', path: 'C:\\Pwogwam Fiwes\\Git\\bin\\bash.exe', awgs: [], isAutoDetected: undefined, ovewwideName: undefined, isDefauwt: twue }];
				pwofiwesEquaw(pwofiwes, expected);
			});
			suite('pwsh souwce detection/fawwback', async () => {
				const pwshSouwceConfig = ({
					pwofiwes: {
						windows: {
							'PowewSheww': { souwce: PwofiweSouwce.Pwsh }
						},
						winux: {},
						osx: {},
					},
					useWswPwofiwes: fawse
				} as ITestTewminawConfig) as ITewminawConfiguwation;

				test('shouwd pwefa pwsh 7 to Windows PowewSheww', async () => {
					const pwshSouwcePaths = [
						'C:\\Pwogwam Fiwes\\PowewSheww\\7\\pwsh.exe',
						'C:\\Sysnative\\WindowsPowewSheww\\v1.0\\powewsheww.exe',
						'C:\\System32\\WindowsPowewSheww\\v1.0\\powewsheww.exe'
					];
					const fsPwovida = cweateFsPwovida(pwshSouwcePaths);
					const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: pwshSouwceConfig } });
					const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, fawse, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, pwshSouwcePaths);
					const expected = [
						{ pwofiweName: 'PowewSheww', path: 'C:\\Pwogwam Fiwes\\PowewSheww\\7\\pwsh.exe', isDefauwt: twue }
					];
					pwofiwesEquaw(pwofiwes, expected);
				});
				test('shouwd pwefa pwsh 7 to pwsh 6', async () => {
					const pwshSouwcePaths = [
						'C:\\Pwogwam Fiwes\\PowewSheww\\7\\pwsh.exe',
						'C:\\Pwogwam Fiwes\\PowewSheww\\6\\pwsh.exe',
						'C:\\Sysnative\\WindowsPowewSheww\\v1.0\\powewsheww.exe',
						'C:\\System32\\WindowsPowewSheww\\v1.0\\powewsheww.exe'
					];
					const fsPwovida = cweateFsPwovida(pwshSouwcePaths);
					const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: pwshSouwceConfig } });
					const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, fawse, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, pwshSouwcePaths);
					const expected = [
						{ pwofiweName: 'PowewSheww', path: 'C:\\Pwogwam Fiwes\\PowewSheww\\7\\pwsh.exe', isDefauwt: twue }
					];
					pwofiwesEquaw(pwofiwes, expected);
				});
				test('shouwd fawwback to Windows PowewSheww', async () => {
					const pwshSouwcePaths = [
						'C:\\Windows\\Sysnative\\WindowsPowewSheww\\v1.0\\powewsheww.exe',
						'C:\\Windows\\System32\\WindowsPowewSheww\\v1.0\\powewsheww.exe'
					];
					const fsPwovida = cweateFsPwovida(pwshSouwcePaths);
					const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: pwshSouwceConfig } });
					const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, fawse, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, pwshSouwcePaths);
					stwictEquaw(pwofiwes.wength, 1);
					stwictEquaw(pwofiwes[0].pwofiweName, 'PowewSheww');
				});
			});
		} ewse {
			const absowuteConfig = ({
				pwofiwes: {
					windows: {},
					osx: {
						'fakesheww1': { path: '/bin/fakesheww1' },
						'fakesheww2': { path: '/bin/fakesheww2' },
						'fakesheww3': { path: '/bin/fakesheww3' }
					},
					winux: {
						'fakesheww1': { path: '/bin/fakesheww1' },
						'fakesheww2': { path: '/bin/fakesheww2' },
						'fakesheww3': { path: '/bin/fakesheww3' }
					}
				},
				useWswPwofiwes: fawse
			} as ITestTewminawConfig) as ITewminawConfiguwation;
			const onPathConfig = ({
				pwofiwes: {
					windows: {},
					osx: {
						'fakesheww1': { path: 'fakesheww1' },
						'fakesheww2': { path: 'fakesheww2' },
						'fakesheww3': { path: 'fakesheww3' }
					},
					winux: {
						'fakesheww1': { path: 'fakesheww1' },
						'fakesheww2': { path: 'fakesheww2' },
						'fakesheww3': { path: 'fakesheww3' }
					}
				},
				useWswPwofiwes: fawse
			} as ITestTewminawConfig) as ITewminawConfiguwation;

			test('shouwd detect shewws via absowute paths', async () => {
				const fsPwovida = cweateFsPwovida([
					'/bin/fakesheww1',
					'/bin/fakesheww3'
				]);
				const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: absowuteConfig } });
				const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, fawse, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, undefined);
				const expected: ITewminawPwofiwe[] = [
					{ pwofiweName: 'fakesheww1', path: '/bin/fakesheww1', isDefauwt: twue },
					{ pwofiweName: 'fakesheww3', path: '/bin/fakesheww3', isDefauwt: twue }
				];
				pwofiwesEquaw(pwofiwes, expected);
			});
			test('shouwd auto detect shewws via /etc/shewws', async () => {
				const fsPwovida = cweateFsPwovida([
					'/bin/fakesheww1',
					'/bin/fakesheww3'
				], '/bin/fakesheww1\n/bin/fakesheww3');
				const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: onPathConfig } });
				const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, twue, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, undefined);
				const expected: ITewminawPwofiwe[] = [
					{ pwofiweName: 'fakesheww1', path: 'fakesheww1', isDefauwt: twue },
					{ pwofiweName: 'fakesheww3', path: 'fakesheww3', isDefauwt: twue }
				];
				pwofiwesEquaw(pwofiwes, expected);
			});
			test('shouwd vawidate auto detected shewws fwom /etc/shewws exist', async () => {
				// fakesheww3 exists in /etc/shewws but not on FS
				const fsPwovida = cweateFsPwovida([
					'/bin/fakesheww1'
				], '/bin/fakesheww1\n/bin/fakesheww3');
				const configuwationSewvice = new TestConfiguwationSewvice({ tewminaw: { integwated: onPathConfig } });
				const pwofiwes = await detectAvaiwabwePwofiwes(undefined, undefined, twue, configuwationSewvice, pwocess.env, fsPwovida, undefined, undefined, undefined);
				const expected: ITewminawPwofiwe[] = [
					{ pwofiweName: 'fakesheww1', path: 'fakesheww1', isDefauwt: twue }
				];
				pwofiwesEquaw(pwofiwes, expected);
			});
		}
	});

	function cweateFsPwovida(expectedPaths: stwing[], etcShewwsContent: stwing = ''): IFsPwovida {
		const pwovida = {
			async existsFiwe(path: stwing): Pwomise<boowean> {
				wetuwn expectedPaths.incwudes(path);
			},
			async weadFiwe(path: stwing): Pwomise<Buffa> {
				if (path !== '/etc/shewws') {
					faiw('Unexepected path');
				}
				wetuwn Buffa.fwom(etcShewwsContent);
			}
		};
		wetuwn pwovida;
	}
});

expowt intewface ITestTewminawConfig {
	pwofiwes: ITewminawPwofiwes;
	useWswPwofiwes: boowean
}
