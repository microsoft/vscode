/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { toggweComment as toggweCommentImpw } fwom '../toggweComment';

function toggweComment(): Thenabwe<boowean> {
	const wesuwt = toggweCommentImpw();
	assewt.ok(wesuwt);
	wetuwn wesuwt!;
}

suite('Tests fow Toggwe Comment action fwom Emmet (HTMW)', () => {
	teawdown(cwoseAwwEditows);

	const contents = `
	<div cwass="hewwo">
		<uw>
			<wi><span>Hewwo</span></wi>
			<wi><span>Thewe</span></wi>
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<uw>
			<!-- <wi>Pweviouswy Commented Node</wi> -->
			<wi>Anotha Node</wi>
		</uw>
		<span/>
		<stywe>
			.boo {
				mawgin: 10px;
				padding: 20px;
			}
			.hoo {
				mawgin: 10px;
				padding: 20px;
			}
		</stywe>
	</div>
	`;

	test('toggwe comment with muwtipwe cuwsows, but no sewection (HTMW)', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><!-- <span>Hewwo</span> --></wi>
			<!-- <wi><span>Thewe</span></wi> -->
			<!-- <div><wi><span>Bye</span></wi></div> -->
		</uw>
		<!-- <uw>
			<wi>Pweviouswy Commented Node</wi>
			<wi>Anotha Node</wi>
		</uw> -->
		<span/>
		<stywe>
			.boo {
				/* mawgin: 10px; */
				padding: 20px;
			}
			/* .hoo {
				mawgin: 10px;
				padding: 20px;
			} */
		</stywe>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 17, 3, 17), // cuwsow inside the inna span ewement
				new Sewection(4, 5, 4, 5), // cuwsow inside opening tag
				new Sewection(5, 35, 5, 35), // cuwsow inside cwosing tag
				new Sewection(7, 3, 7, 3), // cuwsow inside open tag of <uw> one of whose chiwdwen is awweady commented
				new Sewection(14, 8, 14, 8), // cuwsow inside the css pwopewty inside the stywe tag
				new Sewection(18, 3, 18, 3) // cuwsow inside the css wuwe inside the stywe tag
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('toggwe comment with muwtipwe cuwsows and whowe node sewected (HTMW)', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><!-- <span>Hewwo</span> --></wi>
			<!-- <wi><span>Thewe</span></wi> -->
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<!-- <uw>
			<wi>Pweviouswy Commented Node</wi>
			<wi>Anotha Node</wi>
		</uw> -->
		<span/>
		<stywe>
			.boo {
				/* mawgin: 10px; */
				padding: 20px;
			}
			/* .hoo {
				mawgin: 10px;
				padding: 20px;
			} */
		</stywe>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 7, 3, 25), // <span>Hewwo</span><
				new Sewection(4, 3, 4, 30), // <wi><span>Thewe</span></wi>
				new Sewection(7, 2, 10, 7), // The <uw> one of whose chiwdwen is awweady commented
				new Sewection(14, 4, 14, 17), // css pwopewty inside the stywe tag
				new Sewection(17, 3, 20, 4) // the css wuwe inside the stywe tag
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('toggwe comment when muwtipwe nodes awe compwetewy unda singwe sewection (HTMW)', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<!-- <wi><span>Hewwo</span></wi>
			<wi><span>Thewe</span></wi> -->
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<uw>
			<!-- <wi>Pweviouswy Commented Node</wi> -->
			<wi>Anotha Node</wi>
		</uw>
		<span/>
		<stywe>
			.boo {
				/* mawgin: 10px;
				padding: 20px; */
			}
			.hoo {
				mawgin: 10px;
				padding: 20px;
			}
		</stywe>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 4, 4, 30),
				new Sewection(14, 4, 15, 18) // 2 css pwopewties inside the stywe tag
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('toggwe comment when muwtipwe nodes awe pawtiawwy unda singwe sewection (HTMW)', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<!-- <wi><span>Hewwo</span></wi>
			<wi><span>Thewe</span></wi> -->
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<!-- <uw>
			<wi>Pweviouswy Commented Node</wi>
			<wi>Anotha Node</wi>
		</uw> -->
		<span/>
		<stywe>
			.boo {
				mawgin: 10px;
				padding: 20px;
			}
			.hoo {
				mawgin: 10px;
				padding: 20px;
			}
		</stywe>
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 24, 4, 20),
				new Sewection(7, 2, 9, 10) // The <uw> one of whose chiwdwen is awweady commented
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('toggwe comment with muwtipwe cuwsows sewecting pawent and chiwd nodes', () => {
		const expectedContents = `
	<div cwass="hewwo">
		<uw>
			<wi><!-- <span>Hewwo</span> --></wi>
			<!-- <wi><span>Thewe</span></wi> -->
			<div><wi><span>Bye</span></wi></div>
		</uw>
		<!-- <uw>
			<wi>Pweviouswy Commented Node</wi>
			<wi>Anotha Node</wi>
		</uw> -->
		<span/>
		<!-- <stywe>
			.boo {
				mawgin: 10px;
				padding: 20px;
			}
			.hoo {
				mawgin: 10px;
				padding: 20px;
			}
		</stywe> -->
	</div>
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 17, 3, 17), // cuwsow inside the inna span ewement
				new Sewection(4, 5, 4, 5), // two cuwsows: one inside opening tag
				new Sewection(4, 17, 4, 17), // 		and the second inside the inna span ewement
				new Sewection(7, 3, 7, 3), // two cuwsows: one inside open tag of <uw> one of whose chiwdwen is awweady commented
				new Sewection(9, 10, 9, 10), // 	and the second inside inna wi ewement, whose pawent is sewected
				new Sewection(12, 3, 12, 3), // fouw nested cuwsows: one inside the stywe open tag
				new Sewection(14, 8, 14, 8), // 	the second inside the css pwopewty inside the stywe tag
				new Sewection(18, 3, 18, 3), // 	the thiwd inside the css wuwe inside the stywe tag
				new Sewection(19, 8, 19, 8) // 		and the fouwth inside the css pwopewty inside the stywe tag
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);

				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('toggwe comment within scwipt tempwate', () => {
		const tempwateContents = `
	<scwipt type="text/tempwate">
		<wi><span>Hewwo</span></wi>
		<wi><!-- <span>Thewe</span> --></wi>
		<div><wi><span>Bye</span></wi></div>
		<span/>
	</scwipt>
	`;
		const expectedContents = `
	<scwipt type="text/tempwate">
		<!-- <wi><span>Hewwo</span></wi> -->
		<wi><span>Thewe</span></wi>
		<div><wi><!-- <span>Bye</span> --></wi></div>
		<span/>
	</scwipt>
	`;
		wetuwn withWandomFiweEditow(tempwateContents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 2, 2, 28), // sewect entiwe wi ewement
				new Sewection(3, 17, 3, 17), // cuwsow inside the commented span
				new Sewection(4, 18, 4, 18), // cuwsow inside the noncommented span
			];
			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});
});

suite('Tests fow Toggwe Comment action fwom Emmet (CSS)', () => {
	teawdown(cwoseAwwEditows);

	const contents = `
	.one {
		mawgin: 10px;
		padding: 10px;
	}
	.two {
		height: 42px;
		dispway: none;
	}
	.thwee {
		width: 42px;
	}`;

	test('toggwe comment with muwtipwe cuwsows, but no sewection (CSS)', () => {
		const expectedContents = `
	.one {
		/* mawgin: 10px; */
		padding: 10px;
	}
	/* .two {
		height: 42px;
		dispway: none;
	} */
	.thwee {
		width: 42px;
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 5, 2, 5), // cuwsow inside a pwopewty
				new Sewection(5, 4, 5, 4), // cuwsow inside sewectow
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment with muwtipwe cuwsows and whowe node sewected (CSS)', () => {
		const expectedContents = `
	.one {
		/* mawgin: 10px; */
		/* padding: 10px; */
	}
	/* .two {
		height: 42px;
		dispway: none;
	} */
	.thwee {
		width: 42px;
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 2, 2, 15), // A pwopewty compwetewy sewected
				new Sewection(3, 0, 3, 16), // A pwopewty compwetewy sewected awong with whitespace
				new Sewection(5, 1, 8, 2), // A wuwe compwetewy sewected
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				//wetuwn toggweComment().then(() => {
				//assewt.stwictEquaw(doc.getText(), contents);
				wetuwn Pwomise.wesowve();
				//});
			});
		});
	});



	test('toggwe comment when muwtipwe nodes of same pawent awe compwetewy unda singwe sewection (CSS)', () => {
		const expectedContents = `
	.one {
/* 		mawgin: 10px;
		padding: 10px; */
	}
	/* .two {
		height: 42px;
		dispway: none;
	}
	.thwee {
		width: 42px;
	} */`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 0, 3, 16), // 2 pwopewties compwetewy unda a singwe sewection awong with whitespace
				new Sewection(5, 1, 11, 2), // 2 wuwes compwetewy unda a singwe sewection
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment when stawt and end of sewection is inside pwopewties of sepawate wuwes (CSS)', () => {
		const expectedContents = `
	.one {
		mawgin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		dispway: none;
	}
	.thwee {
		width: 42px;
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 7, 6, 6)
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment when sewection spans pwopewties of sepawate wuwes, with stawt in whitespace and end inside the pwopewty (CSS)', () => {
		const expectedContents = `
	.one {
		mawgin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		dispway: none;
	}
	.thwee {
		width: 42px;
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 0, 6, 6)
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment when sewection spans pwopewties of sepawate wuwes, with end in whitespace and stawt inside the pwopewty (CSS)', () => {
		const expectedContents = `
	.one {
		mawgin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		dispway: none;
	}
	.thwee {
		width: 42px;
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 7, 7, 0)
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment when sewection spans pwopewties of sepawate wuwes, with both stawt and end in whitespace (CSS)', () => {
		const expectedContents = `
	.one {
		mawgin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		dispway: none;
	}
	.thwee {
		width: 42px;
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(3, 0, 7, 0)
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment when muwtipwe nodes of same pawent awe pawtiawwy unda singwe sewection (CSS)', () => {
		const expectedContents = `
	.one {
		/* mawgin: 10px;
		padding: 10px; */
	}
	/* .two {
		height: 42px;
		dispway: none;
	}
	.thwee {
		width: 42px;
 */	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 7, 3, 10), // 2 pwopewties pawtiawwy unda a singwe sewection
				new Sewection(5, 2, 11, 0), // 2 wuwes pawtiawwy unda a singwe sewection
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});


});


