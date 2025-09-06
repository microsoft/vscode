/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import * as vscode from "vscode";
import { joinLines, withRandomFileEditor } from "../testUtils";

suite("TypeScript Implementations CodeLens", () => {
	test("should show implementations code lens for overridden methods", async () => {
		await withRandomFileEditor(
			joinLines(
				"abstract class A {",
				"    foo() {}",
				"}",
				"class B extends A {",
				"    foo() {}",
				"}",
			),
			"ts",
			async (editor: vscode.TextEditor, doc: vscode.TextDocument) => {
				assert.strictEqual(
					editor.document,
					doc,
					"Editor and document should match",
				);

				const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
					"vscode.executeCodeLensProvider",
					doc.uri,
				);

				const fooLens = lenses?.find((lens) =>
					doc.getText(lens.range).includes("foo"),
				);

				assert.ok(fooLens, "Expected a CodeLens above foo()");
				assert.match(
					fooLens!.command?.title ?? "",
					/1 implementation/,
					'Expected lens to show "1 implementation"',
				);
			},
		);
	});
});
