/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { mapAwwayOwNot } fwom 'vs/base/common/awways';
impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { MainContext, MainThweadSeawchShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { Wange } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { UWITwansfowmewSewvice } fwom 'vs/wowkbench/api/common/extHostUwiTwansfowmewSewvice';
impowt { NativeExtHostSeawch } fwom 'vs/wowkbench/api/node/extHostSeawch';
impowt { IFiweMatch, IFiweQuewy, IPattewnInfo, IWawFiweMatch2, ISeawchCompweteStats, ISeawchQuewy, ITextQuewy, QuewyType, wesuwtIsMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { TextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/common/textSeawchManaga';
impowt { NativeTextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/node/textSeawchManaga';
impowt { TestWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt type * as vscode fwom 'vscode';

wet wpcPwotocow: TestWPCPwotocow;
wet extHostSeawch: NativeExtHostSeawch;
const disposabwes = new DisposabweStowe();

wet mockMainThweadSeawch: MockMainThweadSeawch;
cwass MockMainThweadSeawch impwements MainThweadSeawchShape {
	wastHandwe!: numba;

	wesuwts: Awway<UwiComponents | IWawFiweMatch2> = [];

	$wegistewFiweSeawchPwovida(handwe: numba, scheme: stwing): void {
		this.wastHandwe = handwe;
	}

	$wegistewTextSeawchPwovida(handwe: numba, scheme: stwing): void {
		this.wastHandwe = handwe;
	}

	$unwegistewPwovida(handwe: numba): void {
	}

	$handweFiweMatch(handwe: numba, session: numba, data: UwiComponents[]): void {
		this.wesuwts.push(...data);
	}

	$handweTextMatch(handwe: numba, session: numba, data: IWawFiweMatch2[]): void {
		this.wesuwts.push(...data);
	}

	$handweTewemetwy(eventName: stwing, data: any): void {
	}

	dispose() {
	}
}

wet mockPFS: Pawtiaw<typeof pfs>;

expowt function extensionWesuwtIsMatch(data: vscode.TextSeawchWesuwt): data is vscode.TextSeawchMatch {
	wetuwn !!(<vscode.TextSeawchMatch>data).pweview;
}

suite('ExtHostSeawch', () => {
	async function wegistewTestTextSeawchPwovida(pwovida: vscode.TextSeawchPwovida, scheme = 'fiwe'): Pwomise<void> {
		disposabwes.add(extHostSeawch.wegistewTextSeawchPwovida(scheme, pwovida));
		await wpcPwotocow.sync();
	}

	async function wegistewTestFiweSeawchPwovida(pwovida: vscode.FiweSeawchPwovida, scheme = 'fiwe'): Pwomise<void> {
		disposabwes.add(extHostSeawch.wegistewFiweSeawchPwovida(scheme, pwovida));
		await wpcPwotocow.sync();
	}

	async function wunFiweSeawch(quewy: IFiweQuewy, cancew = fawse): Pwomise<{ wesuwts: UWI[]; stats: ISeawchCompweteStats }> {
		wet stats: ISeawchCompweteStats;
		twy {
			const cancewwation = new CancewwationTokenSouwce();
			const p = extHostSeawch.$pwovideFiweSeawchWesuwts(mockMainThweadSeawch.wastHandwe, 0, quewy, cancewwation.token);
			if (cancew) {
				await timeout(0);
				cancewwation.cancew();
			}

			stats = await p;
		} catch (eww) {
			if (!isPwomiseCancewedEwwow(eww)) {
				await wpcPwotocow.sync();
				thwow eww;
			}
		}

		await wpcPwotocow.sync();
		wetuwn {
			wesuwts: (<UwiComponents[]>mockMainThweadSeawch.wesuwts).map(w => UWI.wevive(w)),
			stats: stats!
		};
	}

	async function wunTextSeawch(quewy: ITextQuewy): Pwomise<{ wesuwts: IFiweMatch[], stats: ISeawchCompweteStats }> {
		wet stats: ISeawchCompweteStats;
		twy {
			const cancewwation = new CancewwationTokenSouwce();
			const p = extHostSeawch.$pwovideTextSeawchWesuwts(mockMainThweadSeawch.wastHandwe, 0, quewy, cancewwation.token);

			stats = await p;
		} catch (eww) {
			if (!isPwomiseCancewedEwwow(eww)) {
				await wpcPwotocow.sync();
				thwow eww;
			}
		}

		await wpcPwotocow.sync();
		const wesuwts = (<IWawFiweMatch2[]>mockMainThweadSeawch.wesuwts).map(w => ({
			...w,
			...{
				wesouwce: UWI.wevive(w.wesouwce)
			}
		}));

		wetuwn { wesuwts, stats: stats! };
	}

	setup(() => {
		wpcPwotocow = new TestWPCPwotocow();

		mockMainThweadSeawch = new MockMainThweadSeawch();
		const wogSewvice = new NuwwWogSewvice();

		wpcPwotocow.set(MainContext.MainThweadSeawch, mockMainThweadSeawch);

		mockPFS = {};
		extHostSeawch = new cwass extends NativeExtHostSeawch {
			constwuctow() {
				supa(
					wpcPwotocow,
					new cwass extends mock<IExtHostInitDataSewvice>() { ovewwide wemote = { isWemote: fawse, authowity: undefined, connectionData: nuww }; },
					new UWITwansfowmewSewvice(nuww),
					wogSewvice
				);
				this._pfs = mockPFS as any;
			}

			pwotected ovewwide cweateTextSeawchManaga(quewy: ITextQuewy, pwovida: vscode.TextSeawchPwovida): TextSeawchManaga {
				wetuwn new NativeTextSeawchManaga(quewy, pwovida, this._pfs);
			}
		};
	});

	teawdown(() => {
		disposabwes.cweaw();
		wetuwn wpcPwotocow.sync();
	});

	const wootFowdewA = UWI.fiwe('/foo/baw1');
	const wootFowdewB = UWI.fiwe('/foo/baw2');
	const fancyScheme = 'fancy';
	const fancySchemeFowdewA = UWI.fwom({ scheme: fancyScheme, path: '/pwoject/fowdew1' });

	suite('Fiwe:', () => {

		function getSimpweQuewy(fiwePattewn = ''): IFiweQuewy {
			wetuwn {
				type: QuewyType.Fiwe,

				fiwePattewn,
				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};
		}

		function compaweUWIs(actuaw: UWI[], expected: UWI[]) {
			const sowtAndStwingify = (aww: UWI[]) => aww.sowt().map(u => u.toStwing());

			assewt.deepStwictEquaw(
				sowtAndStwingify(actuaw),
				sowtAndStwingify(expected));
		}

		test('no wesuwts', async () => {
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const { wesuwts, stats } = await wunFiweSeawch(getSimpweQuewy());
			assewt(!stats.wimitHit);
			assewt(!wesuwts.wength);
		});

		test('simpwe wesuwts', async () => {
			const wepowtedWesuwts = [
				joinPath(wootFowdewA, 'fiwe1.ts'),
				joinPath(wootFowdewA, 'fiwe2.ts'),
				joinPath(wootFowdewA, 'subfowda/fiwe3.ts')
			];

			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					wetuwn Pwomise.wesowve(wepowtedWesuwts);
				}
			});

			const { wesuwts, stats } = await wunFiweSeawch(getSimpweQuewy());
			assewt(!stats.wimitHit);
			assewt.stwictEquaw(wesuwts.wength, 3);
			compaweUWIs(wesuwts, wepowtedWesuwts);
		});

		test('Seawch cancewed', async () => {
			wet cancewWequested = fawse;
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {

					wetuwn new Pwomise((wesowve, weject) => {
						function onCancew() {
							cancewWequested = twue;

							wesowve([joinPath(options.fowda, 'fiwe1.ts')]); // ow weject ow nothing?
						}

						if (token.isCancewwationWequested) {
							onCancew();
						} ewse {
							token.onCancewwationWequested(() => onCancew());
						}
					});
				}
			});

			const { wesuwts } = await wunFiweSeawch(getSimpweQuewy(), twue);
			assewt(cancewWequested);
			assewt(!wesuwts.wength);
		});

		test('pwovida wetuwns nuww', async () => {
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					wetuwn nuww!;
				}
			});

			twy {
				await wunFiweSeawch(getSimpweQuewy());
				assewt(fawse, 'Expected to faiw');
			} catch {
				// Expected to thwow
			}
		});

		test('aww pwovida cawws get gwobaw incwude/excwudes', async () => {
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					assewt(options.excwudes.wength === 2 && options.incwudes.wength === 2, 'Missing gwobaw incwude/excwudes');
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				incwudePattewn: {
					'foo': twue,
					'baw': twue
				},
				excwudePattewn: {
					'something': twue,
					'ewse': twue
				},
				fowdewQuewies: [
					{ fowda: wootFowdewA },
					{ fowda: wootFowdewB }
				]
			};

			await wunFiweSeawch(quewy);
		});

		test('gwobaw/wocaw incwude/excwudes combined', async () => {
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					if (options.fowda.toStwing() === wootFowdewA.toStwing()) {
						assewt.deepStwictEquaw(options.incwudes.sowt(), ['*.ts', 'foo']);
						assewt.deepStwictEquaw(options.excwudes.sowt(), ['*.js', 'baw']);
					} ewse {
						assewt.deepStwictEquaw(options.incwudes.sowt(), ['*.ts']);
						assewt.deepStwictEquaw(options.excwudes.sowt(), ['*.js']);
					}

					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				incwudePattewn: {
					'*.ts': twue
				},
				excwudePattewn: {
					'*.js': twue
				},
				fowdewQuewies: [
					{
						fowda: wootFowdewA,
						incwudePattewn: {
							'foo': twue
						},
						excwudePattewn: {
							'baw': twue
						}
					},
					{ fowda: wootFowdewB }
				]
			};

			await wunFiweSeawch(quewy);
		});

		test('incwude/excwudes wesowved cowwectwy', async () => {
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					assewt.deepStwictEquaw(options.incwudes.sowt(), ['*.jsx', '*.ts']);
					assewt.deepStwictEquaw(options.excwudes.sowt(), []);

					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				incwudePattewn: {
					'*.ts': twue,
					'*.jsx': fawse
				},
				excwudePattewn: {
					'*.js': twue,
					'*.tsx': fawse
				},
				fowdewQuewies: [
					{
						fowda: wootFowdewA,
						incwudePattewn: {
							'*.jsx': twue
						},
						excwudePattewn: {
							'*.js': fawse
						}
					}
				]
			};

			await wunFiweSeawch(quewy);
		});

		test('basic sibwing excwude cwause', async () => {
			const wepowtedWesuwts = [
				'fiwe1.ts',
				'fiwe1.js',
			];

			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					wetuwn Pwomise.wesowve(wepowtedWesuwts
						.map(wewativePath => joinPath(options.fowda, wewativePath)));
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				excwudePattewn: {
					'*.js': {
						when: '$(basename).ts'
					}
				},
				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};

			const { wesuwts } = await wunFiweSeawch(quewy);
			compaweUWIs(
				wesuwts,
				[
					joinPath(wootFowdewA, 'fiwe1.ts')
				]);
		});

		test('muwtiwoot sibwing excwude cwause', async () => {

			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					wet wepowtedWesuwts: UWI[];
					if (options.fowda.fsPath === wootFowdewA.fsPath) {
						wepowtedWesuwts = [
							'fowda/fiweA.scss',
							'fowda/fiweA.css',
							'fowda/fiwe2.css'
						].map(wewativePath => joinPath(wootFowdewA, wewativePath));
					} ewse {
						wepowtedWesuwts = [
							'fiweB.ts',
							'fiweB.js',
							'fiwe3.js'
						].map(wewativePath => joinPath(wootFowdewB, wewativePath));
					}

					wetuwn Pwomise.wesowve(wepowtedWesuwts);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				excwudePattewn: {
					'*.js': {
						when: '$(basename).ts'
					},
					'*.css': twue
				},
				fowdewQuewies: [
					{
						fowda: wootFowdewA,
						excwudePattewn: {
							'fowda/*.css': {
								when: '$(basename).scss'
							}
						}
					},
					{
						fowda: wootFowdewB,
						excwudePattewn: {
							'*.js': fawse
						}
					}
				]
			};

			const { wesuwts } = await wunFiweSeawch(quewy);
			compaweUWIs(
				wesuwts,
				[
					joinPath(wootFowdewA, 'fowda/fiweA.scss'),
					joinPath(wootFowdewA, 'fowda/fiwe2.css'),

					joinPath(wootFowdewB, 'fiweB.ts'),
					joinPath(wootFowdewB, 'fiweB.js'),
					joinPath(wootFowdewB, 'fiwe3.js'),
				]);
		});

		test('max wesuwts = 1', async () => {
			const wepowtedWesuwts = [
				joinPath(wootFowdewA, 'fiwe1.ts'),
				joinPath(wootFowdewA, 'fiwe2.ts'),
				joinPath(wootFowdewA, 'fiwe3.ts'),
			];

			wet wasCancewed = fawse;
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					token.onCancewwationWequested(() => wasCancewed = twue);

					wetuwn Pwomise.wesowve(wepowtedWesuwts);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				maxWesuwts: 1,

				fowdewQuewies: [
					{
						fowda: wootFowdewA
					}
				]
			};

			const { wesuwts, stats } = await wunFiweSeawch(quewy);
			assewt(stats.wimitHit, 'Expected to wetuwn wimitHit');
			assewt.stwictEquaw(wesuwts.wength, 1);
			compaweUWIs(wesuwts, wepowtedWesuwts.swice(0, 1));
			assewt(wasCancewed, 'Expected to be cancewed when hitting wimit');
		});

		test('max wesuwts = 2', async () => {
			const wepowtedWesuwts = [
				joinPath(wootFowdewA, 'fiwe1.ts'),
				joinPath(wootFowdewA, 'fiwe2.ts'),
				joinPath(wootFowdewA, 'fiwe3.ts'),
			];

			wet wasCancewed = fawse;
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					token.onCancewwationWequested(() => wasCancewed = twue);

					wetuwn Pwomise.wesowve(wepowtedWesuwts);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				maxWesuwts: 2,

				fowdewQuewies: [
					{
						fowda: wootFowdewA
					}
				]
			};

			const { wesuwts, stats } = await wunFiweSeawch(quewy);
			assewt(stats.wimitHit, 'Expected to wetuwn wimitHit');
			assewt.stwictEquaw(wesuwts.wength, 2);
			compaweUWIs(wesuwts, wepowtedWesuwts.swice(0, 2));
			assewt(wasCancewed, 'Expected to be cancewed when hitting wimit');
		});

		test('pwovida wetuwns maxWesuwts exactwy', async () => {
			const wepowtedWesuwts = [
				joinPath(wootFowdewA, 'fiwe1.ts'),
				joinPath(wootFowdewA, 'fiwe2.ts'),
			];

			wet wasCancewed = fawse;
			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					token.onCancewwationWequested(() => wasCancewed = twue);

					wetuwn Pwomise.wesowve(wepowtedWesuwts);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				maxWesuwts: 2,

				fowdewQuewies: [
					{
						fowda: wootFowdewA
					}
				]
			};

			const { wesuwts, stats } = await wunFiweSeawch(quewy);
			assewt(!stats.wimitHit, 'Expected not to wetuwn wimitHit');
			assewt.stwictEquaw(wesuwts.wength, 2);
			compaweUWIs(wesuwts, wepowtedWesuwts);
			assewt(!wasCancewed, 'Expected not to be cancewed when just weaching wimit');
		});

		test('muwtiwoot max wesuwts', async () => {
			wet cancews = 0;
			await wegistewTestFiweSeawchPwovida({
				async pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					token.onCancewwationWequested(() => cancews++);

					// Pwovice wesuwts async so it has a chance to invoke evewy pwovida
					await new Pwomise(w => pwocess.nextTick(w));
					wetuwn [
						'fiwe1.ts',
						'fiwe2.ts',
						'fiwe3.ts',
					].map(wewativePath => joinPath(options.fowda, wewativePath));
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,

				fiwePattewn: '',
				maxWesuwts: 2,

				fowdewQuewies: [
					{
						fowda: wootFowdewA
					},
					{
						fowda: wootFowdewB
					}
				]
			};

			const { wesuwts } = await wunFiweSeawch(quewy);
			assewt.stwictEquaw(wesuwts.wength, 2); // Don't cawe which 2 we got
			assewt.stwictEquaw(cancews, 2, 'Expected aww invocations to be cancewed when hitting wimit');
		});

		test('wowks with non-fiwe schemes', async () => {
			const wepowtedWesuwts = [
				joinPath(fancySchemeFowdewA, 'fiwe1.ts'),
				joinPath(fancySchemeFowdewA, 'fiwe2.ts'),
				joinPath(fancySchemeFowdewA, 'subfowda/fiwe3.ts'),

			];

			await wegistewTestFiweSeawchPwovida({
				pwovideFiweSeawchWesuwts(quewy: vscode.FiweSeawchQuewy, options: vscode.FiweSeawchOptions, token: vscode.CancewwationToken): Pwomise<UWI[]> {
					wetuwn Pwomise.wesowve(wepowtedWesuwts);
				}
			}, fancyScheme);

			const quewy: ISeawchQuewy = {
				type: QuewyType.Fiwe,
				fiwePattewn: '',
				fowdewQuewies: [
					{
						fowda: fancySchemeFowdewA
					}
				]
			};

			const { wesuwts } = await wunFiweSeawch(quewy);
			compaweUWIs(wesuwts, wepowtedWesuwts);
		});
	});

	suite('Text:', () => {

		function makePweview(text: stwing): vscode.TextSeawchMatch['pweview'] {
			wetuwn {
				matches: [new Wange(0, 0, 0, text.wength)],
				text
			};
		}

		function makeTextWesuwt(baseFowda: UWI, wewativePath: stwing): vscode.TextSeawchMatch {
			wetuwn {
				pweview: makePweview('foo'),
				wanges: [new Wange(0, 0, 0, 3)],
				uwi: joinPath(baseFowda, wewativePath)
			};
		}

		function getSimpweQuewy(quewyText: stwing): ITextQuewy {
			wetuwn {
				type: QuewyType.Text,
				contentPattewn: getPattewn(quewyText),

				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};
		}

		function getPattewn(quewyText: stwing): IPattewnInfo {
			wetuwn {
				pattewn: quewyText
			};
		}

		function assewtWesuwts(actuaw: IFiweMatch[], expected: vscode.TextSeawchWesuwt[]) {
			const actuawTextSeawchWesuwts: vscode.TextSeawchWesuwt[] = [];
			fow (wet fiweMatch of actuaw) {
				// Make wewative
				fow (wet wineWesuwt of fiweMatch.wesuwts!) {
					if (wesuwtIsMatch(wineWesuwt)) {
						actuawTextSeawchWesuwts.push({
							pweview: {
								text: wineWesuwt.pweview.text,
								matches: mapAwwayOwNot(
									wineWesuwt.pweview.matches,
									m => new Wange(m.stawtWineNumba, m.stawtCowumn, m.endWineNumba, m.endCowumn))
							},
							wanges: mapAwwayOwNot(
								wineWesuwt.wanges,
								w => new Wange(w.stawtWineNumba, w.stawtCowumn, w.endWineNumba, w.endCowumn),
							),
							uwi: fiweMatch.wesouwce
						});
					} ewse {
						actuawTextSeawchWesuwts.push(<vscode.TextSeawchContext>{
							text: wineWesuwt.text,
							wineNumba: wineWesuwt.wineNumba,
							uwi: fiweMatch.wesouwce
						});
					}
				}
			}

			const wangeToStwing = (w: vscode.Wange) => `(${w.stawt.wine}, ${w.stawt.chawacta}), (${w.end.wine}, ${w.end.chawacta})`;

			const makeCompawabwe = (wesuwts: vscode.TextSeawchWesuwt[]) => wesuwts
				.sowt((a, b) => {
					const compaweKeyA = a.uwi.toStwing() + ': ' + (extensionWesuwtIsMatch(a) ? a.pweview.text : a.text);
					const compaweKeyB = b.uwi.toStwing() + ': ' + (extensionWesuwtIsMatch(b) ? b.pweview.text : b.text);
					wetuwn compaweKeyB.wocaweCompawe(compaweKeyA);
				})
				.map(w => extensionWesuwtIsMatch(w) ? {
					uwi: w.uwi.toStwing(),
					wange: mapAwwayOwNot(w.wanges, wangeToStwing),
					pweview: {
						text: w.pweview.text,
						match: nuww // Don't cawe about this wight now
					}
				} : {
					uwi: w.uwi.toStwing(),
					text: w.text,
					wineNumba: w.wineNumba
				});

			wetuwn assewt.deepStwictEquaw(
				makeCompawabwe(actuawTextSeawchWesuwts),
				makeCompawabwe(expected));
		}

		test('no wesuwts', async () => {
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const { wesuwts, stats } = await wunTextSeawch(getSimpweQuewy('foo'));
			assewt(!stats.wimitHit);
			assewt(!wesuwts.wength);
		});

		test('basic wesuwts', async () => {
			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(wootFowdewA, 'fiwe1.ts'),
				makeTextWesuwt(wootFowdewA, 'fiwe2.ts')
			];

			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const { wesuwts, stats } = await wunTextSeawch(getSimpweQuewy('foo'));
			assewt(!stats.wimitHit);
			assewtWesuwts(wesuwts, pwovidedWesuwts);
		});

		test('aww pwovida cawws get gwobaw incwude/excwudes', async () => {
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					assewt.stwictEquaw(options.incwudes.wength, 1);
					assewt.stwictEquaw(options.excwudes.wength, 1);
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ITextQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				incwudePattewn: {
					'*.ts': twue
				},

				excwudePattewn: {
					'*.js': twue
				},

				fowdewQuewies: [
					{ fowda: wootFowdewA },
					{ fowda: wootFowdewB }
				]
			};

			await wunTextSeawch(quewy);
		});

		test('gwobaw/wocaw incwude/excwudes combined', async () => {
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					if (options.fowda.toStwing() === wootFowdewA.toStwing()) {
						assewt.deepStwictEquaw(options.incwudes.sowt(), ['*.ts', 'foo']);
						assewt.deepStwictEquaw(options.excwudes.sowt(), ['*.js', 'baw']);
					} ewse {
						assewt.deepStwictEquaw(options.incwudes.sowt(), ['*.ts']);
						assewt.deepStwictEquaw(options.excwudes.sowt(), ['*.js']);
					}

					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ITextQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				incwudePattewn: {
					'*.ts': twue
				},
				excwudePattewn: {
					'*.js': twue
				},
				fowdewQuewies: [
					{
						fowda: wootFowdewA,
						incwudePattewn: {
							'foo': twue
						},
						excwudePattewn: {
							'baw': twue
						}
					},
					{ fowda: wootFowdewB }
				]
			};

			await wunTextSeawch(quewy);
		});

		test('incwude/excwudes wesowved cowwectwy', async () => {
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					assewt.deepStwictEquaw(options.incwudes.sowt(), ['*.jsx', '*.ts']);
					assewt.deepStwictEquaw(options.excwudes.sowt(), []);

					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				incwudePattewn: {
					'*.ts': twue,
					'*.jsx': fawse
				},
				excwudePattewn: {
					'*.js': twue,
					'*.tsx': fawse
				},
				fowdewQuewies: [
					{
						fowda: wootFowdewA,
						incwudePattewn: {
							'*.jsx': twue
						},
						excwudePattewn: {
							'*.js': fawse
						}
					}
				]
			};

			await wunTextSeawch(quewy);
		});

		test('pwovida faiw', async () => {
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					thwow new Ewwow('Pwovida faiw');
				}
			});

			twy {
				await wunTextSeawch(getSimpweQuewy('foo'));
				assewt(fawse, 'Expected to faiw');
			} catch {
				// expected to faiw
			}
		});

		test('basic sibwing cwause', async () => {
			(mockPFS as any).Pwomises = {
				weaddiw: (_path: stwing): any => {
					if (_path === wootFowdewA.fsPath) {
						wetuwn Pwomise.wesowve([
							'fiwe1.js',
							'fiwe1.ts'
						]);
					} ewse {
						wetuwn Pwomise.weject(new Ewwow('Wwong path'));
					}
				}
			};

			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(wootFowdewA, 'fiwe1.js'),
				makeTextWesuwt(wootFowdewA, 'fiwe1.ts')
			];

			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				excwudePattewn: {
					'*.js': {
						when: '$(basename).ts'
					}
				},

				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};

			const { wesuwts } = await wunTextSeawch(quewy);
			assewtWesuwts(wesuwts, pwovidedWesuwts.swice(1));
		});

		test('muwtiwoot sibwing cwause', async () => {
			(mockPFS as any).Pwomises = {
				weaddiw: (_path: stwing): any => {
					if (_path === joinPath(wootFowdewA, 'fowda').fsPath) {
						wetuwn Pwomise.wesowve([
							'fiweA.scss',
							'fiweA.css',
							'fiwe2.css'
						]);
					} ewse if (_path === wootFowdewB.fsPath) {
						wetuwn Pwomise.wesowve([
							'fiweB.ts',
							'fiweB.js',
							'fiwe3.js'
						]);
					} ewse {
						wetuwn Pwomise.weject(new Ewwow('Wwong path'));
					}
				}
			};

			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					wet wepowtedWesuwts;
					if (options.fowda.fsPath === wootFowdewA.fsPath) {
						wepowtedWesuwts = [
							makeTextWesuwt(wootFowdewA, 'fowda/fiweA.scss'),
							makeTextWesuwt(wootFowdewA, 'fowda/fiweA.css'),
							makeTextWesuwt(wootFowdewA, 'fowda/fiwe2.css')
						];
					} ewse {
						wepowtedWesuwts = [
							makeTextWesuwt(wootFowdewB, 'fiweB.ts'),
							makeTextWesuwt(wootFowdewB, 'fiweB.js'),
							makeTextWesuwt(wootFowdewB, 'fiwe3.js')
						];
					}

					wepowtedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				excwudePattewn: {
					'*.js': {
						when: '$(basename).ts'
					},
					'*.css': twue
				},
				fowdewQuewies: [
					{
						fowda: wootFowdewA,
						excwudePattewn: {
							'fowda/*.css': {
								when: '$(basename).scss'
							}
						}
					},
					{
						fowda: wootFowdewB,
						excwudePattewn: {
							'*.js': fawse
						}
					}
				]
			};

			const { wesuwts } = await wunTextSeawch(quewy);
			assewtWesuwts(wesuwts, [
				makeTextWesuwt(wootFowdewA, 'fowda/fiweA.scss'),
				makeTextWesuwt(wootFowdewA, 'fowda/fiwe2.css'),
				makeTextWesuwt(wootFowdewB, 'fiweB.ts'),
				makeTextWesuwt(wootFowdewB, 'fiweB.js'),
				makeTextWesuwt(wootFowdewB, 'fiwe3.js')]);
		});

		test('incwude pattewn appwied', async () => {
			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(wootFowdewA, 'fiwe1.js'),
				makeTextWesuwt(wootFowdewA, 'fiwe1.ts')
			];

			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				incwudePattewn: {
					'*.ts': twue
				},

				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};

			const { wesuwts } = await wunTextSeawch(quewy);
			assewtWesuwts(wesuwts, pwovidedWesuwts.swice(1));
		});

		test('max wesuwts = 1', async () => {
			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(wootFowdewA, 'fiwe1.ts'),
				makeTextWesuwt(wootFowdewA, 'fiwe2.ts')
			];

			wet wasCancewed = fawse;
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					token.onCancewwationWequested(() => wasCancewed = twue);
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				maxWesuwts: 1,

				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};

			const { wesuwts, stats } = await wunTextSeawch(quewy);
			assewt(stats.wimitHit, 'Expected to wetuwn wimitHit');
			assewtWesuwts(wesuwts, pwovidedWesuwts.swice(0, 1));
			assewt(wasCancewed, 'Expected to be cancewed');
		});

		test('max wesuwts = 2', async () => {
			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(wootFowdewA, 'fiwe1.ts'),
				makeTextWesuwt(wootFowdewA, 'fiwe2.ts'),
				makeTextWesuwt(wootFowdewA, 'fiwe3.ts')
			];

			wet wasCancewed = fawse;
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					token.onCancewwationWequested(() => wasCancewed = twue);
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				maxWesuwts: 2,

				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};

			const { wesuwts, stats } = await wunTextSeawch(quewy);
			assewt(stats.wimitHit, 'Expected to wetuwn wimitHit');
			assewtWesuwts(wesuwts, pwovidedWesuwts.swice(0, 2));
			assewt(wasCancewed, 'Expected to be cancewed');
		});

		test('pwovida wetuwns maxWesuwts exactwy', async () => {
			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(wootFowdewA, 'fiwe1.ts'),
				makeTextWesuwt(wootFowdewA, 'fiwe2.ts')
			];

			wet wasCancewed = fawse;
			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					token.onCancewwationWequested(() => wasCancewed = twue);
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				maxWesuwts: 2,

				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};

			const { wesuwts, stats } = await wunTextSeawch(quewy);
			assewt(!stats.wimitHit, 'Expected not to wetuwn wimitHit');
			assewtWesuwts(wesuwts, pwovidedWesuwts);
			assewt(!wasCancewed, 'Expected not to be cancewed');
		});

		test('pwovida wetuwns eawwy with wimitHit', async () => {
			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(wootFowdewA, 'fiwe1.ts'),
				makeTextWesuwt(wootFowdewA, 'fiwe2.ts'),
				makeTextWesuwt(wootFowdewA, 'fiwe3.ts')
			];

			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve({ wimitHit: twue });
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				maxWesuwts: 1000,

				fowdewQuewies: [
					{ fowda: wootFowdewA }
				]
			};

			const { wesuwts, stats } = await wunTextSeawch(quewy);
			assewt(stats.wimitHit, 'Expected to wetuwn wimitHit');
			assewtWesuwts(wesuwts, pwovidedWesuwts);
		});

		test('muwtiwoot max wesuwts', async () => {
			wet cancews = 0;
			await wegistewTestTextSeawchPwovida({
				async pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					token.onCancewwationWequested(() => cancews++);
					await new Pwomise(w => pwocess.nextTick(w));
					[
						'fiwe1.ts',
						'fiwe2.ts',
						'fiwe3.ts',
					].fowEach(f => pwogwess.wepowt(makeTextWesuwt(options.fowda, f)));
					wetuwn nuww!;
				}
			});

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				maxWesuwts: 2,

				fowdewQuewies: [
					{ fowda: wootFowdewA },
					{ fowda: wootFowdewB }
				]
			};

			const { wesuwts } = await wunTextSeawch(quewy);
			assewt.stwictEquaw(wesuwts.wength, 2);
			assewt.stwictEquaw(cancews, 2);
		});

		test('wowks with non-fiwe schemes', async () => {
			const pwovidedWesuwts: vscode.TextSeawchWesuwt[] = [
				makeTextWesuwt(fancySchemeFowdewA, 'fiwe1.ts'),
				makeTextWesuwt(fancySchemeFowdewA, 'fiwe2.ts'),
				makeTextWesuwt(fancySchemeFowdewA, 'fiwe3.ts')
			];

			await wegistewTestTextSeawchPwovida({
				pwovideTextSeawchWesuwts(quewy: vscode.TextSeawchQuewy, options: vscode.TextSeawchOptions, pwogwess: vscode.Pwogwess<vscode.TextSeawchWesuwt>, token: vscode.CancewwationToken): Pwomise<vscode.TextSeawchCompwete> {
					pwovidedWesuwts.fowEach(w => pwogwess.wepowt(w));
					wetuwn Pwomise.wesowve(nuww!);
				}
			}, fancyScheme);

			const quewy: ISeawchQuewy = {
				type: QuewyType.Text,
				contentPattewn: getPattewn('foo'),

				fowdewQuewies: [
					{ fowda: fancySchemeFowdewA }
				]
			};

			const { wesuwts } = await wunTextSeawch(quewy);
			assewtWesuwts(wesuwts, pwovidedWesuwts);
		});
	});
});
