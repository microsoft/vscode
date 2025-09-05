/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

const filter = require('gulp-filter');
const es = require('event-stream');
const VinylFile = require('vinyl');
const vfs = require('vinyl-fs');
const path = require('path');
const fs = require('fs');
const pall = require('p-all');

const { all, copyrightFilter, unicodeFilter, indentationFilter, tsFormattingFilter, eslintFilter, stylelintFilter } = require('./filters');

const copyrightHeaderLines = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/',
];

/**
 * @param {string[] | NodeJS.ReadWriteStream} some
 * @param {boolean} linting
 */
function hygiene(some, linting = true) {
	const eslint = require('./gulp-eslint');
	const gulpstylelint = require('./stylelint');
	const formatter = require('./lib/formatter');

	let errorCount = 0;

	const productJson = es.through(function (file) {
		const product = JSON.parse(file.contents.toString('utf8'));

		if (product.extensionsGallery) {
			console.error(`product.json: Contains 'extensionsGallery'`);
			errorCount++;
		}

		this.emit('data', file);
	});

	const unicode = es.through(function (file) {
		/** @type {string[]} */
		const lines = file.contents.toString('utf8').split(/\r\n|\r|\n/);
		file.__lines = lines;
		const allowInComments = lines.some(line => /allow-any-unicode-comment-file/.test(line));
		let skipNext = false;
		lines.forEach((line, i) => {
			if (/allow-any-unicode-next-line/.test(line)) {
				skipNext = true;
				return;
			}
			if (skipNext) {
				skipNext = false;
				return;
			}
			// If unicode is allowed in comments, trim the comment from the line
			if (allowInComments) {
				if (line.match(/\s+(\*)/)) { // Naive multi-line comment check
					line = '';
				} else {
					const index = line.indexOf('\/\/');
					line = index === -1 ? line : line.substring(0, index);
				}
			}
			// Please do not add symbols that resemble ASCII letters!
			// eslint-disable-next-line no-misleading-character-class
			const m = /([^\t\n\r\x20-\x7E⊃⊇✔︎✓🎯🧪✍️⚠️🛑🔴🚗🚙🚕🎉✨❗⇧⌥⌘×÷¦⋯…↑↓￫→←↔⟷·•●◆▼⟪⟫┌└├⏎↩√φ]+)/g.exec(line);
			if (m) {
				console.error(
					file.relative + `(${i + 1},${m.index + 1}): Unexpected unicode character: "${m[0]}" (charCode: ${m[0].charCodeAt(0)}). To suppress, use // allow-any-unicode-next-line`
				);
				errorCount++;
			}
		});

		this.emit('data', file);
	});

	const indentation = es.through(function (file) {
		/** @type {string[]} */
		const lines = file.__lines || file.contents.toString('utf8').split(/\r\n|\r|\n/);
		file.__lines = lines;

		lines.forEach((line, i) => {
			if (/^\s*$/.test(line)) {
				// empty or whitespace lines are OK
			} else if (/^[\t]*[^\s]/.test(line)) {
				// good indent
			} else if (/^[\t]* \*/.test(line)) {
				// block comment using an extra space
			} else {
				console.error(
					file.relative + '(' + (i + 1) + ',1): Bad whitespace indentation'
				);
				errorCount++;
			}
		});

		this.emit('data', file);
	});

	const copyrights = es.through(function (file) {
		const lines = file.__lines;

		for (let i = 0; i < copyrightHeaderLines.length; i++) {
			if (lines[i] !== copyrightHeaderLines[i]) {
				console.error(file.relative + ': Missing or bad copyright statement');
				errorCount++;
				break;
			}
		}

		this.emit('data', file);
	});

	const formatting = es.map(function (file, cb) {
		try {
			const rawInput = file.contents.toString('utf8');
			const rawOutput = formatter.format(file.path, rawInput);

			const original = rawInput.replace(/\r\n/gm, '\n');
			const formatted = rawOutput.replace(/\r\n/gm, '\n');
			if (original !== formatted) {
				console.error(
					`File not formatted. Run the 'Format Document' command to fix it:`,
					file.relative
				);
				errorCount++;
			}
			cb(undefined, file);
		} catch (err) {
			cb(err);
		}
	});

	let input;
	if (Array.isArray(some) || typeof some === 'string' || !some) {
		const options = { base: '.', follow: true, allowEmpty: true };
		if (some) {
			input = vfs.src(some, options).pipe(filter(all)); // split this up to not unnecessarily filter all a second time
		} else {
			input = vfs.src(all, options);
		}
	} else {
		input = some;
	}

	const productJsonFilter = filter('product.json', { restore: true });
	const snapshotFilter = filter(['**', '!**/*.snap', '!**/*.snap.actual']);
	const yarnLockFilter = filter(['**', '!**/yarn.lock']);
	const unicodeFilterStream = filter(unicodeFilter, { restore: true });

	const result = input
		.pipe(filter((f) => !f.stat.isDirectory()))
		.pipe(snapshotFilter)
		.pipe(yarnLockFilter)
		.pipe(productJsonFilter)
		.pipe(process.env['BUILD_SOURCEVERSION'] ? es.through() : productJson)
		.pipe(productJsonFilter.restore)
		.pipe(unicodeFilterStream)
		.pipe(unicode)
		.pipe(unicodeFilterStream.restore)
		.pipe(filter(indentationFilter))
		.pipe(indentation)
		.pipe(filter(copyrightFilter))
		.pipe(copyrights);

	/** @type {import('stream').Stream[]} */
	const streams = [
		result.pipe(filter(tsFormattingFilter)).pipe(formatting)
	];

	if (linting) {
		streams.push(
			result
				.pipe(filter(eslintFilter))
				.pipe(
					eslint((results) => {
						errorCount += results.warningCount;
						errorCount += results.errorCount;
					})
				)
		);
		streams.push(
			result.pipe(filter(stylelintFilter)).pipe(gulpstylelint(((message, isError) => {
				if (isError) {
					console.error(message);
					errorCount++;
				} else {
					console.warn(message);
				}
			})))
		);
	}

	let count = 0;
	return es.merge(...streams).pipe(
		es.through(
			function (data) {
				count++;
				if (process.env['TRAVIS'] && count % 10 === 0) {
					process.stdout.write('.');
				}
				this.emit('data', data);
			},
			function () {
				process.stdout.write('\n');
				if (errorCount > 0) {
					this.emit(
						'error',
						'Hygiene failed with ' +
						errorCount +
						` errors. Check 'build / gulpfile.hygiene.js'.`
					);
				} else {
					this.emit('end');
				}
			}
		)
	);
}

