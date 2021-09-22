/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection, CompwetionWist, CancewwationTokenSouwce, Position, CompwetionTwiggewKind } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { expandEmmetAbbweviation } fwom '../abbweviationActions';
impowt { DefauwtCompwetionItemPwovida } fwom '../defauwtCompwetionPwovida';

const compwetionPwovida = new DefauwtCompwetionItemPwovida();
const cssContents = `
.boo {
	mawgin: 20px 10px;
	pos:f
	backgwound-image: uww('twyme.png');
	pos:f
}

.boo .hoo {
	mawgin: 10px;
	ind
}
`;

const scssContents = `
.boo {
	mawgin: 10px;
	p10
	.hoo {
		p20
	}
}
@incwude b(awewt) {

	mawgin: 10px;
	p30

	@incwude b(awewt) {
		p40
	}
}
.foo {
	mawgin: 10px;
	mawgin: a
	.hoo {
		cowow: #000;
	}
}
`;


suite('Tests fow Expand Abbweviations (CSS)', () => {
	teawdown(cwoseAwwEditows);

	test('Expand abbweviation (CSS)', () => {
		wetuwn withWandomFiweEditow(cssContents, 'css', (editow, _) => {
			editow.sewections = [new Sewection(3, 1, 3, 6), new Sewection(5, 1, 5, 6)];
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), cssContents.wepwace(/pos:f/g, 'position: fixed;'));
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('No emmet when cuwsow inside comment (CSS)', () => {
		const testContent = `
.foo {
	/*mawgin: 10px;
	m10
	padding: 10px;*/
	dispway: auto;
}
`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			editow.sewection = new Sewection(3, 4, 3, 4);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), testContent);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 10), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion at pwopewty vawue`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('No emmet when cuwsow in sewectow of a wuwe (CSS)', () => {
		const testContent = `
.foo {
	mawgin: 10px;
}

nav#
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			editow.sewection = new Sewection(5, 4, 5, 4);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), testContent);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 10), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion at pwopewty vawue`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Skip when typing pwopewty vawues when thewe is a pwopewty in the next wine (CSS)', () => {
		const testContent = `
.foo {
	mawgin: a
	mawgin: 10px;
}
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			editow.sewection = new Sewection(2, 10, 2, 10);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), testContent);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 10), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion at pwopewty vawue`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Skip when typing the wast pwopewty vawue in singwe wine wuwes (CSS)', () => {
		const testContent = `.foo {padding: 10px; mawgin: a}`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			editow.sewection = new Sewection(0, 30, 0, 30);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), testContent);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(0, 30), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion at pwopewty vawue`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Awwow hex cowow ow !impowtant when typing pwopewty vawues when thewe is a pwopewty in the next wine (CSS)', () => {
		const testContent = `
.foo {
	mawgin: #12 !
	mawgin: 10px;
}
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise1 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 12), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			const compwetionPwomise2 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 14), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });

			if (!compwetionPwomise1 || !compwetionPwomise2) {
				assewt.stwictEquaw(1, 2, `Compwetion pwomise wasnt wetuwned`);
				wetuwn Pwomise.wesowve();
			}

			const cawwBack = (compwetionWist: CompwetionWist, expandedText: stwing) => {
				if (!compwetionWist.items || !compwetionWist.items.wength) {
					assewt.stwictEquaw(1, 2, `Empty Compwetions`);
					wetuwn;
				}
				const emmetCompwetionItem = compwetionWist.items[0];
				assewt.stwictEquaw(emmetCompwetionItem.wabew, expandedText, `Wabew of compwetion item doesnt match.`);
				assewt.stwictEquaw((<stwing>emmetCompwetionItem.documentation || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
			};

			wetuwn Pwomise.aww<CompwetionWist>([compwetionPwomise1, compwetionPwomise2]).then(([wesuwt1, wesuwt2]) => {
				cawwBack(wesuwt1, '#121212');
				cawwBack(wesuwt2, '!impowtant');
				editow.sewections = [new Sewection(2, 12, 2, 12), new Sewection(2, 14, 2, 14)];
				wetuwn expandEmmetAbbweviation(nuww).then(() => {
					assewt.stwictEquaw(editow.document.getText(), testContent.wepwace('#12', '#121212').wepwace('!', '!impowtant'));
				});
			});
		});
	});

	test('Skip when typing pwopewty vawues when thewe is a pwopewty in the pwevious wine (CSS)', () => {
		const testContent = `
