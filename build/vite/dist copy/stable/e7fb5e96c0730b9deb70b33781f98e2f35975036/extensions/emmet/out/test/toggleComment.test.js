"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const assert = __importStar(require("assert"));
const vscode_1 = require("vscode");
const testUtils_1 = require("./testUtils");
const toggleComment_1 = require("../toggleComment");
function toggleComment() {
    const result = (0, toggleComment_1.toggleComment)();
    assert.ok(result);
    return result;
}
suite('Tests for Toggle Comment action from Emmet (HTML)', () => {
    teardown(testUtils_1.closeAllEditors);
    const contents = `
	<div class="hello">
		<ul>
			<li><span>Hello</span></li>
			<li><span>There</span></li>
			<div><li><span>Bye</span></li></div>
		</ul>
		<ul>
			<!-- <li>Previously Commented Node</li> -->
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
			<li><!-- <span>Hello</span> --></li>
			<!-- <li><span>There</span></li> -->
			<!-- <div><li><span>Bye</span></li></div> -->
		</ul>
		<!-- <ul>
			<li>Previously Commented Node</li>
			<li>Another Node</li>
		</ul> -->
		<span/>
		<style>
			.boo {
				/* margin: 10px; */
				padding: 20px;
			}
			/* .hoo {
				margin: 10px;
				padding: 20px;
			} */
		</style>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 17, 3, 17), // cursor inside the inner span element
                new vscode_1.Selection(4, 5, 4, 5), // cursor inside opening tag
                new vscode_1.Selection(5, 35, 5, 35), // cursor inside closing tag
                new vscode_1.Selection(7, 3, 7, 3), // cursor inside open tag of <ul> one of whose children is already commented
                new vscode_1.Selection(14, 8, 14, 8), // cursor inside the css property inside the style tag
                new vscode_1.Selection(18, 3, 18, 3) // cursor inside the css rule inside the style tag
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('toggle comment with multiple cursors and whole node selected (HTML)', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li><!-- <span>Hello</span> --></li>
			<!-- <li><span>There</span></li> -->
			<div><li><span>Bye</span></li></div>
		</ul>
		<!-- <ul>
			<li>Previously Commented Node</li>
			<li>Another Node</li>
		</ul> -->
		<span/>
		<style>
			.boo {
				/* margin: 10px; */
				padding: 20px;
			}
			/* .hoo {
				margin: 10px;
				padding: 20px;
			} */
		</style>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 7, 3, 25), // <span>Hello</span><
                new vscode_1.Selection(4, 3, 4, 30), // <li><span>There</span></li>
                new vscode_1.Selection(7, 2, 10, 7), // The <ul> one of whose children is already commented
                new vscode_1.Selection(14, 4, 14, 17), // css property inside the style tag
                new vscode_1.Selection(17, 3, 20, 4) // the css rule inside the style tag
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('toggle comment when multiple nodes are completely under single selection (HTML)', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<!-- <li><span>Hello</span></li>
			<li><span>There</span></li> -->
			<div><li><span>Bye</span></li></div>
		</ul>
		<ul>
			<!-- <li>Previously Commented Node</li> -->
			<li>Another Node</li>
		</ul>
		<span/>
		<style>
			.boo {
				/* margin: 10px;
				padding: 20px; */
			}
			.hoo {
				margin: 10px;
				padding: 20px;
			}
		</style>
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 4, 4, 30),
                new vscode_1.Selection(14, 4, 15, 18) // 2 css properties inside the style tag
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('toggle comment when multiple nodes are partially under single selection (HTML)', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<!-- <li><span>Hello</span></li>
			<li><span>There</span></li> -->
			<div><li><span>Bye</span></li></div>
		</ul>
		<!-- <ul>
			<li>Previously Commented Node</li>
			<li>Another Node</li>
		</ul> -->
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
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 24, 4, 20),
                new vscode_1.Selection(7, 2, 9, 10) // The <ul> one of whose children is already commented
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('toggle comment with multiple cursors selecting parent and child nodes', () => {
        const expectedContents = `
	<div class="hello">
		<ul>
			<li><!-- <span>Hello</span> --></li>
			<!-- <li><span>There</span></li> -->
			<div><li><span>Bye</span></li></div>
		</ul>
		<!-- <ul>
			<li>Previously Commented Node</li>
			<li>Another Node</li>
		</ul> -->
		<span/>
		<!-- <style>
			.boo {
				margin: 10px;
				padding: 20px;
			}
			.hoo {
				margin: 10px;
				padding: 20px;
			}
		</style> -->
	</div>
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 17, 3, 17), // cursor inside the inner span element
                new vscode_1.Selection(4, 5, 4, 5), // two cursors: one inside opening tag
                new vscode_1.Selection(4, 17, 4, 17), // 		and the second inside the inner span element
                new vscode_1.Selection(7, 3, 7, 3), // two cursors: one inside open tag of <ul> one of whose children is already commented
                new vscode_1.Selection(9, 10, 9, 10), // 	and the second inside inner li element, whose parent is selected
                new vscode_1.Selection(12, 3, 12, 3), // four nested cursors: one inside the style open tag
                new vscode_1.Selection(14, 8, 14, 8), // 	the second inside the css property inside the style tag
                new vscode_1.Selection(18, 3, 18, 3), // 	the third inside the css rule inside the style tag
                new vscode_1.Selection(19, 8, 19, 8) // 		and the fourth inside the css property inside the style tag
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
    test('toggle comment within script template', () => {
        const templateContents = `
	<script type="text/template">
		<li><span>Hello</span></li>
		<li><!-- <span>There</span> --></li>
		<div><li><span>Bye</span></li></div>
		<span/>
	</script>
	`;
        const expectedContents = `
	<script type="text/template">
		<!-- <li><span>Hello</span></li> -->
		<li><span>There</span></li>
		<div><li><!-- <span>Bye</span> --></li></div>
		<span/>
	</script>
	`;
        return (0, testUtils_1.withRandomFileEditor)(templateContents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 2, 2, 28), // select entire li element
                new vscode_1.Selection(3, 17, 3, 17), // cursor inside the commented span
                new vscode_1.Selection(4, 18, 4, 18), // cursor inside the noncommented span
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return Promise.resolve();
            });
        });
    });
});
suite('Tests for Toggle Comment action from Emmet (CSS)', () => {
    teardown(testUtils_1.closeAllEditors);
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
		/* margin: 10px; */
		padding: 10px;
	}
	/* .two {
		height: 42px;
		display: none;
	} */
	.three {
		width: 42px;
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 5, 2, 5), // cursor inside a property
                new vscode_1.Selection(5, 4, 5, 4), // cursor inside selector
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment with multiple cursors and whole node selected (CSS)', () => {
        const expectedContents = `
	.one {
		/* margin: 10px; */
		/* padding: 10px; */
	}
	/* .two {
		height: 42px;
		display: none;
	} */
	.three {
		width: 42px;
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 2, 2, 15), // A property completely selected
                new vscode_1.Selection(3, 0, 3, 16), // A property completely selected along with whitespace
                new vscode_1.Selection(5, 1, 8, 2), // A rule completely selected
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                //return toggleComment().then(() => {
                //assert.strictEqual(doc.getText(), contents);
                return Promise.resolve();
                //});
            });
        });
    });
    test('toggle comment when multiple nodes of same parent are completely under single selection (CSS)', () => {
        const expectedContents = `
	.one {
/* 		margin: 10px;
		padding: 10px; */
	}
	/* .two {
		height: 42px;
		display: none;
	}
	.three {
		width: 42px;
	} */`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 0, 3, 16), // 2 properties completely under a single selection along with whitespace
                new vscode_1.Selection(5, 1, 11, 2), // 2 rules completely under a single selection
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment when start and end of selection is inside properties of separate rules (CSS)', () => {
        const expectedContents = `
	.one {
		margin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		display: none;
	}
	.three {
		width: 42px;
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 7, 6, 6)
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment when selection spans properties of separate rules, with start in whitespace and end inside the property (CSS)', () => {
        const expectedContents = `
	.one {
		margin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		display: none;
	}
	.three {
		width: 42px;
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 0, 6, 6)
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment when selection spans properties of separate rules, with end in whitespace and start inside the property (CSS)', () => {
        const expectedContents = `
	.one {
		margin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		display: none;
	}
	.three {
		width: 42px;
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 7, 7, 0)
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment when selection spans properties of separate rules, with both start and end in whitespace (CSS)', () => {
        const expectedContents = `
	.one {
		margin: 10px;
		/* padding: 10px;
	}
	.two {
		height: 42px; */
		display: none;
	}
	.three {
		width: 42px;
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(3, 0, 7, 0)
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment when multiple nodes of same parent are partially under single selection (CSS)', () => {
        const expectedContents = `
	.one {
		/* margin: 10px;
		padding: 10px; */
	}
	/* .two {
		height: 42px;
		display: none;
	}
	.three {
		width: 42px;
 */	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 7, 3, 10), // 2 properties partially under a single selection
                new vscode_1.Selection(5, 2, 11, 0), // 2 rules partially under a single selection
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
});
suite('Tests for Toggle Comment action from Emmet in nested css (SCSS)', () => {
    teardown(testUtils_1.closeAllEditors);
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
    test('toggle comment with multiple cursors selecting nested nodes (SCSS)', () => {
        const expectedContents = `
	.one {
		/* height: 42px; */

		/* .two {
			width: 42px;
		} */

		.three {
			/* padding: 10px; */
		}
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 5, 2, 5), // cursor inside a property
                new vscode_1.Selection(4, 4, 4, 4), // two cursors: one inside a nested rule
                new vscode_1.Selection(5, 5, 5, 5), // 		and the second one inside a nested property
                new vscode_1.Selection(9, 5, 9, 5) // cursor inside a property inside a nested rule
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment with multiple cursors selecting several nested nodes (SCSS)', () => {
        const expectedContents = `
	/* .one {
		height: 42px;

		.two {
			width: 42px;
		}

		.three {
			padding: 10px;
		}
	} */`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(1, 3, 1, 3), // cursor in the outside rule. And several cursors inside:
                new vscode_1.Selection(2, 5, 2, 5), // cursor inside a property
                new vscode_1.Selection(4, 4, 4, 4), // two cursors: one inside a nested rule
                new vscode_1.Selection(5, 5, 5, 5), // 		and the second one inside a nested property
                new vscode_1.Selection(9, 5, 9, 5) // cursor inside a property inside a nested rule
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment with multiple cursors, but no selection (SCSS)', () => {
        const expectedContents = `
	.one {
		/* height: 42px; */

		/* .two {
			width: 42px;
		} */

		.three {
			/* padding: 10px; */
		}
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 5, 2, 5), // cursor inside a property
                new vscode_1.Selection(4, 4, 4, 4), // cursor inside a nested rule
                new vscode_1.Selection(9, 5, 9, 5) // cursor inside a property inside a nested rule
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                //return toggleComment().then(() => {
                //	assert.strictEqual(doc.getText(), contents);
                return Promise.resolve();
                //});
            });
        });
    });
    test('toggle comment with multiple cursors and whole node selected (CSS)', () => {
        const expectedContents = `
	.one {
		/* height: 42px; */

		/* .two {
			width: 42px;
		} */

		.three {
			/* padding: 10px; */
		}
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 2, 2, 15), // A property completely selected
                new vscode_1.Selection(4, 2, 6, 3), // A rule completely selected
                new vscode_1.Selection(9, 3, 9, 17) // A property inside a nested rule completely selected
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment when multiple nodes are completely under single selection (CSS)', () => {
        const expectedContents = `
	.one {
		/* height: 42px;

		.two {
			width: 42px;
		} */

		.three {
			padding: 10px;
		}
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 2, 6, 3), // A properties and a nested rule completely under a single selection
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment when multiple nodes are partially under single selection (CSS)', () => {
        const expectedContents = `
	.one {
		/* height: 42px;

		.two {
			width: 42px;
	 */	}

		.three {
			padding: 10px;
		}
	}`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'css', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(2, 6, 6, 1), // A properties and a nested rule partially under a single selection
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
    test('toggle comment doesn\'t fail when start and end nodes differ HTML', () => {
        const contents = `
	<div>
		<p>Hello</p>
	</div>
	`;
        const expectedContents = `
	<!-- <div>
		<p>Hello</p>
	</div> -->
	`;
        return (0, testUtils_1.withRandomFileEditor)(contents, 'html', (editor, doc) => {
            editor.selections = [
                new vscode_1.Selection(1, 2, 2, 9), // <div> to <p> inclusive
            ];
            return toggleComment().then(() => {
                assert.strictEqual(doc.getText(), expectedContents);
                return toggleComment().then(() => {
                    assert.strictEqual(doc.getText(), contents);
                    return Promise.resolve();
                });
            });
        });
    });
});
//# sourceMappingURL=toggleComment.test.js.map