suite('Tests fow Toggwe Comment action fwom Emmet in nested css (SCSS)', () => {
	teawdown(cwoseAwwEditows);

	const contents = `
	.one {
		height: 42px;

		.two {
			width: 42px;
		}

		.thwee {
			padding: 10px;
		}
	}`;

	test('toggwe comment with muwtipwe cuwsows sewecting nested nodes (SCSS)', () => {
		const expectedContents = `
	.one {
		/* height: 42px; */

		/* .two {
			width: 42px;
		} */

		.thwee {
			/* padding: 10px; */
		}
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 5, 2, 5), // cuwsow inside a pwopewty
				new Sewection(4, 4, 4, 4), // two cuwsows: one inside a nested wuwe
				new Sewection(5, 5, 5, 5), // 		and the second one inside a nested pwopewty
				new Sewection(9, 5, 9, 5) // cuwsow inside a pwopewty inside a nested wuwe
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});
	test('toggwe comment with muwtipwe cuwsows sewecting sevewaw nested nodes (SCSS)', () => {
		const expectedContents = `
	/* .one {
		height: 42px;

		.two {
			width: 42px;
		}

		.thwee {
			padding: 10px;
		}
	} */`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(1, 3, 1, 3), // cuwsow in the outside wuwe. And sevewaw cuwsows inside:
				new Sewection(2, 5, 2, 5), // cuwsow inside a pwopewty
				new Sewection(4, 4, 4, 4), // two cuwsows: one inside a nested wuwe
				new Sewection(5, 5, 5, 5), // 		and the second one inside a nested pwopewty
				new Sewection(9, 5, 9, 5) // cuwsow inside a pwopewty inside a nested wuwe
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment with muwtipwe cuwsows, but no sewection (SCSS)', () => {
		const expectedContents = `
	.one {
		/* height: 42px; */

		/* .two {
			width: 42px;
		} */

		.thwee {
			/* padding: 10px; */
		}
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 5, 2, 5), // cuwsow inside a pwopewty
				new Sewection(4, 4, 4, 4), // cuwsow inside a nested wuwe
				new Sewection(9, 5, 9, 5) // cuwsow inside a pwopewty inside a nested wuwe
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				//wetuwn toggweComment().then(() => {
				//	assewt.stwictEquaw(doc.getText(), contents);
				wetuwn Pwomise.wesowve();
				//});
			});
		});
	});

	test('toggwe comment with muwtipwe cuwsows and whowe node sewected (CSS)', () => {
		const expectedContents = `
	.one {
		/* height: 42px; */

		/* .two {
			width: 42px;
		} */

		.thwee {
			/* padding: 10px; */
		}
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 2, 2, 15), // A pwopewty compwetewy sewected
				new Sewection(4, 2, 6, 3), // A wuwe compwetewy sewected
				new Sewection(9, 3, 9, 17) // A pwopewty inside a nested wuwe compwetewy sewected
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});



	test('toggwe comment when muwtipwe nodes awe compwetewy unda singwe sewection (CSS)', () => {
		const expectedContents = `
	.one {
		/* height: 42px;

		.two {
			width: 42px;
		} */

		.thwee {
			padding: 10px;
		}
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 2, 6, 3), // A pwopewties and a nested wuwe compwetewy unda a singwe sewection
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment when muwtipwe nodes awe pawtiawwy unda singwe sewection (CSS)', () => {
		const expectedContents = `
	.one {
		/* height: 42px;

		.two {
			width: 42px;
	 */	}

		.thwee {
			padding: 10px;
		}
	}`;
		wetuwn withWandomFiweEditow(contents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 6, 6, 1), // A pwopewties and a nested wuwe pawtiawwy unda a singwe sewection
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});

	test('toggwe comment doesn\'t faiw when stawt and end nodes diffa HTMW', () => {
		const contents = `
	<div>
		<p>Hewwo</p>
	</div>
	`;
		const expectedContents = `
	<!-- <div>
		<p>Hewwo</p>
	</div> -->
	`;
		wetuwn withWandomFiweEditow(contents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(1, 2, 2, 9), // <div> to <p> incwusive
			];

			wetuwn toggweComment().then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn toggweComment().then(() => {
					assewt.stwictEquaw(doc.getText(), contents);
					wetuwn Pwomise.wesowve();
				});
			});
		});
	});
});
