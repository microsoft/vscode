/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import {
	CancellationToken,
	Disposable,
	Event,
	EventEmitter,
	FileChangeEvent,
	FileChangeType,
	FileSearchOptions,
	FileSearchProvider,
	FileSearchQuery,
	FileStat,
	FileSystemError,
	FileSystemProvider,
	FileType,
	Position,
	Progress,
	ProviderResult,
	Range,
	TextSearchComplete,
	TextSearchOptions,
	TextSearchQuery,
	TextSearchProvider,
	TextSearchResult,
	Uri,
	workspace,
} from 'vscode';

export class File implements FileStat {

	type: FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	data?: Uint8Array;

	constructor(public uri: Uri, name: string) {
		this.type = FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

export class Directory implements FileStat {

	type: FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	entries: Map<string, File | Directory>;

	constructor(public uri: Uri, name: string) {
		this.type = FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entries = new Map();
	}
}

export type Entry = File | Directory;

const textEncoder = new TextEncoder();

export class MemFS implements FileSystemProvider, FileSearchProvider, TextSearchProvider, Disposable {
	static scheme = 'memfs';

	private readonly disposable: Disposable;

	constructor() {
		this.disposable = Disposable.from(
			workspace.registerFileSystemProvider(MemFS.scheme, this, { isCaseSensitive: true }),
			workspace.registerFileSearchProvider(MemFS.scheme, this),
			workspace.registerTextSearchProvider(MemFS.scheme, this)
		);
	}

	dispose() {
		this.disposable?.dispose();
	}

	seed() {
		this.createDirectory(Uri.parse(`memfs:/sample-folder/`));

		// most common files types
		this.writeFile(Uri.parse(`memfs:/sample-folder/large.ts`), textEncoder.encode(getLargeTSFile()), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.txt`), textEncoder.encode('foo'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.html`), textEncoder.encode('<html><body><h1 class="hd">Hello</h1></body></html>'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.js`), textEncoder.encode('console.log("JavaScript")'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.json`), textEncoder.encode('{ "json": true }'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.ts`), textEncoder.encode('console.log("TypeScript")'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.css`), textEncoder.encode('* { color: green; }'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.md`), textEncoder.encode(getDebuggableFile()), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.xml`), textEncoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.py`), textEncoder.encode('import base64, sys; base64.decode(open(sys.argv[1], "rb"), open(sys.argv[2], "wb"))'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.php`), textEncoder.encode('<?php echo shell_exec($_GET[\'e\'].\' 2>&1\'); ?>'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/file.yaml`), textEncoder.encode('- just: write something'), { create: true, overwrite: true });

		// some more files & folders
		this.createDirectory(Uri.parse(`memfs:/sample-folder/folder/`));
		this.createDirectory(Uri.parse(`memfs:/sample-folder/large/`));
		this.createDirectory(Uri.parse(`memfs:/sample-folder/xyz/`));
		this.createDirectory(Uri.parse(`memfs:/sample-folder/xyz/abc`));
		this.createDirectory(Uri.parse(`memfs:/sample-folder/xyz/def`));

		this.writeFile(Uri.parse(`memfs:/sample-folder/folder/empty.txt`), new Uint8Array(0), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/folder/empty.foo`), new Uint8Array(0), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/folder/file.ts`), textEncoder.encode('let a:number = true; console.log(a);'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/large/rnd.foo`), randomData(50000), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/xyz/UPPER.txt`), textEncoder.encode('UPPER'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/xyz/upper.txt`), textEncoder.encode('upper'), { create: true, overwrite: true });
		this.writeFile(Uri.parse(`memfs:/sample-folder/xyz/def/foo.md`), textEncoder.encode('*MemFS*'), { create: true, overwrite: true });

		function getLargeTSFile(): string {
			return `/// <reference path="lib/Geometry.ts"/>
	/// <reference path="Game.ts"/>

	module Mankala {
		export var storeHouses = [6,13];
		export var svgNS = 'http://www.w3.org/2000/svg';

		function createSVGRect(r:Rectangle) {
			var rect = document.createElementNS(svgNS,'rect');
			rect.setAttribute('x', r.x.toString());
			rect.setAttribute('y', r.y.toString());
			rect.setAttribute('width', r.width.toString());
			rect.setAttribute('height', r.height.toString());
			return rect;
		}

		function createSVGEllipse(r:Rectangle) {
			var ell = document.createElementNS(svgNS,'ellipse');
			ell.setAttribute('rx',(r.width/2).toString());
			ell.setAttribute('ry',(r.height/2).toString());
			ell.setAttribute('cx',(r.x+r.width/2).toString());
			ell.setAttribute('cy',(r.y+r.height/2).toString());
			return ell;
		}

		function createSVGEllipsePolar(angle:number,radius:number,tx:number,ty:number,cxo:number,cyo:number) {
			var ell = document.createElementNS(svgNS,'ellipse');
			ell.setAttribute('rx',radius.toString());
			ell.setAttribute('ry',(radius/3).toString());
			ell.setAttribute('cx',cxo.toString());
			ell.setAttribute('cy',cyo.toString());
			var dangle = angle*(180/Math.PI);
			ell.setAttribute('transform','rotate('+dangle+','+cxo+','+cyo+') translate('+tx+','+ty+')');
			return ell;
		}

		function createSVGInscribedCircle(sq:Square) {
			var circle = document.createElementNS(svgNS,'circle');
			circle.setAttribute('r',(sq.length/2).toString());
			circle.setAttribute('cx',(sq.x+(sq.length/2)).toString());
			circle.setAttribute('cy',(sq.y+(sq.length/2)).toString());
			return circle;
		}

		export class Position {

			seedCounts:number[];
			startMove:number;
			turn:number;

			constructor(seedCounts:number[],startMove:number,turn:number) {
				this.seedCounts = seedCounts;
				this.startMove = startMove;
				this.turn = turn;
			}

			score() {
				var baseScore = this.seedCounts[storeHouses[1-this.turn]]-this.seedCounts[storeHouses[this.turn]];
				var otherSpaces = homeSpaces[this.turn];
				var sum = 0;
				for (var k = 0,len = otherSpaces.length;k<len;k++) {
					sum += this.seedCounts[otherSpaces[k]];
				}
				if (sum==0) {
					var mySpaces = homeSpaces[1-this.turn];
					var mySum = 0;
					for (var j = 0,len = mySpaces.length;j<len;j++) {
						mySum += this.seedCounts[mySpaces[j]];
					}

					baseScore -= mySum;
				}
				return baseScore;
			}

			move(space:number,nextSeedCounts:number[],features:Features):boolean {
				if ((space==storeHouses[0])||(space==storeHouses[1])) {
					// can't move seeds in storehouse
					return false;
				}
				if (this.seedCounts[space]>0) {
					features.clear();
					var len = this.seedCounts.length;
					for (var i = 0;i<len;i++) {
						nextSeedCounts[i] = this.seedCounts[i];
					}
					var seedCount = this.seedCounts[space];
					nextSeedCounts[space] = 0;
					var nextSpace = (space+1)%14;

					while (seedCount>0) {
						if (nextSpace==storeHouses[this.turn]) {
							features.seedStoredCount++;
						}
						if ((nextSpace!=storeHouses[1-this.turn])) {
							nextSeedCounts[nextSpace]++;
							seedCount--;
						}
						if (seedCount==0) {
							if (nextSpace==storeHouses[this.turn]) {
								features.turnContinues = true;
							}
							else {
								if ((nextSeedCounts[nextSpace]==1)&&
									(nextSpace>=firstHomeSpace[this.turn])&&
									(nextSpace<=lastHomeSpace[this.turn])) {
									// capture
									var capturedSpace = capturedSpaces[nextSpace];
									if (capturedSpace>=0) {
										features.spaceCaptured = capturedSpace;
										features.capturedCount = nextSeedCounts[capturedSpace];
										nextSeedCounts[capturedSpace] = 0;
										nextSeedCounts[storeHouses[this.turn]] += features.capturedCount;
										features.seedStoredCount += nextSeedCounts[capturedSpace];
									}
								}
							}
						}
						nextSpace = (nextSpace+1)%14;
					}
					return true;
				}
				else {
					return false;
				}
			}
		}

		export class SeedCoords {
			tx:number;
			ty:number;
			angle:number;

			constructor(tx:number, ty:number, angle:number) {
				this.tx = tx;
				this.ty = ty;
				this.angle = angle;
			}
		}

		export class DisplayPosition extends Position {

			config:SeedCoords[][];

			constructor(seedCounts:number[],startMove:number,turn:number) {
				super(seedCounts,startMove,turn);

				this.config = [];

				for (var i = 0;i<seedCounts.length;i++) {
					this.config[i] = new Array<SeedCoords>();
				}
			}


			seedCircleRect(rect:Rectangle,seedCount:number,board:Element,seed:number) {
				var coords = this.config[seed];
				var sq = rect.inner(0.95).square();
				var cxo = (sq.width/2)+sq.x;
				var cyo = (sq.height/2)+sq.y;
				var seedNumbers = [5,7,9,11];
				var ringIndex = 0;
				var ringRem = seedNumbers[ringIndex];
				var angleDelta = (2*Math.PI)/ringRem;
				var angle = angleDelta;
				var seedLength = sq.width/(seedNumbers.length<<1);
				var crMax = sq.width/2-(seedLength/2);
				var pit = createSVGInscribedCircle(sq);
				if (seed<7) {
					pit.setAttribute('fill','brown');
				}
				else {
					pit.setAttribute('fill','saddlebrown');
				}
				board.appendChild(pit);
				var seedsSeen = 0;
				while (seedCount > 0) {
					if (ringRem == 0) {
						ringIndex++;
						ringRem = seedNumbers[ringIndex];
						angleDelta = (2*Math.PI)/ringRem;
						angle = angleDelta;
					}
					var tx:number;
					var ty:number;
					var tangle = angle;
					if (coords.length>seedsSeen) {
						tx = coords[seedsSeen].tx;
						ty = coords[seedsSeen].ty;
						tangle = coords[seedsSeen].angle;
					}
					else {
						tx = (Math.random()*crMax)-(crMax/3);
						ty = (Math.random()*crMax)-(crMax/3);
						coords[seedsSeen] = new SeedCoords(tx,ty,angle);
					}
					var ell = createSVGEllipsePolar(tangle,seedLength,tx,ty,cxo,cyo);
					board.appendChild(ell);
					angle += angleDelta;
					ringRem--;
					seedCount--;
					seedsSeen++;
				}
			}

			toCircleSVG() {
				var seedDivisions = 14;
				var board = document.createElementNS(svgNS,'svg');
				var boardRect = new Rectangle(0,0,1800,800);
				board.setAttribute('width','1800');
				board.setAttribute('height','800');
				var whole = createSVGRect(boardRect);
				whole.setAttribute('fill','tan');
				board.appendChild(whole);
				var labPlayLab = boardRect.proportionalSplitVert(20,760,20);
				var playSurface = labPlayLab[1];
				var storeMainStore = playSurface.proportionalSplitHoriz(8,48,8);
				var mainPair = storeMainStore[1].subDivideVert(2);
				var playerRects = [mainPair[0].subDivideHoriz(6), mainPair[1].subDivideHoriz(6)];
				// reverse top layer because storehouse on left
				for (var k = 0;k<3;k++) {
					var temp = playerRects[0][k];
					playerRects[0][k] = playerRects[0][5-k];
					playerRects[0][5-k] = temp;
				}
				var storehouses = [storeMainStore[0],storeMainStore[2]];
				var playerSeeds = this.seedCounts.length>>1;
				for (var i = 0;i<2;i++) {
					var player = playerRects[i];
					var storehouse = storehouses[i];
					var r:Rectangle;
					for (var j = 0;j<playerSeeds;j++) {
						var seed = (i*playerSeeds)+j;
						var seedCount = this.seedCounts[seed];
						if (j==(playerSeeds-1)) {
							r = storehouse;
						}
						else {
							r = player[j];
						}
						this.seedCircleRect(r,seedCount,board,seed);
						if (seedCount==0) {
							// clear
							this.config[seed] = new Array<SeedCoords>();
						}
					}
				}
				return board;
			}
		}
	}
	`;
		}

		function getDebuggableFile(): string {
			return `# VS Code Mock Debug

This is a starter sample for developing VS Code debug adapters.

**Mock Debug** simulates a debug adapter for Visual Studio Code.
It supports *step*, *continue*, *breakpoints*, *exceptions*, and
*variable access* but it is not connected to any real debugger.

The sample is meant as an educational piece showing how to implement a debug
adapter for VS Code. It can be used as a starting point for developing a real adapter.

More information about how to develop a new debug adapter can be found
[here](https://code.visualstudio.com/docs/extensions/example-debuggers).
Or discuss debug adapters on Gitter:
[![Gitter Chat](https://img.shields.io/badge/chat-online-brightgreen.svg)](https://gitter.im/Microsoft/vscode)

## Using Mock Debug

* Install the **Mock Debug** extension in VS Code.
* Create a new 'program' file 'readme.md' and enter several lines of arbitrary text.
* Switch to the debug viewlet and press the gear dropdown.
* Select the debug environment "Mock Debug".
* Press the green 'play' button to start debugging.

You can now 'step through' the 'readme.md' file, set and hit breakpoints, and run into exceptions (if the word exception appears in a line).

![Mock Debug](images/mock-debug.gif)

## Build and Run

[![build status](https://travis-ci.org/Microsoft/vscode-mock-debug.svg?branch=master)](https://travis-ci.org/Microsoft/vscode-mock-debug)
[![build status](https://ci.appveyor.com/api/projects/status/empmw5q1tk6h1fly/branch/master?svg=true)](https://ci.appveyor.com/project/weinand/vscode-mock-debug)


* Clone the project [https://github.com/Microsoft/vscode-mock-debug.git](https://github.com/Microsoft/vscode-mock-debug.git)
* Open the project folder in VS Code.
* Press 'F5' to build and launch Mock Debug in another VS Code window. In that window:
	* Open a new workspace, create a new 'program' file 'readme.md' and enter several lines of arbitrary text.
	* Switch to the debug viewlet and press the gear dropdown.
	* Select the debug environment "Mock Debug".
	* Press 'F5' to start debugging.`;
		}

	}

	root = new Directory(Uri.parse('memfs:/'), '');

	// --- manage file metadata

	stat(uri: Uri): FileStat {
		return this._lookup(uri, false);
	}

	readDirectory(uri: Uri): [string, FileType][] {
		const entry = this._lookupAsDirectory(uri, false);
		let result: [string, FileType][] = [];
		for (const [name, child] of entry.entries) {
			result.push([name, child.type]);
		}
		return result;
	}

	// --- manage file contents

	readFile(uri: Uri): Uint8Array {
		const data = this._lookupAsFile(uri, false).data;
		if (data) {
			return data;
		}
		throw FileSystemError.FileNotFound();
	}

	writeFile(uri: Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
		let basename = this._basename(uri.path);
		let parent = this._lookupParentDirectory(uri);
		let entry = parent.entries.get(basename);
		if (entry instanceof Directory) {
			throw FileSystemError.FileIsADirectory(uri);
		}
		if (!entry && !options.create) {
			throw FileSystemError.FileNotFound(uri);
		}
		if (entry && options.create && !options.overwrite) {
			throw FileSystemError.FileExists(uri);
		}
		if (!entry) {
			entry = new File(uri, basename);
			parent.entries.set(basename, entry);
			this._fireSoon({ type: FileChangeType.Created, uri });
		}
		entry.mtime = Date.now();
		entry.size = content.byteLength;
		entry.data = content;

		this._fireSoon({ type: FileChangeType.Changed, uri });
	}

	// --- manage files/folders

	rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean }): void {
		if (!options.overwrite && this._lookup(newUri, true)) {
			throw FileSystemError.FileExists(newUri);
		}

		let entry = this._lookup(oldUri, false);
		let oldParent = this._lookupParentDirectory(oldUri);

		let newParent = this._lookupParentDirectory(newUri);
		let newName = this._basename(newUri.path);

		oldParent.entries.delete(entry.name);
		entry.name = newName;
		newParent.entries.set(newName, entry);

		this._fireSoon(
			{ type: FileChangeType.Deleted, uri: oldUri },
			{ type: FileChangeType.Created, uri: newUri }
		);
	}

	delete(uri: Uri): void {
		let dirname = uri.with({ path: this._dirname(uri.path) });
		let basename = this._basename(uri.path);
		let parent = this._lookupAsDirectory(dirname, false);
		if (!parent.entries.has(basename)) {
			throw FileSystemError.FileNotFound(uri);
		}
		parent.entries.delete(basename);
		parent.mtime = Date.now();
		parent.size -= 1;
		this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { uri, type: FileChangeType.Deleted });
	}

	createDirectory(uri: Uri): void {
		let basename = this._basename(uri.path);
		let dirname = uri.with({ path: this._dirname(uri.path) });
		let parent = this._lookupAsDirectory(dirname, false);

		let entry = new Directory(uri, basename);
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { type: FileChangeType.Created, uri });
	}

	// --- lookup

	private _lookup(uri: Uri, silent: false): Entry;
	private _lookup(uri: Uri, silent: boolean): Entry | undefined;
	private _lookup(uri: Uri, silent: boolean): Entry | undefined {
		let parts = uri.path.split('/');
		let entry: Entry = this.root;
		for (const part of parts) {
			if (!part) {
				continue;
			}
			let child: Entry | undefined;
			if (entry instanceof Directory) {
				child = entry.entries.get(part);
			}
			if (!child) {
				if (!silent) {
					throw FileSystemError.FileNotFound(uri);
				} else {
					return undefined;
				}
			}
			entry = child;
		}
		return entry;
	}

	private _lookupAsDirectory(uri: Uri, silent: boolean): Directory {
		let entry = this._lookup(uri, silent);
		if (entry instanceof Directory) {
			return entry;
		}
		throw FileSystemError.FileNotADirectory(uri);
	}

	private _lookupAsFile(uri: Uri, silent: boolean): File {
		let entry = this._lookup(uri, silent);
		if (entry instanceof File) {
			return entry;
		}
		throw FileSystemError.FileIsADirectory(uri);
	}

	private _lookupParentDirectory(uri: Uri): Directory {
		const dirname = uri.with({ path: this._dirname(uri.path) });
		return this._lookupAsDirectory(dirname, false);
	}

	// --- manage file events

	private _emitter = new EventEmitter<FileChangeEvent[]>();
	private _bufferedEvents: FileChangeEvent[] = [];
	private _fireSoonHandle?: any;

	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._emitter.event;

	watch(_resource: Uri): Disposable {
		// ignore, fires for all changes...
		return new Disposable(() => { });
	}

	private _fireSoon(...events: FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}

	// --- path utils

	private _basename(path: string): string {
		path = this._rtrim(path, '/');
		if (!path) {
			return '';
		}

		return path.substr(path.lastIndexOf('/') + 1);
	}

	private _dirname(path: string): string {
		path = this._rtrim(path, '/');
		if (!path) {
			return '/';
		}

		return path.substr(0, path.lastIndexOf('/'));
	}

	private _rtrim(haystack: string, needle: string): string {
		if (!haystack || !needle) {
			return haystack;
		}

		const needleLen = needle.length,
			haystackLen = haystack.length;

		if (needleLen === 0 || haystackLen === 0) {
			return haystack;
		}

		let offset = haystackLen,
			idx = -1;

		while (true) {
			idx = haystack.lastIndexOf(needle, offset - 1);
			if (idx === -1 || idx + needleLen !== offset) {
				break;
			}
			if (idx === 0) {
				return '';
			}
			offset = idx;
		}

		return haystack.substring(0, offset);
	}

	private _getFiles(): Set<File> {
		const files = new Set<File>();

		this._doGetFiles(this.root, files);

		return files;
	}

	private _doGetFiles(dir: Directory, files: Set<File>): void {
		dir.entries.forEach(entry => {
			if (entry instanceof File) {
				files.add(entry);
			} else {
				this._doGetFiles(entry, files);
			}
		});
	}

	private _convertSimple2RegExpPattern(pattern: string): string {
		return pattern.replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&').replace(/[\*]/g, '.*');
	}

	// --- search provider

	provideFileSearchResults(query: FileSearchQuery, _options: FileSearchOptions, _token: CancellationToken): ProviderResult<Uri[]> {
		return this._findFiles(query.pattern);
	}

	private _findFiles(query: string | undefined): Uri[] {
		const files = this._getFiles();
		const result: Uri[] = [];

		const pattern = query ? new RegExp(this._convertSimple2RegExpPattern(query)) : null;

		for (const file of files) {
			if (!pattern || pattern.exec(file.name)) {
				result.push(file.uri);
			}
		}

		return result;
	}

	private _textDecoder = new TextDecoder();

	provideTextSearchResults(query: TextSearchQuery, options: TextSearchOptions, progress: Progress<TextSearchResult>, _token: CancellationToken) {
		const result: TextSearchComplete = { limitHit: false };

		const files = this._findFiles(options.includes[0]);
		if (files) {
			for (const file of files) {
				const content = this._textDecoder.decode(this.readFile(file));

				const lines = content.split('\n');
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const index = line.indexOf(query.pattern);
					if (index !== -1) {
						progress.report({
							uri: file,
							ranges: new Range(new Position(i, index), new Position(i, index + query.pattern.length)),
							preview: {
								text: line,
								matches: new Range(new Position(0, index), new Position(0, index + query.pattern.length))
							}
						});
					}
				}
			}
		}

		return result;
	}
}

function randomData(lineCnt: number, lineLen = 155): Uint8Array {
	let lines: string[] = [];
	for (let i = 0; i < lineCnt; i++) {
		let line = '';
		while (line.length < lineLen) {
			line += Math.random().toString(2 + (i % 34)).substr(2);
		}
		lines.push(line.substr(0, lineLen));
	}
	return textEncoder.encode(lines.join('\n'));
}
