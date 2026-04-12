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
const abbreviationActions_1 = require("../abbreviationActions");
const defaultCompletionProvider_1 = require("../defaultCompletionProvider");
const completionProvider = new defaultCompletionProvider_1.DefaultCompletionItemProvider();
const cssContents = `
.boo {
	margin: 20px 10px;
	pos:f
	background-image: url('tryme.png');
	pos:f
}

.boo .hoo {
	margin: 10px;
	ind
}
`;
const scssContents = `
.boo {
	margin: 10px;
	p10
	.hoo {
		p20
	}
}
@include b(alert) {

	margin: 10px;
	p30

	@include b(alert) {
		p40
	}
}
.foo {
	margin: 10px;
	margin: a
	.hoo {
		color: #000;
	}
}
`;
const invokeCompletionContext = {
    triggerKind: vscode_1.CompletionTriggerKind.Invoke,
    triggerCharacter: undefined,
};
suite('Tests for Expand Abbreviations (CSS)', () => {
    teardown(testUtils_1.closeAllEditors);
    test('Expand abbreviation (CSS)', () => {
        return (0, testUtils_1.withRandomFileEditor)(cssContents, 'css', (editor, _) => {
            editor.selections = [new vscode_1.Selection(3, 1, 3, 6), new vscode_1.Selection(5, 1, 5, 6)];
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), cssContents.replace(/pos:f/g, 'position: fixed;'));
                return Promise.resolve();
            });
        });
    });
    test('No emmet when cursor inside comment (CSS)', () => {
        const testContent = `
.foo {
	/*margin: 10px;
	m10
	padding: 10px;*/
	display: auto;
}
`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(3, 4, 3, 4);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), testContent);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 10), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion at property value`);
                }
                return Promise.resolve();
            });
        });
    });
    test('No emmet when cursor in selector of a rule (CSS)', () => {
        const testContent = `
.foo {
	margin: 10px;
}

nav#
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(5, 4, 5, 4);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), testContent);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 10), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion at property value`);
                }
                return Promise.resolve();
            });
        });
    });
    test('Skip when typing property values when there is a property in the next line (CSS)', () => {
        const testContent = `
.foo {
	margin: a
	margin: 10px;
}
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(2, 10, 2, 10);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), testContent);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 10), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion at property value`);
                }
                return Promise.resolve();
            });
        });
    });
    test('Skip when typing the last property value in single line rules (CSS)', () => {
        const testContent = `.foo {padding: 10px; margin: a}`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(0, 30, 0, 30);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), testContent);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(0, 30), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion at property value`);
                }
                return Promise.resolve();
            });
        });
    });
    test('Allow hex color or !important when typing property values when there is a property in the next line (CSS)', () => {
        const testContent = `
.foo {
	margin: #12 !
	margin: 10px;
}
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise1 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 12), cancelSrc.token, invokeCompletionContext);
            const completionPromise2 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 14), cancelSrc.token, invokeCompletionContext);
            if (!completionPromise1 || !completionPromise2) {
                assert.strictEqual(1, 2, `Completion promise wasnt returned`);
                return Promise.resolve();
            }
            const callBack = (completionList, expandedText) => {
                if (!completionList.items || !completionList.items.length) {
                    assert.strictEqual(1, 2, `Empty Completions`);
                    return;
                }
                const emmetCompletionItem = completionList.items[0];
                assert.strictEqual(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
                assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
            };
            return Promise.all([completionPromise1, completionPromise2]).then(([result1, result2]) => {
                assert.ok(result1);
                assert.ok(result2);
                callBack(result1, '#121212');
                callBack(result2, '!important');
                editor.selections = [new vscode_1.Selection(2, 12, 2, 12), new vscode_1.Selection(2, 14, 2, 14)];
                return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                    assert.strictEqual(editor.document.getText(), testContent.replace('#12', '#121212').replace('!', '!important'));
                });
            });
        });
    });
    test('Skip when typing property values when there is a property in the previous line (CSS)', () => {
        const testContent = `
.foo {
	margin: 10px;
	margin: a
}
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(3, 10, 3, 10);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), testContent);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(3, 10), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion at property value`);
                }
                return Promise.resolve();
            });
        });
    });
    test('Allow hex color or !important when typing property values when there is a property in the previous line (CSS)', () => {
        const testContent = `
