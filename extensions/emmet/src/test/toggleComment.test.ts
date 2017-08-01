/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Selection } from 'vscode';
import { withRandomFileEditor, closeAllEditors } from './testUtils';
import { toggleComment } from '../toggleComment';

suite('Tests for Toggle Comment action from Emmet (HTML)', () => {
	teardown(closeAllEditors);

	const contents = `
	<div class="hello">
		<ul>
			<li><span>Hello</span></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<ul>
			<!--<li>Previously Commented Node</li>-->
			<li>Another Node</li>
		</ul>
		<span/>
		<style>
			.boo {
				margin: 10px;
				padding: 20px;
			}
			.hoo {
				margin: 10px;
				padding: 20px;
			}
		</style>
	</div>
	`;

	test('toggle comment with multiple cursors, but no selection (HTML)', () => {
		const expectedContents = `
	<div class="hello">
		<ul>
			<li><!--<span>Hello</span>--></li>
			<!--<li><span>There</span></li>-->
			<!--<div><li><span>Bye</span></li></div>-->
		</ul>
		<!--<ul>
			<li>Previously Commented Node</li>
			<li>Another Node</li>
		</ul>-->
		<span/>
		<style>
			.boo {
				/*margin: 10px;*/
				padding: 20px;
			}
			/*.hoo {
				margin: 10px;
				padding: 20px;
			}*/
		</style>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 17, 3, 17), // cursor inside the inner span element
				new Selection(4, 5, 4, 5), // cursor inside opening tag
				new Selection(5, 35, 5, 35), // cursor inside closing tag
				new Selection(7, 3, 7, 3), // cursor inside open tag of <ul> one of of whose children is already commented
				new Selection(14, 8, 14, 8), // cursor inside the css property inside the style tag
				new Selection(18, 3, 18, 3) // cursor inside the css rule inside the style tag
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('toggle comment with multiple cursors and whole node selected (HTML)', () => {
		const expectedContents = `
	<div class="hello">
		<ul>
			<li><!--<span>Hello</span>--></li>
			<!--<li><span>There</span></li>-->
			<div><li><span>Bye</span></li></div>
		</ul>
		<!--<ul>
			<li>Previously Commented Node</li>
			<li>Another Node</li>
		</ul>-->
		<span/>
		<style>
			.boo {
				/*margin: 10px;*/
				padding: 20px;
			}
			/*.hoo {
				margin: 10px;
				padding: 20px;
			}*/
		</style>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 7, 3, 25), // <span>Hello</span><
				new Selection(4, 3, 4, 30), // <li><span>There</span></li>
				new Selection(7, 2, 10, 7), // The <ul> one of of whose children is already commented
				new Selection(14, 4, 14, 17), // css property inside the style tag
				new Selection(17, 3, 20, 4) // the css rule inside the style tag
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('toggle comment when multiple nodes are completely under single selection (HTML)', () => {
		const expectedContents = `
	<div class="hello">
		<ul>
			<!--<li><span>Hello</span></li>
			<li><span>There</span></li>-->
			<div><li><span>Bye</span></li></div>
		</ul>
		<ul>
			<!--<li>Previously Commented Node</li>-->
			<li>Another Node</li>
		</ul>
		<span/>
		<style>
			.boo {
				/*margin: 10px;
				padding: 20px;*/
			}
			.hoo {
				margin: 10px;
				padding: 20px;
			}
		</style>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 4, 4, 30),
				new Selection(14, 4, 15, 18) // 2 css properties inside the style tag
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});

	test('toggle comment when multiple nodes are partially under single selection (HTML)', () => {
		const expectedContents = `
	<div class="hello">
		<ul>
			<!--<li><span>Hello</span></li>
			<li><span>There</span></li>-->
			<div><li><span>Bye</span></li></div>
		</ul>
		<!--<ul>
			<li>Previously Commented Node</li>
			<li>Another Node</li>
		</ul>-->
		<span/>
		<style>
			.boo {
				margin: 10px;
				padding: 20px;
			}
			.hoo {
				margin: 10px;
				padding: 20px;
			}
		</style>
	</div>
	`;
		return withRandomFileEditor(contents, 'html', (editor, doc) => {
			editor.selections = [
				new Selection(3, 24, 4, 20),
				new Selection(7, 2, 9, 10) // The <ul> one of of whose children is already commented
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return Promise.resolve();
			});
		});
	});
});

suite('Tests for Toggle Comment action from Emmet (CSS)', () => {
	teardown(closeAllEditors);

	const contents = `
	.one {
		margin: 10px;
		padding: 10px;
	}
	.two {
		height: 42px;
		display: none;
	}
	.three {
		width: 42px;
	}`;

	test('toggle comment with multiple cursors, but no selection (CSS)', () => {
		const expectedContents = `
	.one {
		/*margin: 10px;*/
		padding: 10px;
	}
	/*.two {
		height: 42px;
		display: none;
	}*/
	.three {
		width: 42px;
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 5, 2, 5), // cursor inside a property
				new Selection(5, 4, 5, 4), // cursor inside selector
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

	test('toggle comment with multiple cursors and whole node selected (CSS)', () => {
		const expectedContents = `
	.one {
		/*margin: 10px;*/
		/*padding: 10px;*/
	}
	/*.two {
		height: 42px;
		display: none;
	}*/
	.three {
		width: 42px;
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 2, 2, 15), // A property completely selected
				new Selection(3, 0, 3, 16), // A property completely selected along with whitespace
				new Selection(5, 1, 8, 2), // A rule completely selected
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				//return toggleComment().then(() => {
				//assert.equal(doc.getText(), contents);
				return Promise.resolve();
				//});
			});
		});
	});



	test('toggle comment when multiple nodes of same parent are completely under single selection (CSS)', () => {
		const expectedContents = `
	.one {
/*		margin: 10px;
		padding: 10px;*/
	}
	/*.two {
		height: 42px;
		display: none;
	}
	.three {
		width: 42px;
	}*/`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 0, 3, 16), // 2 properties completely under a single selection along with whitespace
				new Selection(5, 1, 11, 2), // 2 rules completely under a single selection
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

	test('toggle comment when start and end of selection is inside properties of separate rules (CSS)', () => {
		const expectedContents = `
	.one {
		margin: 10px;
		/*padding: 10px;
	}
	.two {
		height: 42px;*/
		display: none;
	}
	.three {
		width: 42px;
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(3, 7, 6, 6)
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

	test('toggle comment when selection spans properties of separate rules, with start in whitespace and end inside the property (CSS)', () => {
		const expectedContents = `
	.one {
		margin: 10px;
		/*padding: 10px;
	}
	.two {
		height: 42px;*/
		display: none;
	}
	.three {
		width: 42px;
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(3, 0, 6, 6)
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

	test('toggle comment when selection spans properties of separate rules, with end in whitespace and start inside the property (CSS)', () => {
		const expectedContents = `
	.one {
		margin: 10px;
		/*padding: 10px;
	}
	.two {
		height: 42px;*/
		display: none;
	}
	.three {
		width: 42px;
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(3, 7, 7, 0)
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

	test('toggle comment when selection spans properties of separate rules, with both start and end in whitespace (CSS)', () => {
		const expectedContents = `
	.one {
		margin: 10px;
		/*padding: 10px;
	}
	.two {
		height: 42px;*/
		display: none;
	}
	.three {
		width: 42px;
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(3, 0, 7, 0)
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

	test('toggle comment when multiple nodes of same parent are partially under single selection (CSS)', () => {
		const expectedContents = `
	.one {
		/*margin: 10px;
		padding: 10px;*/
	}
	/*.two {
		height: 42px;
		display: none;
	}
	.three {
		width: 42px;
*/	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 7, 3, 10), // 2 properties partially under a single selection
				new Selection(5, 2, 11, 0), // 2 rules partially under a single selection
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});


});


suite('Tests for Toggle Comment action from Emmet in nested css (SCSS)', () => {
	teardown(closeAllEditors);

	const contents = `
	.one {
		height: 42px;

		.two {
			width: 42px;
		}

		.three {
			padding: 10px;
		}
	}`;

	test('toggle comment with multiple cursors, but no selection (SCSS)', () => {
		const expectedContents = `
	.one {
		/*height: 42px;*/

		/*.two {
			width: 42px;
		}*/

		.three {
			/*padding: 10px;*/
		}
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 5, 2, 5), // cursor inside a property
				new Selection(4, 4, 4, 4), // cursor inside a nested rule
				new Selection(9, 5, 9, 5) // cursor inside a property inside a nested rule
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				//return toggleComment().then(() => {
				//	assert.equal(doc.getText(), contents);
				return Promise.resolve();
				//});
			});
		});
	});

	test('toggle comment with multiple cursors and whole node selected (CSS)', () => {
		const expectedContents = `
	.one {
		/*height: 42px;*/

		/*.two {
			width: 42px;
		}*/

		.three {
			/*padding: 10px;*/
		}
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 2, 2, 15), // A property completely selected
				new Selection(4, 2, 6, 3), // A rule completely selected
				new Selection(9, 3, 9, 17) // A property inside a nested rule completely selected
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});



	test('toggle comment when multiple nodes are completely under single selection (CSS)', () => {
		const expectedContents = `
	.one {
		/*height: 42px;

		.two {
			width: 42px;
		}*/

		.three {
			padding: 10px;
		}
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 2, 6, 3), // A properties and a nested rule completely under a single selection
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

	test('toggle comment when multiple nodes are partially under single selection (CSS)', () => {
		const expectedContents = `
	.one {
		/*height: 42px;

		.two {
			width: 42px;
	*/	}

		.three {
			padding: 10px;
		}
	}`;
		return withRandomFileEditor(contents, 'css', (editor, doc) => {
			editor.selections = [
				new Selection(2, 6, 6, 1), // A properties and a nested rule partially under a single selection
			];

			return toggleComment().then(() => {
				assert.equal(doc.getText(), expectedContents);
				return toggleComment().then(() => {
					assert.equal(doc.getText(), contents);
					return Promise.resolve();
				});
			});
		});
	});

});