/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import 'mocha';
import { CommitType } from '../interfaces';
import { MergeConflictParser } from '../mergeConflictParser';

suite('Merge conflict resolution', () => {
	for (const eol of ['\n', '\r\n']) {
		const eolName = eol === '\n' ? 'LF' : 'CRLF';
		for (const type of [CommitType.Current, CommitType.Incoming, CommitType.Both]) {
			const typeName = type === CommitType.Current ? 'current' : type === CommitType.Incoming ? 'incoming' : 'both';
			for (const blankSide of ['current', 'incoming']) {
				test(`accept ${typeName}, ${eolName}, blank ${blankSide} versus empty`, async () => {
					const current = blankSide === 'current' ? eol : '';
					const incoming = blankSide === 'incoming' ? eol : '';
					const document = await vscode.workspace.openTextDocument({
						content: `before${eol}<<<<<<< HEAD${eol}${current}=======${eol}${incoming}>>>>>>> incoming${eol}after${eol}`
					});
					// applyEdit does not emit telemetry.
					const conflicts = MergeConflictParser.scanDocument(document, undefined!);
					assert.strictEqual(conflicts.length, 1);
					const edit = new vscode.WorkspaceEdit();
					conflicts[0].applyEdit(type, document, {
						replace: (range, newText) => edit.replace(document.uri, range, newText)
					});
					assert.ok(await vscode.workspace.applyEdit(edit));
					const expected = type === CommitType.Both ? current + incoming : type === CommitType.Current ? current : incoming;
					assert.strictEqual(document.getText(), `before${eol}${expected}after${eol}`);
				});
			}
			for (const content of ['', eol, eol.repeat(2), `text${eol}`]) {
				for (const hasCommonAncestor of [false, true]) {
					test(`accept ${typeName}, ${eolName}, content ${JSON.stringify(content)}, diff3 ${hasCommonAncestor}`, async () => {
						const current = type === CommitType.Incoming ? `other${eol}` : content;
						const incoming = type === CommitType.Incoming ? content : `other${eol}`;
						const document = await vscode.workspace.openTextDocument({
							content: `before${eol}<<<<<<< HEAD${eol}${current}${hasCommonAncestor ? `||||||| base${eol}base${eol}` : ''}=======${eol}${incoming}>>>>>>> incoming${eol}after${eol}`
						});
						// applyEdit does not emit telemetry.
						const conflicts = MergeConflictParser.scanDocument(document, undefined!);
						assert.strictEqual(conflicts.length, 1);
						const edit = new vscode.WorkspaceEdit();
						conflicts[0].applyEdit(type, document, {
							replace: (range, newText) => edit.replace(document.uri, range, newText)
						});
						assert.ok(await vscode.workspace.applyEdit(edit));
						const expected = type === CommitType.Both ? current + incoming : content;
						assert.strictEqual(document.getText(), `before${eol}${expected}after${eol}`);
					});
				}
			}
		}
	}
});