.foo {
	margin: 10px;
	margin: #12 !
}
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise1 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(3, 12), cancelSrc.token, invokeCompletionContext);
            const completionPromise2 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(3, 14), cancelSrc.token, invokeCompletionContext);
            if (!completionPromise1 || !completionPromise2) {
                assert.strictEqual(1, 2, `Completion promise wasnt returned`);
                return Promise.resolve();
            }
            const callBack = (completionList, expandedText) => {
                if (!completionList.items || !completionList.items.length) {
                    assert.strictEqual(1, 2, `Empty Completions`);
                    return;
                }
                const emmetCompletionItem = completionList.items[0];
                assert.strictEqual(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
                assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
            };
            return Promise.all([completionPromise1, completionPromise2]).then(([result1, result2]) => {
                assert.ok(result1);
                assert.ok(result2);
                callBack(result1, '#121212');
                callBack(result2, '!important');
                editor.selections = [new vscode_1.Selection(3, 12, 3, 12), new vscode_1.Selection(3, 14, 3, 14)];
                return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                    assert.strictEqual(editor.document.getText(), testContent.replace('#12', '#121212').replace('!', '!important'));
                });
            });
        });
    });
    test('Skip when typing property values when it is the only property in the rule (CSS)', () => {
        const testContent = `
.foo {
	margin: a
}
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(2, 10, 2, 10);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), testContent);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 10), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion at property value`);
                }
                return Promise.resolve();
            });
        });
    });
    test('Allow hex colors or !important when typing property values when it is the only property in the rule (CSS)', () => {
        const testContent = `
.foo {
	margin: #12 !
}
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise1 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 12), cancelSrc.token, invokeCompletionContext);
            const completionPromise2 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 14), cancelSrc.token, invokeCompletionContext);
            if (!completionPromise1 || !completionPromise2) {
                assert.strictEqual(1, 2, `Completion promise wasnt returned`);
                return Promise.resolve();
            }
            const callBack = (completionList, expandedText) => {
                if (!completionList.items || !completionList.items.length) {
                    assert.strictEqual(1, 2, `Empty Completions`);
                    return;
                }
                const emmetCompletionItem = completionList.items[0];
                assert.strictEqual(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
                assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
            };
            return Promise.all([completionPromise1, completionPromise2]).then(([result1, result2]) => {
                assert.ok(result1);
                assert.ok(result2);
                callBack(result1, '#121212');
                callBack(result2, '!important');
                editor.selections = [new vscode_1.Selection(2, 12, 2, 12), new vscode_1.Selection(2, 14, 2, 14)];
                return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                    assert.strictEqual(editor.document.getText(), testContent.replace('#12', '#121212').replace('!', '!important'));
                });
            });
        });
    });
    test('# shouldnt expand to hex color when in selector (CSS)', () => {
        const testContent = `
.foo {
	#
}
		`;
        return (0, testUtils_1.withRandomFileEditor)(testContent, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(2, 2, 2, 2);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), testContent);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(2, 2), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion of hex color at property name`);
                }
                return Promise.resolve();
            });
        });
    });
    test('Expand abbreviation in completion list (CSS)', () => {
        const abbreviation = 'pos:f';
        const expandedText = 'position: fixed;';
        return (0, testUtils_1.withRandomFileEditor)(cssContents, 'css', (editor, _) => {
            editor.selection = new vscode_1.Selection(3, 1, 3, 6);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise1 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(3, 6), cancelSrc.token, invokeCompletionContext);
            const completionPromise2 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(5, 6), cancelSrc.token, invokeCompletionContext);
            if (!completionPromise1 || !completionPromise2) {
                assert.strictEqual(1, 2, `Problem with expanding pos:f`);
                return Promise.resolve();
            }
            const callBack = (completionList) => {
                if (!completionList.items || !completionList.items.length) {
                    assert.strictEqual(1, 2, `Problem with expanding pos:f`);
                    return;
                }
                const emmetCompletionItem = completionList.items[0];
                assert.strictEqual(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
                assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
                assert.strictEqual(emmetCompletionItem.filterText, abbreviation, `FilterText of completion item doesnt match.`);
            };
            return Promise.all([completionPromise1, completionPromise2]).then(([result1, result2]) => {
                assert.ok(result1);
                assert.ok(result2);
                callBack(result1);
                callBack(result2);
                return Promise.resolve();
            });
        });
    });
    test('Expand abbreviation (SCSS)', () => {
        return (0, testUtils_1.withRandomFileEditor)(scssContents, 'scss', (editor, _) => {
            editor.selections = [
                new vscode_1.Selection(3, 4, 3, 4),
                new vscode_1.Selection(5, 5, 5, 5),
                new vscode_1.Selection(11, 4, 11, 4),
                new vscode_1.Selection(14, 5, 14, 5)
            ];
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), scssContents.replace(/p(\d\d)/g, 'padding: $1px;'));
                return Promise.resolve();
            });
        });
    });
    test('Expand abbreviation in completion list (SCSS)', () => {
        return (0, testUtils_1.withRandomFileEditor)(scssContents, 'scss', (editor, _) => {
            editor.selection = new vscode_1.Selection(3, 4, 3, 4);
            const cancelSrc = new vscode_1.CancellationTokenSource();
            const completionPromise1 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(3, 4), cancelSrc.token, invokeCompletionContext);
            const completionPromise2 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(5, 5), cancelSrc.token, invokeCompletionContext);
            const completionPromise3 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(11, 4), cancelSrc.token, invokeCompletionContext);
            const completionPromise4 = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(14, 5), cancelSrc.token, invokeCompletionContext);
            if (!completionPromise1) {
                assert.strictEqual(1, 2, `Problem with expanding padding abbreviations at line 3 col 4`);
            }
            if (!completionPromise2) {
                assert.strictEqual(1, 2, `Problem with expanding padding abbreviations at line 5 col 5`);
            }
            if (!completionPromise3) {
                assert.strictEqual(1, 2, `Problem with expanding padding abbreviations at line 11 col 4`);
            }
            if (!completionPromise4) {
                assert.strictEqual(1, 2, `Problem with expanding padding abbreviations at line 14 col 5`);
            }
            if (!completionPromise1 || !completionPromise2 || !completionPromise3 || !completionPromise4) {
                return Promise.resolve();
            }
            const callBack = (completionList, abbreviation, expandedText) => {
                if (!completionList.items || !completionList.items.length) {
                    assert.strictEqual(1, 2, `Problem with expanding m10`);
                    return;
                }
                const emmetCompletionItem = completionList.items[0];
                assert.strictEqual(emmetCompletionItem.label, expandedText, `Label of completion item doesnt match.`);
                assert.strictEqual((emmetCompletionItem.documentation || '').replace(/\|/g, ''), expandedText, `Docs of completion item doesnt match.`);
                assert.strictEqual(emmetCompletionItem.filterText, abbreviation, `FilterText of completion item doesnt match.`);
            };
            return Promise.all([completionPromise1, completionPromise2, completionPromise3, completionPromise4]).then(([result1, result2, result3, result4]) => {
                assert.ok(result1);
                assert.ok(result2);
                assert.ok(result3);
                assert.ok(result4);
                callBack(result1, 'p10', 'padding: 10px;');
                callBack(result2, 'p20', 'padding: 20px;');
                callBack(result3, 'p30', 'padding: 30px;');
                callBack(result4, 'p40', 'padding: 40px;');
                return Promise.resolve();
            });
        });
    });
    test('Invalid locations for abbreviations in scss', () => {
        const scssContentsNoExpand = `
m10
		.boo {
			margin: 10px;
			.hoo {
				background:
			}
		}
		`;
        return (0, testUtils_1.withRandomFileEditor)(scssContentsNoExpand, 'scss', (editor, _) => {
            editor.selections = [
                new vscode_1.Selection(1, 3, 1, 3), // outside rule
                new vscode_1.Selection(5, 15, 5, 15) // in the value part of property value
            ];
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), scssContentsNoExpand);
                return Promise.resolve();
            });
        });
    });
    test('Invalid locations for abbreviations in scss in completion list', () => {
        const scssContentsNoExpand = `
m10
		.boo {
			margin: 10px;
			.hoo {
				background:
			}
		}
		`;
        return (0, testUtils_1.withRandomFileEditor)(scssContentsNoExpand, 'scss', (editor, _) => {
            editor.selection = new vscode_1.Selection(1, 3, 1, 3); // outside rule
            const cancelSrc = new vscode_1.CancellationTokenSource();
            let completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            if (completionPromise) {
                assert.strictEqual(1, 2, `m10 gets expanded in invalid location (outside rule)`);
            }
            editor.selection = new vscode_1.Selection(5, 15, 5, 15); // in the value part of property value
            completionPromise = completionProvider.provideCompletionItems(editor.document, editor.selection.active, cancelSrc.token, invokeCompletionContext);
            if (completionPromise) {
                return completionPromise.then((completionList) => {
                    if (completionList && completionList.items && completionList.items.length > 0) {
                        assert.strictEqual(1, 2, `m10 gets expanded in invalid location (n the value part of property value)`);
                    }
                    return Promise.resolve();
                });
            }
            return Promise.resolve();
        });
    });
    test('Skip when typing property values when there is a nested rule in the next line (SCSS)', () => {
        return (0, testUtils_1.withRandomFileEditor)(scssContents, 'scss', (editor, _) => {
            editor.selection = new vscode_1.Selection(19, 10, 19, 10);
            return (0, abbreviationActions_1.expandEmmetAbbreviation)(null).then(() => {
                assert.strictEqual(editor.document.getText(), scssContents);
                const cancelSrc = new vscode_1.CancellationTokenSource();
                const completionPromise = completionProvider.provideCompletionItems(editor.document, new vscode_1.Position(19, 10), cancelSrc.token, invokeCompletionContext);
                if (completionPromise) {
                    assert.strictEqual(1, 2, `Invalid completion at property value`);
                }
                return Promise.resolve();
            });
        });
    });
});
//# sourceMappingURL=cssAbbreviationAction.test.js.map