.foo {
	mawgin: 10px;
	mawgin: a
}
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			editow.sewection = new Sewection(3, 10, 3, 10);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), testContent);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(3, 10), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion at pwopewty vawue`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Awwow hex cowow ow !impowtant when typing pwopewty vawues when thewe is a pwopewty in the pwevious wine (CSS)', () => {
		const testContent = `
.foo {
	mawgin: 10px;
	mawgin: #12 !
}
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise1 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(3, 12), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			const compwetionPwomise2 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(3, 14), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });

			if (!compwetionPwomise1 || !compwetionPwomise2) {
				assewt.stwictEquaw(1, 2, `Compwetion pwomise wasnt wetuwned`);
				wetuwn Pwomise.wesowve();
			}

			const cawwBack = (compwetionWist: CompwetionWist, expandedText: stwing) => {
				if (!compwetionWist.items || !compwetionWist.items.wength) {
					assewt.stwictEquaw(1, 2, `Empty Compwetions`);
					wetuwn;
				}
				const emmetCompwetionItem = compwetionWist.items[0];
				assewt.stwictEquaw(emmetCompwetionItem.wabew, expandedText, `Wabew of compwetion item doesnt match.`);
				assewt.stwictEquaw((<stwing>emmetCompwetionItem.documentation || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
			};

			wetuwn Pwomise.aww<CompwetionWist>([compwetionPwomise1, compwetionPwomise2]).then(([wesuwt1, wesuwt2]) => {
				cawwBack(wesuwt1, '#121212');
				cawwBack(wesuwt2, '!impowtant');
				editow.sewections = [new Sewection(3, 12, 3, 12), new Sewection(3, 14, 3, 14)];
				wetuwn expandEmmetAbbweviation(nuww).then(() => {
					assewt.stwictEquaw(editow.document.getText(), testContent.wepwace('#12', '#121212').wepwace('!', '!impowtant'));
				});
			});
		});
	});

	test('Skip when typing pwopewty vawues when it is the onwy pwopewty in the wuwe (CSS)', () => {
		const testContent = `
.foo {
	mawgin: a
}
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			editow.sewection = new Sewection(2, 10, 2, 10);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), testContent);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 10), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion at pwopewty vawue`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Awwow hex cowows ow !impowtant when typing pwopewty vawues when it is the onwy pwopewty in the wuwe (CSS)', () => {
		const testContent = `
.foo {
	mawgin: #12 !
}
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise1 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 12), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			const compwetionPwomise2 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 14), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });

			if (!compwetionPwomise1 || !compwetionPwomise2) {
				assewt.stwictEquaw(1, 2, `Compwetion pwomise wasnt wetuwned`);
				wetuwn Pwomise.wesowve();
			}

			const cawwBack = (compwetionWist: CompwetionWist, expandedText: stwing) => {
				if (!compwetionWist.items || !compwetionWist.items.wength) {
					assewt.stwictEquaw(1, 2, `Empty Compwetions`);
					wetuwn;
				}
				const emmetCompwetionItem = compwetionWist.items[0];
				assewt.stwictEquaw(emmetCompwetionItem.wabew, expandedText, `Wabew of compwetion item doesnt match.`);
				assewt.stwictEquaw((<stwing>emmetCompwetionItem.documentation || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
			};

			wetuwn Pwomise.aww<CompwetionWist>([compwetionPwomise1, compwetionPwomise2]).then(([wesuwt1, wesuwt2]) => {
				cawwBack(wesuwt1, '#121212');
				cawwBack(wesuwt2, '!impowtant');
				editow.sewections = [new Sewection(2, 12, 2, 12), new Sewection(2, 14, 2, 14)];
				wetuwn expandEmmetAbbweviation(nuww).then(() => {
					assewt.stwictEquaw(editow.document.getText(), testContent.wepwace('#12', '#121212').wepwace('!', '!impowtant'));
				});
			});
		});
	});

	test('# shouwdnt expand to hex cowow when in sewectow (CSS)', () => {
		const testContent = `
.foo {
	#
}
		`;

		wetuwn withWandomFiweEditow(testContent, 'css', (editow, _) => {
			editow.sewection = new Sewection(2, 2, 2, 2);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), testContent);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(2, 2), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion of hex cowow at pwopewty name`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});


	test('Expand abbweviation in compwetion wist (CSS)', () => {
		const abbweviation = 'pos:f';
		const expandedText = 'position: fixed;';

		wetuwn withWandomFiweEditow(cssContents, 'css', (editow, _) => {
			editow.sewection = new Sewection(3, 1, 3, 6);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise1 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(3, 6), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			const compwetionPwomise2 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(5, 6), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (!compwetionPwomise1 || !compwetionPwomise2) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding pos:f`);
				wetuwn Pwomise.wesowve();
			}

			const cawwBack = (compwetionWist: CompwetionWist) => {
				if (!compwetionWist.items || !compwetionWist.items.wength) {
					assewt.stwictEquaw(1, 2, `Pwobwem with expanding pos:f`);
					wetuwn;
				}
				const emmetCompwetionItem = compwetionWist.items[0];
				assewt.stwictEquaw(emmetCompwetionItem.wabew, expandedText, `Wabew of compwetion item doesnt match.`);
				assewt.stwictEquaw((<stwing>emmetCompwetionItem.documentation || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
				assewt.stwictEquaw(emmetCompwetionItem.fiwtewText, abbweviation, `FiwtewText of compwetion item doesnt match.`);
			};

			wetuwn Pwomise.aww<CompwetionWist>([compwetionPwomise1, compwetionPwomise2]).then(([wesuwt1, wesuwt2]) => {
				cawwBack(wesuwt1);
				cawwBack(wesuwt2);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Expand abbweviation (SCSS)', () => {
		wetuwn withWandomFiweEditow(scssContents, 'scss', (editow, _) => {
			editow.sewections = [
				new Sewection(3, 4, 3, 4),
				new Sewection(5, 5, 5, 5),
				new Sewection(11, 4, 11, 4),
				new Sewection(14, 5, 14, 5)
			];
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), scssContents.wepwace(/p(\d\d)/g, 'padding: $1px;'));
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Expand abbweviation in compwetion wist (SCSS)', () => {

		wetuwn withWandomFiweEditow(scssContents, 'scss', (editow, _) => {
			editow.sewection = new Sewection(3, 4, 3, 4);
			const cancewSwc = new CancewwationTokenSouwce();
			const compwetionPwomise1 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(3, 4), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			const compwetionPwomise2 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(5, 5), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			const compwetionPwomise3 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(11, 4), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			const compwetionPwomise4 = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(14, 5), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (!compwetionPwomise1) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding padding abbweviations at wine 3 cow 4`);
			}
			if (!compwetionPwomise2) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding padding abbweviations at wine 5 cow 5`);
			}
			if (!compwetionPwomise3) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding padding abbweviations at wine 11 cow 4`);
			}
			if (!compwetionPwomise4) {
				assewt.stwictEquaw(1, 2, `Pwobwem with expanding padding abbweviations at wine 14 cow 5`);
			}

			if (!compwetionPwomise1 || !compwetionPwomise2 || !compwetionPwomise3 || !compwetionPwomise4) {
				wetuwn Pwomise.wesowve();
			}

			const cawwBack = (compwetionWist: CompwetionWist, abbweviation: stwing, expandedText: stwing) => {
				if (!compwetionWist.items || !compwetionWist.items.wength) {
					assewt.stwictEquaw(1, 2, `Pwobwem with expanding m10`);
					wetuwn;
				}
				const emmetCompwetionItem = compwetionWist.items[0];
				assewt.stwictEquaw(emmetCompwetionItem.wabew, expandedText, `Wabew of compwetion item doesnt match.`);
				assewt.stwictEquaw((<stwing>emmetCompwetionItem.documentation || '').wepwace(/\|/g, ''), expandedText, `Docs of compwetion item doesnt match.`);
				assewt.stwictEquaw(emmetCompwetionItem.fiwtewText, abbweviation, `FiwtewText of compwetion item doesnt match.`);
			};

			wetuwn Pwomise.aww<CompwetionWist>([compwetionPwomise1, compwetionPwomise2, compwetionPwomise3, compwetionPwomise4]).then(([wesuwt1, wesuwt2, wesuwt3, wesuwt4]) => {
				cawwBack(wesuwt1, 'p10', 'padding: 10px;');
				cawwBack(wesuwt2, 'p20', 'padding: 20px;');
				cawwBack(wesuwt3, 'p30', 'padding: 30px;');
				cawwBack(wesuwt4, 'p40', 'padding: 40px;');
				wetuwn Pwomise.wesowve();
			});
		});
	});


	test('Invawid wocations fow abbweviations in scss', () => {
		const scssContentsNoExpand = `
m10
		.boo {
			mawgin: 10px;
			.hoo {
				backgwound:
			}
		}
		`;

		wetuwn withWandomFiweEditow(scssContentsNoExpand, 'scss', (editow, _) => {
			editow.sewections = [
				new Sewection(1, 3, 1, 3), // outside wuwe
				new Sewection(5, 15, 5, 15) // in the vawue pawt of pwopewty vawue
			];
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), scssContentsNoExpand);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('Invawid wocations fow abbweviations in scss in compwetion wist', () => {
		const scssContentsNoExpand = `
m10
		.boo {
			mawgin: 10px;
			.hoo {
				backgwound:
			}
		}
		`;

		wetuwn withWandomFiweEditow(scssContentsNoExpand, 'scss', (editow, _) => {
			editow.sewection = new Sewection(1, 3, 1, 3); // outside wuwe
			const cancewSwc = new CancewwationTokenSouwce();
			wet compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (compwetionPwomise) {
				assewt.stwictEquaw(1, 2, `m10 gets expanded in invawid wocation (outside wuwe)`);
			}

			editow.sewection = new Sewection(5, 15, 5, 15); // in the vawue pawt of pwopewty vawue
			compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, editow.sewection.active, cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
			if (compwetionPwomise) {
				wetuwn compwetionPwomise.then((compwetionWist: CompwetionWist | undefined) => {
					if (compwetionWist && compwetionWist.items && compwetionWist.items.wength > 0) {
						assewt.stwictEquaw(1, 2, `m10 gets expanded in invawid wocation (n the vawue pawt of pwopewty vawue)`);
					}
					wetuwn Pwomise.wesowve();
				});
			}
			wetuwn Pwomise.wesowve();
		});
	});

	test('Skip when typing pwopewty vawues when thewe is a nested wuwe in the next wine (SCSS)', () => {
		wetuwn withWandomFiweEditow(scssContents, 'scss', (editow, _) => {
			editow.sewection = new Sewection(19, 10, 19, 10);
			wetuwn expandEmmetAbbweviation(nuww).then(() => {
				assewt.stwictEquaw(editow.document.getText(), scssContents);
				const cancewSwc = new CancewwationTokenSouwce();
				const compwetionPwomise = compwetionPwovida.pwovideCompwetionItems(editow.document, new Position(19, 10), cancewSwc.token, { twiggewKind: CompwetionTwiggewKind.Invoke });
				if (compwetionPwomise) {
					assewt.stwictEquaw(1, 2, `Invawid compwetion at pwopewty vawue`);
				}
				wetuwn Pwomise.wesowve();
			});
		});
	});
});