module.exports.hygiene = hygiene;

/**
 * @param {string[]} paths
 */
function createGitIndexVinyls(paths) {
	const cp = require('child_process');
	const repositoryPath = process.cwd();

	const fns = paths.map((relativePath) => () =>
		new Promise((c, e) => {
			const fullPath = path.join(repositoryPath, relativePath);

			fs.stat(fullPath, (err, stat) => {
				if (err && err.code === 'ENOENT') {
					// ignore deletions
					return c(null);
				} else if (err) {
					return e(err);
				}

				cp.exec(
					process.platform === 'win32' ? `git show :${relativePath}` : `git show ':${relativePath}'`,
					{ maxBuffer: stat.size, encoding: 'buffer' },
					(err, out) => {
						if (err) {
							return e(err);
						}

						c(
							new VinylFile({
								path: fullPath,
								base: repositoryPath,
								contents: out,
								stat,
							})
						);
					}
				);
			});
		})
	);

	return pall(fns, { concurrency: 4 }).then((r) => r.filter((p) => !!p));
}

// this allows us to run hygiene as a git pre-commit hook
if (require.main === module) {
	const cp = require('child_process');

	process.on('unhandledRejection', (reason, p) => {
		console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
		process.exit(1);
	});

	if (process.argv.length > 2) {
		hygiene(process.argv.slice(2)).on('error', (err) => {
			console.error();
			console.error(err);
			process.exit(1);
		});
	} else {
		cp.exec(
			'git diff --cached --name-only',
			{ maxBuffer: 2000 * 1024 },
			(err, out) => {
				if (err) {
					console.error();
					console.error(err);
					process.exit(1);
				}

				const some = out.split(/\r?\n/).filter((l) => !!l);

				if (some.length > 0) {
					console.log('Reading git index versions...');

					createGitIndexVinyls(some)
						.then(
							(vinyls) => {
								/** @type {Promise<void>} */
								return (new Promise((c, e) =>
									hygiene(es.readArray(vinyls).pipe(filter(all)))
										.on('end', () => c())
										.on('error', e)
								))
							}
						)
						.catch((err) => {
							console.error();
							console.error(err);
							process.exit(1);
						});
				}
			}
		);
	}
}
