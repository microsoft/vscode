import {TextEdit, Position, Range, TextDocument} from "vscode";
import dmp = require("diff-match-patch");
import {EOL} from "os";
import * as fs from "fs";
import * as path from "path";
const tmp = require("tmp");

// Code borrowed from goFormat.ts (Go Extension for VS Code)
const EDIT_DELETE = 0;
const EDIT_INSERT = 1;
const EDIT_REPLACE = 2;
const NEW_LINE_LENGTH = EOL.length;

class Patch {
    diffs: dmp.Diff[];
    start1: number;
    start2: number;
    length1: number;
    length2: number;
}

class Edit {
    action: number;
    start: Position;
    end: Position;
    text: string;

    constructor(action: number, start: Position) {
        this.action = action;
        this.start = start;
        this.text = "";
    }

    apply(): TextEdit {
        switch (this.action) {
            case EDIT_INSERT:
                return TextEdit.insert(this.start, this.text);
            case EDIT_DELETE:
                return TextEdit.delete(new Range(this.start, this.end));
            case EDIT_REPLACE:
                return TextEdit.replace(new Range(this.start, this.end), this.text);
        }
    }
}

export function getTextEditsFromPatch(before: string, patch: string): TextEdit[] {
    if (patch.startsWith("---")) {
        // Strip the first two lines
        patch = patch.substring(patch.indexOf("@@"));
    }

    let d = new dmp.diff_match_patch();
    let patches = <Patch[]>(<any>d).patch_fromText(patch);
    if (!Array.isArray(patches) || patches.length === 0) {
        throw new Error("Unable to parse Patch string");
    }
    // Add line feeds
    patches[0].diffs.forEach(diff => {
        diff[1] += EOL;
    });
    return getTextEditsInternal(before, patches[0].diffs, patches[0].start1);
}
export function getTextEdits(before: string, after: string): TextEdit[] {
    let d = new dmp.diff_match_patch();
    let diffs = d.diff_main(before, after);
    return getTextEditsInternal(before, diffs);
}
function getTextEditsInternal(before: string, diffs: [number, string][], startLine: number = 0): TextEdit[] {
    let line = startLine;
    let character = 0;
    if (line > 0) {
        let beforeLines = <string[]>before.split(/\r?\n/g);
        beforeLines.filter((l, i) => i < line).forEach(l => character += l.length + NEW_LINE_LENGTH);
    }
    let edits: TextEdit[] = [];
    let edit: Edit = null;

    for (let i = 0; i < diffs.length; i++) {
        let start = new Position(line, character);

        // Compute the line/character after the diff is applied.
        for (let curr = 0; curr < diffs[i][1].length; curr++) {
            if (diffs[i][1][curr] !== "\n") {
                character++;
            } else {
                character = 0;
                line++;
            }
        }

        switch (diffs[i][0]) {
            case dmp.DIFF_DELETE:
                if (edit == null) {
                    edit = new Edit(EDIT_DELETE, start);
                } else if (edit.action !== EDIT_DELETE) {
                    throw new Error("cannot format due to an internal error.");
                }
                edit.end = new Position(line, character);
                break;

            case dmp.DIFF_INSERT:
                if (edit == null) {
                    edit = new Edit(EDIT_INSERT, start);
                } else if (edit.action === EDIT_DELETE) {
                    edit.action = EDIT_REPLACE;
                }
                // insert and replace edits are all relative to the original state
                // of the document, so inserts should reset the current line/character
                // position to the start.		
                line = start.line;
                character = start.character;
                edit.text += diffs[i][1];
                break;

            case dmp.DIFF_EQUAL:
                if (edit != null) {
                    edits.push(edit.apply());
                    edit = null;
                }
                break;
        }
    }

    if (edit != null) {
        edits.push(edit.apply());
    }

    return edits;
}

export function getTempFileWithDocumentContents(document: TextDocument): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let ext = path.extname(document.uri.fsPath);
        let tmp = require("tmp");
        tmp.file({ postfix: ext }, function (err, tmpFilePath, fd) {
            if (err) {
                return reject(err);
            }
            fs.writeFile(tmpFilePath, document.getText(), ex => {
                if (ex) {
                    return reject(`Failed to create a temporary file, ${ex.message}`);
                }
                resolve(tmpFilePath);
            });
        });
    });
}