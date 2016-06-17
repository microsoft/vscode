//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {AutoPep8Formatter} from "../client/formatters/autoPep8Formatter";
import {YapfFormatter} from "../client/formatters/yapfFormatter";
import * as path from "path";
import * as settings from "../client/common/configSettings";
import * as fs from "fs-extra";

let pythonSettings = settings.PythonSettings.getInstance();
let ch = vscode.window.createOutputChannel("Tests");
let pythoFilesPath = path.join(__dirname, "..", "..", "src", "test", "pythonFiles", "formatting");

function closeActiveEditor() {
    if (vscode.window.activeTextEditor) {
        vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }
}
suite("Formatting", () => {
    test("AutoPep8", done => {
        let fileToFormat = path.join(pythoFilesPath, "beforeAutoPep8.py");
        vscode.workspace.openTextDocument(fileToFormat).then(textDocument => {
            vscode.window.showTextDocument(textDocument).then(textEditor => {
                let formatter = new AutoPep8Formatter(ch, pythonSettings, pythoFilesPath);
                return formatter.formatDocument(textDocument, null, null).then(edits => {
                    textEditor.edit(editBuilder => {
                        edits.forEach(edit => editBuilder.replace(edit.range, edit.newText));
                    }).then(edited => {
                        let formattedFile = path.join(pythoFilesPath, "afterAutoPep8.py");
                        let formattedContents = fs.readFile(formattedFile, "utf-8", (error, data) => {
                            if (error) {
                                return assert.fail(error, "", "Failed to read formatted file");
                            }
                            assert.equal(textEditor.document.getText(), data, "Formatted text is not the same");
                        });
                    });
                }, error => {
                    assert.fail(error, "", "Error in Formatting, " + error);
                });
            }, error => {
                assert.fail(error, "", "Error in Formatting, " + error);
            });
        }, error => {
            assert.fail(error, "", "Error in Opening Document, " + error);
        }).then(() => done(), done).then(() => closeActiveEditor(), closeActiveEditor);
    });

    test("Yapf", done => {
        let fileToFormat = path.join(pythoFilesPath, "beforeYapf.py");
        vscode.workspace.openTextDocument(fileToFormat).then(textDocument => {
            vscode.window.showTextDocument(textDocument).then(textEditor => {
                let formatter = new YapfFormatter(ch, pythonSettings, pythoFilesPath);
                return formatter.formatDocument(textDocument, null, null).then(edits => {
                    textEditor.edit(editBuilder => {
                        edits.forEach(edit => editBuilder.replace(edit.range, edit.newText));
                    }).then(edited => {
                        let formattedFile = path.join(pythoFilesPath, "afterYapf.py");
                        let formattedContents = fs.readFile(formattedFile, "utf-8", (error, data) => {
                            if (error) {
                                return assert.fail(error, "", "Failed to read formatted file");
                            }
                            assert.equal(textEditor.document.getText(), data, "Formatted text is not the same");
                        });
                    });
                }, error => {
                    assert.fail(error, "", "Error in Formatting, " + error);
                });
            }, error => {
                assert.fail(error, "", "Error in Formatting, " + error);
            });
        }, error => {
            assert.fail(error, "", "Error in Opening Document, " + error);
        }).then(() => done(), done).then(() => closeActiveEditor(), closeActiveEditor);
    });

    test("Yapf autoformat on save", done => {
        let formattedFile = path.join(pythoFilesPath, "afterYapfFormatOnSave.py");
        let fileToFormat = path.join(pythoFilesPath, "beforeYapfFormatOnSave.py");
        let fileToCopyFrom = path.join(pythoFilesPath, "beforeYapfFormatOnSaveOriginal.py");
        let formattedFileContents = fs.readFileSync(formattedFile, "utf-8");
        if (fs.existsSync(fileToFormat)) { fs.unlinkSync(fileToFormat); }
        fs.copySync(fileToCopyFrom, fileToFormat);
        const FORMAT_ON_SAVE = pythonSettings.formatting.formatOnSave;
        pythonSettings.formatting.formatOnSave = true;
        pythonSettings.formatting.provider = "yapf";

        vscode.workspace.openTextDocument(fileToFormat).then(textDocument => {
            return vscode.window.showTextDocument(textDocument).then(textEditor => {
                return textEditor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 0), "#");
                }).then(edited => {
                    return textDocument.save().then(saved => {
                        return new Promise<any>((resolve, reject) => {
                            setTimeout(() => {
                                assert.equal(textDocument.getText(), formattedFileContents, "Formatted contents are not the same");
                                resolve();
                            }, 1000);
                        });
                    }, error => {
                        assert.fail(error, "", "Error in Saving Document, " + error);
                    });
                }, error => {
                    assert.fail(error, "", "Error in Editing Document, " + error);
                });
            }, error => {
                assert.fail(error, "", "Error in Showing Document, " + error);
            });
        }, error => {
            assert.fail(error, "", "Error in Opening Document, " + error);
        }).then(() => done(), done).then(() => closeActiveEditor(), closeActiveEditor);
    });
});