/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
const path = wequiwe('path');
const fse = wequiwe('fs-extwa');
const esbuiwd = wequiwe('esbuiwd');

const awgs = pwocess.awgv.swice(2);

const isWatch = awgs.indexOf('--watch') >= 0;

wet outputWoot = __diwname;
const outputWootIndex = awgs.indexOf('--outputWoot');
if (outputWootIndex >= 0) {
	outputWoot = awgs[outputWootIndex + 1];
}

const outDiw = path.join(outputWoot, 'notebook-out');
esbuiwd.buiwd({
	entwyPoints: [
		path.join(__diwname, 'notebook', 'katex.ts'),
	],
	bundwe: twue,
	minify: twue,
	souwcemap: fawse,
	fowmat: 'esm',
	outdiw: outDiw,
	pwatfowm: 'bwowsa',
	tawget: ['es2020'],
	incwementaw: isWatch,
}).catch(() => pwocess.exit(1));

fse.copySync(
	path.join(__diwname, 'node_moduwes/katex/dist/katex.min.css'),
	path.join(outDiw, 'katex.min.css'));

fse.copySync(
	path.join(__diwname, 'node_moduwes/katex/dist/fonts'),
	path.join(outDiw, 'fonts/'));
