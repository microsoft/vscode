/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { resolveMergeConflict } from '../scoredEditsReconciler';

suite('can resolve merge conflicts', () => {
	test('1', () => {
		const fileContents = `{
    "$web-editor.format-json": true,
    "$web-editor.default-url": "https://microsoft.github.io/vscode-workbench-recorder-viewer/?editRating",
    "edits": [
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": null,
            "scoreCategory": "bad",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    1295,
                    1295,
                    ");\\n\\t}\\n\\n\\tresetLastEditTime() {\\n\\t\\tthis._lastEditTime.set(undefined, undefined"
                ]
            ],
            "scoreCategory": "bad",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    1295,
                    1295,
                    ");\\n\\t}\\n\\t\\n\\tpublic getLastEditTime(): number | undefined {\\n\\t\\treturn this._lastEditTime.get("
                ]
            ],
            "scoreCategory": "bad",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    787,
                    864,
                    "lastEditTime !== undefined && Date.now() - lastEditTime"
                ]
            ],
            "scoreCategory": "nextEdit",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    780,
                    893,
                    "if (lastEditTime === undefined) {\\n\\t\\t\\treturn false;\\n\\t\\t}\\n\\t\\treturn Date.now() - lastEditTime < 5000"
                ]
            ],
            "scoreCategory": "nextEdit",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    780,
                    893,
                    "if (lastEditTime === undefined) {\\n\\t\\t\\treturn false;\\n\\t\\t}\\n\\t\\treturn Date.now() - lastEditTime < 1000"
                ]
            ],
            "scoreCategory": "nextEdit",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    787,
                    893,
                    "lastEditTime !== undefined && Date.now() - lastEditTime < 30 * 1000 /* "
                ]
            ],
            "scoreCategory": "bad",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    787,
                    893,
                    "lastEditTime !== undefined && Date.now() - lastEditTime < 30 * 1000"
                ]
            ],
            "scoreCategory": "nextEdit",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
<<<<<<< HEAD
                    893,
                    893,
                    ";\\n\\t}\\n\\n\\tresetLastEditTime() {\\n\\t\\tthis._lastEditTime.set(undefined, undefined)"
                ]
            ],
            "scoreCategory": "bad",
=======
                    787,
                    894,
                    "lastEditTime !== undefined && (Date.now() - lastEditTime) < 5000; // 5 seconds"
                ]
            ],
            "scoreCategory": "nextEdit",
            "score": 0
        },
        {
            "documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
            "edit": [
                [
                    787,
                    894,
                    "lastEditTime !== undefined && Date.now() - lastEditTime < 5000; // 5 seconds"
                ]
            ],
            "scoreCategory": "nextEdit",
>>>>>>> a60bc6ab1 (nes: nearby: trim system message and run and score stests)
            "score": 0
        }
    ],
    "scoringContext": {
        "kind": "recording",
        "recording": {
            "log": [
                {
                    "kind": "meta",
                    "data": {
                        "kind": "log-origin",
                        "uuid": "a29a16dc-e6a3-41a7-9ebc-6c83958f00c9",
                        "repoRootUri": "file:///users/ulugbekna/code/vscode-copilot",
                        "opStart": 54006,
                        "opEndEx": 54298
                    }
                },
                {
                    "kind": "documentEncountered",
                    "id": 1,
                    "time": 1733841300283,
                    "relativePath": "../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts"
                },
                {
                    "kind": "setContent",
                    "id": 1,
                    "time": 1733841300283,
                    "content": "/*---------------------------------------------------------------------------------------------\\n *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.\\n *--------------------------------------------------------------------------------------------*/\\n\\nimport { Disposable } from '../../../util/vs/base/common/lifecycle';\\nimport { mapObservableArrayCached, observableValue, runOnChange } from '../../../util/vs/base/common/observable';\\nimport { VSCodeWorkspace } from './vscodeWorkspace';\\n\\nexport class LastEditTimeTracker extends Disposable {\\n\\n\\tprivate readonly _lastEditTime = observableValue<number | undefined>(this, undefined);\\n\\tpublic readonly lastEditTime = this._lastEditTime;\\n\\n\\tconstructor(\\n\\t\\tworkspace: VSCodeWorkspace,\\n\\t) {\\n\\t\\tsuper();\\n\\n\\t\\tmapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {\\n\\t\\t\\tstore.add(runOnChange(doc.value, (_curState, _oldState, deltas) => {\\n\\t\\t\\t\\tif (deltas.length > 0 && deltas.some(edit => edit.edits.length > 0)) {\\n\\t\\t\\t\\t\\tthis._lastEditTime.set(Date.now(), undefined);\\n\\t\\t\\t\\t}\\n\\t\\t\\t}));\\n\\t\\t}).recomputeInitiallyAndOnChange(this._store);\\n\\t}\\n}\\n",
                    "v": 2983
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841247985,
                    "edit": [
                        [
                            648,
                            648,
                            "// "
                        ]
                    ],
                    "v": 2986
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841249517,
                    "edit": [
                        [
                            701,
                            701,
                            "\\n\\t\\n\\t"
                        ]
                    ],
                    "v": 2998
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841250520,
                    "edit": [
                        [
                            702,
                            703,
                            ""
                        ]
                    ],
                    "v": 3002
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841250833,
                    "edit": [
                        [
                            704,
                            704,
                            "get "
                        ]
                    ],
                    "v": 3017
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841253100,
                    "edit": [
                        [
                            703,
                            708,
                            "\\tget lastEditTime() {\\n\\t}"
                        ]
                    ],
                    "v": 3029
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841254916,
                    "edit": [
                        [
                            708,
                            720,
                            ""
                        ]
                    ],
                    "v": 3035
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841260333,
                    "edit": [],
                    "v": 3050
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841262639,
                    "edit": [
                        [
                            708,
                            708,
                            "hadEdits"
                        ]
                    ],
                    "v": 3082
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841267155,
                    "edit": [
                        [
                            716,
                            716,
                            "Recently"
                        ]
                    ],
                    "v": 3122
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841269428,
                    "edit": [
                        [
                            728,
                            728,
                            "\\n\\t\\t"
                        ]
                    ],
                    "v": 3127
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841275244,
                    "edit": [
                        [
                            729,
                            731,
                            "\\t\\treturn this._lastEditTime.get() !== undefined && Date.now() - this._lastEditTime.get() < 1000;"
                        ]
                    ],
                    "v": 3131
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841278240,
                    "edit": [
                        [
                            820,
                            824,
                            "30000"
                        ]
                    ],
                    "v": 3167
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841286372,
                    "edit": [
                        [
                            820,
                            825,
                            "30 * 1000 /* "
                        ]
                    ],
                    "v": 3264
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841287540,
                    "edit": [
                        [
                            729,
                            834,
                            "\\t\\treturn this._lastEditTime.get() !== undefined && Date.now() - this._lastEditTime.get() < 30 * 1000 /* 30 seconds */;"
                        ]
                    ],
                    "v": 3268
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841293443,
                    "edit": [
                        [
                            811,
                            817,
                            "."
                        ]
                    ],
                    "v": 3308
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841294858,
                    "edit": [
                        [
                            812,
                            812,
                            "get"
                        ]
                    ],
                    "v": 3320
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841298602,
                    "edit": [
                        [
                            728,
                            728,
                            "\\n\\t\\tconst "
                        ]
                    ],
                    "v": 3350
                },
                {
                    "kind": "changed",
                    "id": 1,
                    "time": 1733841300283,
                    "edit": [
                        [
                            729,
                            737,
                            "\\t\\tconst lastEditTime = this._lastEditTime.get();"
                        ]
                    ],
                    "v": 3354
                }
            ],
            "nextUserEdit": {
                "edit": [
                    [
                        787,
                        811,
                        "lastEditTime"
                    ],
                    [
                        842,
                        864,
                        "lastEditTime"
                    ]
                ],
                "relativePath": "../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
                "originalOpIdx": 54392
            }
        }
    }
}`;

		const resolvedFile = resolveMergeConflict(fileContents);

		expect(resolvedFile).toMatchInlineSnapshot(`
			"{
				"$web-editor.format-json": true,
				"$web-editor.default-url": "https://microsoft.github.io/vscode-workbench-recorder-viewer/?editRating",
				"edits": [
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": null,
						"scoreCategory": "bad",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								1295,
								1295,
								");\\n\\t}\\n\\n\\tresetLastEditTime() {\\n\\t\\tthis._lastEditTime.set(undefined, undefined"
							]
						],
						"scoreCategory": "bad",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								1295,
								1295,
								");\\n\\t}\\n\\t\\n\\tpublic getLastEditTime(): number | undefined {\\n\\t\\treturn this._lastEditTime.get("
							]
						],
						"scoreCategory": "bad",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								787,
								864,
								"lastEditTime !== undefined && Date.now() - lastEditTime"
							]
						],
						"scoreCategory": "nextEdit",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								780,
								893,
								"if (lastEditTime === undefined) {\\n\\t\\t\\treturn false;\\n\\t\\t}\\n\\t\\treturn Date.now() - lastEditTime < 5000"
							]
						],
						"scoreCategory": "nextEdit",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								780,
								893,
								"if (lastEditTime === undefined) {\\n\\t\\t\\treturn false;\\n\\t\\t}\\n\\t\\treturn Date.now() - lastEditTime < 1000"
							]
						],
						"scoreCategory": "nextEdit",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								787,
								893,
								"lastEditTime !== undefined && Date.now() - lastEditTime < 30 * 1000 /* "
							]
						],
						"scoreCategory": "bad",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								787,
								893,
								"lastEditTime !== undefined && Date.now() - lastEditTime < 30 * 1000"
							]
						],
						"scoreCategory": "nextEdit",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								893,
								893,
								";\\n\\t}\\n\\n\\tresetLastEditTime() {\\n\\t\\tthis._lastEditTime.set(undefined, undefined)"
							]
						],
						"scoreCategory": "bad",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								787,
								894,
								"lastEditTime !== undefined && (Date.now() - lastEditTime) < 5000; // 5 seconds"
							]
						],
						"scoreCategory": "nextEdit",
						"score": 0
					},
					{
						"documentUri": "file:///users/ulugbekna/code/vscode-copilot/../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
						"edit": [
							[
								787,
								894,
								"lastEditTime !== undefined && Date.now() - lastEditTime < 5000; // 5 seconds"
							]
						],
						"scoreCategory": "nextEdit",
						"score": 0
					}
				],
				"scoringContext": {
					"kind": "recording",
					"recording": {
						"log": [
							{
								"kind": "meta",
								"data": {
									"kind": "log-origin",
									"uuid": "a29a16dc-e6a3-41a7-9ebc-6c83958f00c9",
									"repoRootUri": "file:///users/ulugbekna/code/vscode-copilot",
									"opStart": 54006,
									"opEndEx": 54298
								}
							},
							{
								"kind": "documentEncountered",
								"id": 1,
								"time": 1733841300283,
								"relativePath": "../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts"
							},
							{
								"kind": "setContent",
								"id": 1,
								"time": 1733841300283,
								"content": "/*---------------------------------------------------------------------------------------------\\n *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.\\n *--------------------------------------------------------------------------------------------*/\\n\\nimport { Disposable } from '../../../util/vs/base/common/lifecycle';\\nimport { mapObservableArrayCached, observableValue, runOnChange } from '../../../util/vs/base/common/observable';\\nimport { VSCodeWorkspace } from './vscodeWorkspace';\\n\\nexport class LastEditTimeTracker extends Disposable {\\n\\n\\tprivate readonly _lastEditTime = observableValue<number | undefined>(this, undefined);\\n\\tpublic readonly lastEditTime = this._lastEditTime;\\n\\n\\tconstructor(\\n\\t\\tworkspace: VSCodeWorkspace,\\n\\t) {\\n\\t\\tsuper();\\n\\n\\t\\tmapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {\\n\\t\\t\\tstore.add(runOnChange(doc.value, (_curState, _oldState, deltas) => {\\n\\t\\t\\t\\tif (deltas.length > 0 && deltas.some(edit => edit.edits.length > 0)) {\\n\\t\\t\\t\\t\\tthis._lastEditTime.set(Date.now(), undefined);\\n\\t\\t\\t\\t}\\n\\t\\t\\t}));\\n\\t\\t}).recomputeInitiallyAndOnChange(this._store);\\n\\t}\\n}\\n",
								"v": 2983
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841247985,
								"edit": [
									[
										648,
										648,
										"// "
									]
								],
								"v": 2986
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841249517,
								"edit": [
									[
										701,
										701,
										"\\n\\t\\n\\t"
									]
								],
								"v": 2998
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841250520,
								"edit": [
									[
										702,
										703,
										""
									]
								],
								"v": 3002
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841250833,
								"edit": [
									[
										704,
										704,
										"get "
									]
								],
								"v": 3017
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841253100,
								"edit": [
									[
										703,
										708,
										"\\tget lastEditTime() {\\n\\t}"
									]
								],
								"v": 3029
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841254916,
								"edit": [
									[
										708,
										720,
										""
									]
								],
								"v": 3035
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841260333,
								"edit": [],
								"v": 3050
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841262639,
								"edit": [
									[
										708,
										708,
										"hadEdits"
									]
								],
								"v": 3082
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841267155,
								"edit": [
									[
										716,
										716,
										"Recently"
									]
								],
								"v": 3122
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841269428,
								"edit": [
									[
										728,
										728,
										"\\n\\t\\t"
									]
								],
								"v": 3127
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841275244,
								"edit": [
									[
										729,
										731,
										"\\t\\treturn this._lastEditTime.get() !== undefined && Date.now() - this._lastEditTime.get() < 1000;"
									]
								],
								"v": 3131
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841278240,
								"edit": [
									[
										820,
										824,
										"30000"
									]
								],
								"v": 3167
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841286372,
								"edit": [
									[
										820,
										825,
										"30 * 1000 /* "
									]
								],
								"v": 3264
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841287540,
								"edit": [
									[
										729,
										834,
										"\\t\\treturn this._lastEditTime.get() !== undefined && Date.now() - this._lastEditTime.get() < 30 * 1000 /* 30 seconds */;"
									]
								],
								"v": 3268
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841293443,
								"edit": [
									[
										811,
										817,
										"."
									]
								],
								"v": 3308
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841294858,
								"edit": [
									[
										812,
										812,
										"get"
									]
								],
								"v": 3320
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841298602,
								"edit": [
									[
										728,
										728,
										"\\n\\t\\tconst "
									]
								],
								"v": 3350
							},
							{
								"kind": "changed",
								"id": 1,
								"time": 1733841300283,
								"edit": [
									[
										729,
										737,
										"\\t\\tconst lastEditTime = this._lastEditTime.get();"
									]
								],
								"v": 3354
							}
						],
						"nextUserEdit": {
							"edit": [
								[
									787,
									811,
									"lastEditTime"
								],
								[
									842,
									864,
									"lastEditTime"
								]
							],
							"relativePath": "../../../../Users/ulugbekna/code/vscode-copilot/src/extension/inlineEdits/vscode-node/lastEditTimeTracker.ts",
							"originalOpIdx": 54392
						}
					}
				}
			}"
		`);
	});
});
