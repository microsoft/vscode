var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
	return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (let key of __getOwnPropNames(from))
			if (!__hasOwnProp.call(to, key) && key !== except)
				__defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
	// If the importer is in node compatibility mode or this is not an ESM
	// file that has been converted to a CommonJS file using a Babel-
	// compatible transform (i.e. "__esModule" has not been set), then set
	// "default" to the CommonJS "module.exports" for node compatibility.
	isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
	mod
));

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
	"node_modules/semver/internal/constants.js"(exports, module) {
		var SEMVER_SPEC_VERSION = "2.0.0";
		var MAX_LENGTH = 256;
		var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
			9007199254740991;
		var MAX_SAFE_COMPONENT_LENGTH = 16;
		var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
		var RELEASE_TYPES = [
			"major",
			"premajor",
			"minor",
			"preminor",
			"patch",
			"prepatch",
			"prerelease"
		];
		module.exports = {
			MAX_LENGTH,
			MAX_SAFE_COMPONENT_LENGTH,
			MAX_SAFE_BUILD_LENGTH,
			MAX_SAFE_INTEGER,
			RELEASE_TYPES,
			SEMVER_SPEC_VERSION,
			FLAG_INCLUDE_PRERELEASE: 1,
			FLAG_LOOSE: 2
		};
	}
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
	"node_modules/semver/internal/debug.js"(exports, module) {
		var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
		};
		module.exports = debug;
	}
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
	"node_modules/semver/internal/re.js"(exports, module) {
		var {
			MAX_SAFE_COMPONENT_LENGTH,
			MAX_SAFE_BUILD_LENGTH,
			MAX_LENGTH
		} = require_constants();
		var debug = require_debug();
		exports = module.exports = {};
		var re = exports.re = [];
		var safeRe = exports.safeRe = [];
		var src = exports.src = [];
		var t = exports.t = {};
		var R = 0;
		var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
		var safeRegexReplacements = [
			["\\s", 1],
			["\\d", MAX_LENGTH],
			[LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
		];
		var makeSafeRegex = (value) => {
			for (const [token, max] of safeRegexReplacements) {
				value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
			}
			return value;
		};
		var createToken = (name, value, isGlobal) => {
			const safe = makeSafeRegex(value);
			const index = R++;
			debug(name, index, value);
			t[name] = index;
			src[index] = value;
			re[index] = new RegExp(value, isGlobal ? "g" : void 0);
			safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
		};
		createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
		createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
		createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
		createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
		createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
		createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NUMERICIDENTIFIER]}|${src[t.NONNUMERICIDENTIFIER]})`);
		createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NUMERICIDENTIFIERLOOSE]}|${src[t.NONNUMERICIDENTIFIER]})`);
		createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
		createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
		createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
		createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
		createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
		createToken("FULL", `^${src[t.FULLPLAIN]}$`);
		createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
		createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
		createToken("GTLT", "((?:<|>)?=?)");
		createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
		createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
		createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
		createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
		createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
		createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
		createToken("COERCE", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:$|[^\\d])`);
		createToken("COERCERTL", src[t.COERCE], true);
		createToken("LONETILDE", "(?:~>?)");
		createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
		exports.tildeTrimReplace = "$1~";
		createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
		createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
		createToken("LONECARET", "(?:\\^)");
		createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
		exports.caretTrimReplace = "$1^";
		createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
		createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
		createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
		createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
		createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
		exports.comparatorTrimReplace = "$1$2$3";
		createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
		createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
		createToken("STAR", "(<|>)?=?\\s*\\*");
		createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
		createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
	}
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
	"node_modules/semver/internal/parse-options.js"(exports, module) {
		var looseOption = Object.freeze({ loose: true });
		var emptyOpts = Object.freeze({});
		var parseOptions = (options) => {
			if (!options) {
				return emptyOpts;
			}
			if (typeof options !== "object") {
				return looseOption;
			}
			return options;
		};
		module.exports = parseOptions;
	}
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
	"node_modules/semver/internal/identifiers.js"(exports, module) {
		var numeric = /^[0-9]+$/;
		var compareIdentifiers = (a, b) => {
			const anum = numeric.test(a);
			const bnum = numeric.test(b);
			if (anum && bnum) {
				a = +a;
				b = +b;
			}
			return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
		};
		var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
		module.exports = {
			compareIdentifiers,
			rcompareIdentifiers
		};
	}
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
	"node_modules/semver/classes/semver.js"(exports, module) {
		var debug = require_debug();
		var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
		var { safeRe: re, t } = require_re();
		var parseOptions = require_parse_options();
		var { compareIdentifiers } = require_identifiers();
		var SemVer = class _SemVer {
			constructor(version, options) {
				options = parseOptions(options);
				if (version instanceof _SemVer) {
					if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
						return version;
					} else {
						version = version.version;
					}
				} else if (typeof version !== "string") {
					throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
				}
				if (version.length > MAX_LENGTH) {
					throw new TypeError(
						`version is longer than ${MAX_LENGTH} characters`
					);
				}
				debug("SemVer", version, options);
				this.options = options;
				this.loose = !!options.loose;
				this.includePrerelease = !!options.includePrerelease;
				const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
				if (!m) {
					throw new TypeError(`Invalid Version: ${version}`);
				}
				this.raw = version;
				this.major = +m[1];
				this.minor = +m[2];
				this.patch = +m[3];
				if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
					throw new TypeError("Invalid major version");
				}
				if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
					throw new TypeError("Invalid minor version");
				}
				if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
					throw new TypeError("Invalid patch version");
				}
				if (!m[4]) {
					this.prerelease = [];
				} else {
					this.prerelease = m[4].split(".").map((id) => {
						if (/^[0-9]+$/.test(id)) {
							const num = +id;
							if (num >= 0 && num < MAX_SAFE_INTEGER) {
								return num;
							}
						}
						return id;
					});
				}
				this.build = m[5] ? m[5].split(".") : [];
				this.format();
			}
			format() {
				this.version = `${this.major}.${this.minor}.${this.patch}`;
				if (this.prerelease.length) {
					this.version += `-${this.prerelease.join(".")}`;
				}
				return this.version;
			}
			toString() {
				return this.version;
			}
			compare(other) {
				debug("SemVer.compare", this.version, this.options, other);
				if (!(other instanceof _SemVer)) {
					if (typeof other === "string" && other === this.version) {
						return 0;
					}
					other = new _SemVer(other, this.options);
				}
				if (other.version === this.version) {
					return 0;
				}
				return this.compareMain(other) || this.comparePre(other);
			}
			compareMain(other) {
				if (!(other instanceof _SemVer)) {
					other = new _SemVer(other, this.options);
				}
				return compareIdentifiers(this.major, other.major) || compareIdentifiers(this.minor, other.minor) || compareIdentifiers(this.patch, other.patch);
			}
			comparePre(other) {
				if (!(other instanceof _SemVer)) {
					other = new _SemVer(other, this.options);
				}
				if (this.prerelease.length && !other.prerelease.length) {
					return -1;
				} else if (!this.prerelease.length && other.prerelease.length) {
					return 1;
				} else if (!this.prerelease.length && !other.prerelease.length) {
					return 0;
				}
				let i = 0;
				do {
					const a = this.prerelease[i];
					const b = other.prerelease[i];
					debug("prerelease compare", i, a, b);
					if (a === void 0 && b === void 0) {
						return 0;
					} else if (b === void 0) {
						return 1;
					} else if (a === void 0) {
						return -1;
					} else if (a === b) {
						continue;
					} else {
						return compareIdentifiers(a, b);
					}
				} while (++i);
			}
			compareBuild(other) {
				if (!(other instanceof _SemVer)) {
					other = new _SemVer(other, this.options);
				}
				let i = 0;
				do {
					const a = this.build[i];
					const b = other.build[i];
					debug("prerelease compare", i, a, b);
					if (a === void 0 && b === void 0) {
						return 0;
					} else if (b === void 0) {
						return 1;
					} else if (a === void 0) {
						return -1;
					} else if (a === b) {
						continue;
					} else {
						return compareIdentifiers(a, b);
					}
				} while (++i);
			}
			// preminor will bump the version up to the next minor release, and immediately
			// down to pre-release. premajor and prepatch work the same way.
			inc(release, identifier, identifierBase) {
				switch (release) {
					case "premajor":
						this.prerelease.length = 0;
						this.patch = 0;
						this.minor = 0;
						this.major++;
						this.inc("pre", identifier, identifierBase);
						break;
					case "preminor":
						this.prerelease.length = 0;
						this.patch = 0;
						this.minor++;
						this.inc("pre", identifier, identifierBase);
						break;
					case "prepatch":
						this.prerelease.length = 0;
						this.inc("patch", identifier, identifierBase);
						this.inc("pre", identifier, identifierBase);
						break;
					case "prerelease":
						if (this.prerelease.length === 0) {
							this.inc("patch", identifier, identifierBase);
						}
						this.inc("pre", identifier, identifierBase);
						break;
					case "major":
						if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
							this.major++;
						}
						this.minor = 0;
						this.patch = 0;
						this.prerelease = [];
						break;
					case "minor":
						if (this.patch !== 0 || this.prerelease.length === 0) {
							this.minor++;
						}
						this.patch = 0;
						this.prerelease = [];
						break;
					case "patch":
						if (this.prerelease.length === 0) {
							this.patch++;
						}
						this.prerelease = [];
						break;
					case "pre": {
						const base = Number(identifierBase) ? 1 : 0;
						if (!identifier && identifierBase === false) {
							throw new Error("invalid increment argument: identifier is empty");
						}
						if (this.prerelease.length === 0) {
							this.prerelease = [base];
						} else {
							let i = this.prerelease.length;
							while (--i >= 0) {
								if (typeof this.prerelease[i] === "number") {
									this.prerelease[i]++;
									i = -2;
								}
							}
							if (i === -1) {
								if (identifier === this.prerelease.join(".") && identifierBase === false) {
									throw new Error("invalid increment argument: identifier already exists");
								}
								this.prerelease.push(base);
							}
						}
						if (identifier) {
							let prerelease = [identifier, base];
							if (identifierBase === false) {
								prerelease = [identifier];
							}
							if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
								if (isNaN(this.prerelease[1])) {
									this.prerelease = prerelease;
								}
							} else {
								this.prerelease = prerelease;
							}
						}
						break;
					}
					default:
						throw new Error(`invalid increment argument: ${release}`);
				}
				this.raw = this.format();
				if (this.build.length) {
					this.raw += `+${this.build.join(".")}`;
				}
				return this;
			}
		};
		module.exports = SemVer;
	}
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
	"node_modules/semver/functions/parse.js"(exports, module) {
		var SemVer = require_semver();
		var parse = (version, options, throwErrors = false) => {
			if (version instanceof SemVer) {
				return version;
			}
			try {
				return new SemVer(version, options);
			} catch (er) {
				if (!throwErrors) {
					return null;
				}
				throw er;
			}
		};
		module.exports = parse;
	}
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
	"node_modules/semver/functions/valid.js"(exports, module) {
		var parse = require_parse();
		var valid = (version, options) => {
			const v = parse(version, options);
			return v ? v.version : null;
		};
		module.exports = valid;
	}
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
	"node_modules/semver/functions/clean.js"(exports, module) {
		var parse = require_parse();
		var clean = (version, options) => {
			const s = parse(version.trim().replace(/^[=v]+/, ""), options);
			return s ? s.version : null;
		};
		module.exports = clean;
	}
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
	"node_modules/semver/functions/inc.js"(exports, module) {
		var SemVer = require_semver();
		var inc = (version, release, options, identifier, identifierBase) => {
			if (typeof options === "string") {
				identifierBase = identifier;
				identifier = options;
				options = void 0;
			}
			try {
				return new SemVer(
					version instanceof SemVer ? version.version : version,
					options
				).inc(release, identifier, identifierBase).version;
			} catch (er) {
				return null;
			}
		};
		module.exports = inc;
	}
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
	"node_modules/semver/functions/diff.js"(exports, module) {
		var parse = require_parse();
		var diff = (version1, version2) => {
			const v1 = parse(version1, null, true);
			const v2 = parse(version2, null, true);
			const comparison = v1.compare(v2);
			if (comparison === 0) {
				return null;
			}
			const v1Higher = comparison > 0;
			const highVersion = v1Higher ? v1 : v2;
			const lowVersion = v1Higher ? v2 : v1;
			const highHasPre = !!highVersion.prerelease.length;
			const lowHasPre = !!lowVersion.prerelease.length;
			if (lowHasPre && !highHasPre) {
				if (!lowVersion.patch && !lowVersion.minor) {
					return "major";
				}
				if (highVersion.patch) {
					return "patch";
				}
				if (highVersion.minor) {
					return "minor";
				}
				return "major";
			}
			const prefix = highHasPre ? "pre" : "";
			if (v1.major !== v2.major) {
				return prefix + "major";
			}
			if (v1.minor !== v2.minor) {
				return prefix + "minor";
			}
			if (v1.patch !== v2.patch) {
				return prefix + "patch";
			}
			return "prerelease";
		};
		module.exports = diff;
	}
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
	"node_modules/semver/functions/major.js"(exports, module) {
		var SemVer = require_semver();
		var major = (a, loose) => new SemVer(a, loose).major;
		module.exports = major;
	}
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
	"node_modules/semver/functions/minor.js"(exports, module) {
		var SemVer = require_semver();
		var minor = (a, loose) => new SemVer(a, loose).minor;
		module.exports = minor;
	}
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
	"node_modules/semver/functions/patch.js"(exports, module) {
		var SemVer = require_semver();
		var patch = (a, loose) => new SemVer(a, loose).patch;
		module.exports = patch;
	}
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
	"node_modules/semver/functions/prerelease.js"(exports, module) {
		var parse = require_parse();
		var prerelease = (version, options) => {
			const parsed = parse(version, options);
			return parsed && parsed.prerelease.length ? parsed.prerelease : null;
		};
		module.exports = prerelease;
	}
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
	"node_modules/semver/functions/compare.js"(exports, module) {
		var SemVer = require_semver();
		var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
		module.exports = compare;
	}
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
	"node_modules/semver/functions/rcompare.js"(exports, module) {
		var compare = require_compare();
		var rcompare = (a, b, loose) => compare(b, a, loose);
		module.exports = rcompare;
	}
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
	"node_modules/semver/functions/compare-loose.js"(exports, module) {
		var compare = require_compare();
		var compareLoose = (a, b) => compare(a, b, true);
		module.exports = compareLoose;
	}
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
	"node_modules/semver/functions/compare-build.js"(exports, module) {
		var SemVer = require_semver();
		var compareBuild = (a, b, loose) => {
			const versionA = new SemVer(a, loose);
			const versionB = new SemVer(b, loose);
			return versionA.compare(versionB) || versionA.compareBuild(versionB);
		};
		module.exports = compareBuild;
	}
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
	"node_modules/semver/functions/sort.js"(exports, module) {
		var compareBuild = require_compare_build();
		var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
		module.exports = sort;
	}
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
	"node_modules/semver/functions/rsort.js"(exports, module) {
		var compareBuild = require_compare_build();
		var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
		module.exports = rsort;
	}
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
	"node_modules/semver/functions/gt.js"(exports, module) {
		var compare = require_compare();
		var gt = (a, b, loose) => compare(a, b, loose) > 0;
		module.exports = gt;
	}
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
	"node_modules/semver/functions/lt.js"(exports, module) {
		var compare = require_compare();
		var lt = (a, b, loose) => compare(a, b, loose) < 0;
		module.exports = lt;
	}
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
	"node_modules/semver/functions/eq.js"(exports, module) {
		var compare = require_compare();
		var eq = (a, b, loose) => compare(a, b, loose) === 0;
		module.exports = eq;
	}
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
	"node_modules/semver/functions/neq.js"(exports, module) {
		var compare = require_compare();
		var neq = (a, b, loose) => compare(a, b, loose) !== 0;
		module.exports = neq;
	}
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
	"node_modules/semver/functions/gte.js"(exports, module) {
		var compare = require_compare();
		var gte = (a, b, loose) => compare(a, b, loose) >= 0;
		module.exports = gte;
	}
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
	"node_modules/semver/functions/lte.js"(exports, module) {
		var compare = require_compare();
		var lte = (a, b, loose) => compare(a, b, loose) <= 0;
		module.exports = lte;
	}
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
	"node_modules/semver/functions/cmp.js"(exports, module) {
		var eq = require_eq();
		var neq = require_neq();
		var gt = require_gt();
		var gte = require_gte();
		var lt = require_lt();
		var lte = require_lte();
		var cmp = (a, op, b, loose) => {
			switch (op) {
				case "===":
					if (typeof a === "object") {
						a = a.version;
					}
					if (typeof b === "object") {
						b = b.version;
					}
					return a === b;
				case "!==":
					if (typeof a === "object") {
						a = a.version;
					}
					if (typeof b === "object") {
						b = b.version;
					}
					return a !== b;
				case "":
				case "=":
				case "==":
					return eq(a, b, loose);
				case "!=":
					return neq(a, b, loose);
				case ">":
					return gt(a, b, loose);
				case ">=":
					return gte(a, b, loose);
				case "<":
					return lt(a, b, loose);
				case "<=":
					return lte(a, b, loose);
				default:
					throw new TypeError(`Invalid operator: ${op}`);
			}
		};
		module.exports = cmp;
	}
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
	"node_modules/semver/functions/coerce.js"(exports, module) {
		var SemVer = require_semver();
		var parse = require_parse();
		var { safeRe: re, t } = require_re();
		var coerce = (version, options) => {
			if (version instanceof SemVer) {
				return version;
			}
			if (typeof version === "number") {
				version = String(version);
			}
			if (typeof version !== "string") {
				return null;
			}
			options = options || {};
			let match = null;
			if (!options.rtl) {
				match = version.match(re[t.COERCE]);
			} else {
				let next;
				while ((next = re[t.COERCERTL].exec(version)) && (!match || match.index + match[0].length !== version.length)) {
					if (!match || next.index + next[0].length !== match.index + match[0].length) {
						match = next;
					}
					re[t.COERCERTL].lastIndex = next.index + next[1].length + next[2].length;
				}
				re[t.COERCERTL].lastIndex = -1;
			}
			if (match === null) {
				return null;
			}
			return parse(`${match[2]}.${match[3] || "0"}.${match[4] || "0"}`, options);
		};
		module.exports = coerce;
	}
});

// node_modules/yallist/iterator.js
var require_iterator = __commonJS({
	"node_modules/yallist/iterator.js"(exports, module) {
		"use strict";
		module.exports = function (Yallist) {
			Yallist.prototype[Symbol.iterator] = function* () {
				for (let walker = this.head; walker; walker = walker.next) {
					yield walker.value;
				}
			};
		};
	}
});

// node_modules/yallist/yallist.js
var require_yallist = __commonJS({
	"node_modules/yallist/yallist.js"(exports, module) {
		"use strict";
		module.exports = Yallist;
		Yallist.Node = Node;
		Yallist.create = Yallist;
		function Yallist(list) {
			var self = this;
			if (!(self instanceof Yallist)) {
				self = new Yallist();
			}
			self.tail = null;
			self.head = null;
			self.length = 0;
			if (list && typeof list.forEach === "function") {
				list.forEach(function (item) {
					self.push(item);
				});
			} else if (arguments.length > 0) {
				for (var i = 0, l = arguments.length; i < l; i++) {
					self.push(arguments[i]);
				}
			}
			return self;
		}
		Yallist.prototype.removeNode = function (node) {
			if (node.list !== this) {
				throw new Error("removing node which does not belong to this list");
			}
			var next = node.next;
			var prev = node.prev;
			if (next) {
				next.prev = prev;
			}
			if (prev) {
				prev.next = next;
			}
			if (node === this.head) {
				this.head = next;
			}
			if (node === this.tail) {
				this.tail = prev;
			}
			node.list.length--;
			node.next = null;
			node.prev = null;
			node.list = null;
			return next;
		};
		Yallist.prototype.unshiftNode = function (node) {
			if (node === this.head) {
				return;
			}
			if (node.list) {
				node.list.removeNode(node);
			}
			var head = this.head;
			node.list = this;
			node.next = head;
			if (head) {
				head.prev = node;
			}
			this.head = node;
			if (!this.tail) {
				this.tail = node;
			}
			this.length++;
		};
		Yallist.prototype.pushNode = function (node) {
			if (node === this.tail) {
				return;
			}
			if (node.list) {
				node.list.removeNode(node);
			}
			var tail = this.tail;
			node.list = this;
			node.prev = tail;
			if (tail) {
				tail.next = node;
			}
			this.tail = node;
			if (!this.head) {
				this.head = node;
			}
			this.length++;
		};
		Yallist.prototype.push = function () {
			for (var i = 0, l = arguments.length; i < l; i++) {
				push(this, arguments[i]);
			}
			return this.length;
		};
		Yallist.prototype.unshift = function () {
			for (var i = 0, l = arguments.length; i < l; i++) {
				unshift(this, arguments[i]);
			}
			return this.length;
		};
		Yallist.prototype.pop = function () {
			if (!this.tail) {
				return void 0;
			}
			var res = this.tail.value;
			this.tail = this.tail.prev;
			if (this.tail) {
				this.tail.next = null;
			} else {
				this.head = null;
			}
			this.length--;
			return res;
		};
		Yallist.prototype.shift = function () {
			if (!this.head) {
				return void 0;
			}
			var res = this.head.value;
			this.head = this.head.next;
			if (this.head) {
				this.head.prev = null;
			} else {
				this.tail = null;
			}
			this.length--;
			return res;
		};
		Yallist.prototype.forEach = function (fn, thisp) {
			thisp = thisp || this;
			for (var walker = this.head, i = 0; walker !== null; i++) {
				fn.call(thisp, walker.value, i, this);
				walker = walker.next;
			}
		};
		Yallist.prototype.forEachReverse = function (fn, thisp) {
			thisp = thisp || this;
			for (var walker = this.tail, i = this.length - 1; walker !== null; i--) {
				fn.call(thisp, walker.value, i, this);
				walker = walker.prev;
			}
		};
		Yallist.prototype.get = function (n) {
			for (var i = 0, walker = this.head; walker !== null && i < n; i++) {
				walker = walker.next;
			}
			if (i === n && walker !== null) {
				return walker.value;
			}
		};
		Yallist.prototype.getReverse = function (n) {
			for (var i = 0, walker = this.tail; walker !== null && i < n; i++) {
				walker = walker.prev;
			}
			if (i === n && walker !== null) {
				return walker.value;
			}
		};
		Yallist.prototype.map = function (fn, thisp) {
			thisp = thisp || this;
			var res = new Yallist();
			for (var walker = this.head; walker !== null;) {
				res.push(fn.call(thisp, walker.value, this));
				walker = walker.next;
			}
			return res;
		};
		Yallist.prototype.mapReverse = function (fn, thisp) {
			thisp = thisp || this;
			var res = new Yallist();
			for (var walker = this.tail; walker !== null;) {
				res.push(fn.call(thisp, walker.value, this));
				walker = walker.prev;
			}
			return res;
		};
		Yallist.prototype.reduce = function (fn, initial) {
			var acc;
			var walker = this.head;
			if (arguments.length > 1) {
				acc = initial;
			} else if (this.head) {
				walker = this.head.next;
				acc = this.head.value;
			} else {
				throw new TypeError("Reduce of empty list with no initial value");
			}
			for (var i = 0; walker !== null; i++) {
				acc = fn(acc, walker.value, i);
				walker = walker.next;
			}
			return acc;
		};
		Yallist.prototype.reduceReverse = function (fn, initial) {
			var acc;
			var walker = this.tail;
			if (arguments.length > 1) {
				acc = initial;
			} else if (this.tail) {
				walker = this.tail.prev;
				acc = this.tail.value;
			} else {
				throw new TypeError("Reduce of empty list with no initial value");
			}
			for (var i = this.length - 1; walker !== null; i--) {
				acc = fn(acc, walker.value, i);
				walker = walker.prev;
			}
			return acc;
		};
		Yallist.prototype.toArray = function () {
			var arr = new Array(this.length);
			for (var i = 0, walker = this.head; walker !== null; i++) {
				arr[i] = walker.value;
				walker = walker.next;
			}
			return arr;
		};
		Yallist.prototype.toArrayReverse = function () {
			var arr = new Array(this.length);
			for (var i = 0, walker = this.tail; walker !== null; i++) {
				arr[i] = walker.value;
				walker = walker.prev;
			}
			return arr;
		};
		Yallist.prototype.slice = function (from, to) {
			to = to || this.length;
			if (to < 0) {
				to += this.length;
			}
			from = from || 0;
			if (from < 0) {
				from += this.length;
			}
			var ret = new Yallist();
			if (to < from || to < 0) {
				return ret;
			}
			if (from < 0) {
				from = 0;
			}
			if (to > this.length) {
				to = this.length;
			}
			for (var i = 0, walker = this.head; walker !== null && i < from; i++) {
				walker = walker.next;
			}
			for (; walker !== null && i < to; i++, walker = walker.next) {
				ret.push(walker.value);
			}
			return ret;
		};
		Yallist.prototype.sliceReverse = function (from, to) {
			to = to || this.length;
			if (to < 0) {
				to += this.length;
			}
			from = from || 0;
			if (from < 0) {
				from += this.length;
			}
			var ret = new Yallist();
			if (to < from || to < 0) {
				return ret;
			}
			if (from < 0) {
				from = 0;
			}
			if (to > this.length) {
				to = this.length;
			}
			for (var i = this.length, walker = this.tail; walker !== null && i > to; i--) {
				walker = walker.prev;
			}
			for (; walker !== null && i > from; i--, walker = walker.prev) {
				ret.push(walker.value);
			}
			return ret;
		};
		Yallist.prototype.splice = function (start, deleteCount, ...nodes) {
			if (start > this.length) {
				start = this.length - 1;
			}
			if (start < 0) {
				start = this.length + start;
			}
			for (var i = 0, walker = this.head; walker !== null && i < start; i++) {
				walker = walker.next;
			}
			var ret = [];
			for (var i = 0; walker && i < deleteCount; i++) {
				ret.push(walker.value);
				walker = this.removeNode(walker);
			}
			if (walker === null) {
				walker = this.tail;
			}
			if (walker !== this.head && walker !== this.tail) {
				walker = walker.prev;
			}
			for (var i = 0; i < nodes.length; i++) {
				walker = insert(this, walker, nodes[i]);
			}
			return ret;
		};
		Yallist.prototype.reverse = function () {
			var head = this.head;
			var tail = this.tail;
			for (var walker = head; walker !== null; walker = walker.prev) {
				var p = walker.prev;
				walker.prev = walker.next;
				walker.next = p;
			}
			this.head = tail;
			this.tail = head;
			return this;
		};
		function insert(self, node, value) {
			var inserted = node === self.head ? new Node(value, null, node, self) : new Node(value, node, node.next, self);
			if (inserted.next === null) {
				self.tail = inserted;
			}
			if (inserted.prev === null) {
				self.head = inserted;
			}
			self.length++;
			return inserted;
		}
		function push(self, item) {
			self.tail = new Node(item, self.tail, null, self);
			if (!self.head) {
				self.head = self.tail;
			}
			self.length++;
		}
		function unshift(self, item) {
			self.head = new Node(item, null, self.head, self);
			if (!self.tail) {
				self.tail = self.head;
			}
			self.length++;
		}
		function Node(value, prev, next, list) {
			if (!(this instanceof Node)) {
				return new Node(value, prev, next, list);
			}
			this.list = list;
			this.value = value;
			if (prev) {
				prev.next = this;
				this.prev = prev;
			} else {
				this.prev = null;
			}
			if (next) {
				next.prev = this;
				this.next = next;
			} else {
				this.next = null;
			}
		}
		try {
			require_iterator()(Yallist);
		} catch (er) {
		}
	}
});

// node_modules/lru-cache/index.js
var require_lru_cache = __commonJS({
	"node_modules/lru-cache/index.js"(exports, module) {
		"use strict";
		var Yallist = require_yallist();
		var MAX = Symbol("max");
		var LENGTH = Symbol("length");
		var LENGTH_CALCULATOR = Symbol("lengthCalculator");
		var ALLOW_STALE = Symbol("allowStale");
		var MAX_AGE = Symbol("maxAge");
		var DISPOSE = Symbol("dispose");
		var NO_DISPOSE_ON_SET = Symbol("noDisposeOnSet");
		var LRU_LIST = Symbol("lruList");
		var CACHE = Symbol("cache");
		var UPDATE_AGE_ON_GET = Symbol("updateAgeOnGet");
		var naiveLength = () => 1;
		var LRUCache = class {
			constructor(options) {
				if (typeof options === "number")
					options = { max: options };
				if (!options)
					options = {};
				if (options.max && (typeof options.max !== "number" || options.max < 0))
					throw new TypeError("max must be a non-negative number");
				const max = this[MAX] = options.max || Infinity;
				const lc = options.length || naiveLength;
				this[LENGTH_CALCULATOR] = typeof lc !== "function" ? naiveLength : lc;
				this[ALLOW_STALE] = options.stale || false;
				if (options.maxAge && typeof options.maxAge !== "number")
					throw new TypeError("maxAge must be a number");
				this[MAX_AGE] = options.maxAge || 0;
				this[DISPOSE] = options.dispose;
				this[NO_DISPOSE_ON_SET] = options.noDisposeOnSet || false;
				this[UPDATE_AGE_ON_GET] = options.updateAgeOnGet || false;
				this.reset();
			}
			// resize the cache when the max changes.
			set max(mL) {
				if (typeof mL !== "number" || mL < 0)
					throw new TypeError("max must be a non-negative number");
				this[MAX] = mL || Infinity;
				trim(this);
			}
			get max() {
				return this[MAX];
			}
			set allowStale(allowStale) {
				this[ALLOW_STALE] = !!allowStale;
			}
			get allowStale() {
				return this[ALLOW_STALE];
			}
			set maxAge(mA) {
				if (typeof mA !== "number")
					throw new TypeError("maxAge must be a non-negative number");
				this[MAX_AGE] = mA;
				trim(this);
			}
			get maxAge() {
				return this[MAX_AGE];
			}
			// resize the cache when the lengthCalculator changes.
			set lengthCalculator(lC) {
				if (typeof lC !== "function")
					lC = naiveLength;
				if (lC !== this[LENGTH_CALCULATOR]) {
					this[LENGTH_CALCULATOR] = lC;
					this[LENGTH] = 0;
					this[LRU_LIST].forEach((hit) => {
						hit.length = this[LENGTH_CALCULATOR](hit.value, hit.key);
						this[LENGTH] += hit.length;
					});
				}
				trim(this);
			}
			get lengthCalculator() {
				return this[LENGTH_CALCULATOR];
			}
			get length() {
				return this[LENGTH];
			}
			get itemCount() {
				return this[LRU_LIST].length;
			}
			rforEach(fn, thisp) {
				thisp = thisp || this;
				for (let walker = this[LRU_LIST].tail; walker !== null;) {
					const prev = walker.prev;
					forEachStep(this, fn, walker, thisp);
					walker = prev;
				}
			}
			forEach(fn, thisp) {
				thisp = thisp || this;
				for (let walker = this[LRU_LIST].head; walker !== null;) {
					const next = walker.next;
					forEachStep(this, fn, walker, thisp);
					walker = next;
				}
			}
			keys() {
				return this[LRU_LIST].toArray().map((k) => k.key);
			}
			values() {
				return this[LRU_LIST].toArray().map((k) => k.value);
			}
			reset() {
				if (this[DISPOSE] && this[LRU_LIST] && this[LRU_LIST].length) {
					this[LRU_LIST].forEach((hit) => this[DISPOSE](hit.key, hit.value));
				}
				this[CACHE] = /* @__PURE__ */ new Map();
				this[LRU_LIST] = new Yallist();
				this[LENGTH] = 0;
			}
			dump() {
				return this[LRU_LIST].map((hit) => isStale(this, hit) ? false : {
					k: hit.key,
					v: hit.value,
					e: hit.now + (hit.maxAge || 0)
				}).toArray().filter((h) => h);
			}
			dumpLru() {
				return this[LRU_LIST];
			}
			set(key, value, maxAge) {
				maxAge = maxAge || this[MAX_AGE];
				if (maxAge && typeof maxAge !== "number")
					throw new TypeError("maxAge must be a number");
				const now = maxAge ? Date.now() : 0;
				const len = this[LENGTH_CALCULATOR](value, key);
				if (this[CACHE].has(key)) {
					if (len > this[MAX]) {
						del(this, this[CACHE].get(key));
						return false;
					}
					const node = this[CACHE].get(key);
					const item = node.value;
					if (this[DISPOSE]) {
						if (!this[NO_DISPOSE_ON_SET])
							this[DISPOSE](key, item.value);
					}
					item.now = now;
					item.maxAge = maxAge;
					item.value = value;
					this[LENGTH] += len - item.length;
					item.length = len;
					this.get(key);
					trim(this);
					return true;
				}
				const hit = new Entry(key, value, len, now, maxAge);
				if (hit.length > this[MAX]) {
					if (this[DISPOSE])
						this[DISPOSE](key, value);
					return false;
				}
				this[LENGTH] += hit.length;
				this[LRU_LIST].unshift(hit);
				this[CACHE].set(key, this[LRU_LIST].head);
				trim(this);
				return true;
			}
			has(key) {
				if (!this[CACHE].has(key))
					return false;
				const hit = this[CACHE].get(key).value;
				return !isStale(this, hit);
			}
			get(key) {
				return get(this, key, true);
			}
			peek(key) {
				return get(this, key, false);
			}
			pop() {
				const node = this[LRU_LIST].tail;
				if (!node)
					return null;
				del(this, node);
				return node.value;
			}
			del(key) {
				del(this, this[CACHE].get(key));
			}
			load(arr) {
				this.reset();
				const now = Date.now();
				for (let l = arr.length - 1; l >= 0; l--) {
					const hit = arr[l];
					const expiresAt = hit.e || 0;
					if (expiresAt === 0)
						this.set(hit.k, hit.v);
					else {
						const maxAge = expiresAt - now;
						if (maxAge > 0) {
							this.set(hit.k, hit.v, maxAge);
						}
					}
				}
			}
			prune() {
				this[CACHE].forEach((value, key) => get(this, key, false));
			}
		};
		var get = (self, key, doUse) => {
			const node = self[CACHE].get(key);
			if (node) {
				const hit = node.value;
				if (isStale(self, hit)) {
					del(self, node);
					if (!self[ALLOW_STALE])
						return void 0;
				} else {
					if (doUse) {
						if (self[UPDATE_AGE_ON_GET])
							node.value.now = Date.now();
						self[LRU_LIST].unshiftNode(node);
					}
				}
				return hit.value;
			}
		};
		var isStale = (self, hit) => {
			if (!hit || !hit.maxAge && !self[MAX_AGE])
				return false;
			const diff = Date.now() - hit.now;
			return hit.maxAge ? diff > hit.maxAge : self[MAX_AGE] && diff > self[MAX_AGE];
		};
		var trim = (self) => {
			if (self[LENGTH] > self[MAX]) {
				for (let walker = self[LRU_LIST].tail; self[LENGTH] > self[MAX] && walker !== null;) {
					const prev = walker.prev;
					del(self, walker);
					walker = prev;
				}
			}
		};
		var del = (self, node) => {
			if (node) {
				const hit = node.value;
				if (self[DISPOSE])
					self[DISPOSE](hit.key, hit.value);
				self[LENGTH] -= hit.length;
				self[CACHE].delete(hit.key);
				self[LRU_LIST].removeNode(node);
			}
		};
		var Entry = class {
			constructor(key, value, length, now, maxAge) {
				this.key = key;
				this.value = value;
				this.length = length;
				this.now = now;
				this.maxAge = maxAge || 0;
			}
		};
		var forEachStep = (self, fn, node, thisp) => {
			let hit = node.value;
			if (isStale(self, hit)) {
				del(self, node);
				if (!self[ALLOW_STALE])
					hit = void 0;
			}
			if (hit)
				fn.call(thisp, hit.value, hit.key, self);
		};
		module.exports = LRUCache;
	}
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
	"node_modules/semver/classes/range.js"(exports, module) {
		var Range = class _Range {
			constructor(range, options) {
				options = parseOptions(options);
				if (range instanceof _Range) {
					if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
						return range;
					} else {
						return new _Range(range.raw, options);
					}
				}
				if (range instanceof Comparator) {
					this.raw = range.value;
					this.set = [[range]];
					this.format();
					return this;
				}
				this.options = options;
				this.loose = !!options.loose;
				this.includePrerelease = !!options.includePrerelease;
				this.raw = range.trim().split(/\s+/).join(" ");
				this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
				if (!this.set.length) {
					throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
				}
				if (this.set.length > 1) {
					const first = this.set[0];
					this.set = this.set.filter((c) => !isNullSet(c[0]));
					if (this.set.length === 0) {
						this.set = [first];
					} else if (this.set.length > 1) {
						for (const c of this.set) {
							if (c.length === 1 && isAny(c[0])) {
								this.set = [c];
								break;
							}
						}
					}
				}
				this.format();
			}
			format() {
				this.range = this.set.map((comps) => comps.join(" ").trim()).join("||").trim();
				return this.range;
			}
			toString() {
				return this.range;
			}
			parseRange(range) {
				const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
				const memoKey = memoOpts + ":" + range;
				const cached = cache.get(memoKey);
				if (cached) {
					return cached;
				}
				const loose = this.options.loose;
				const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
				range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
				debug("hyphen replace", range);
				range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
				debug("comparator trim", range);
				range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
				debug("tilde trim", range);
				range = range.replace(re[t.CARETTRIM], caretTrimReplace);
				debug("caret trim", range);
				let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
				if (loose) {
					rangeList = rangeList.filter((comp) => {
						debug("loose invalid filter", comp, this.options);
						return !!comp.match(re[t.COMPARATORLOOSE]);
					});
				}
				debug("range list", rangeList);
				const rangeMap = /* @__PURE__ */ new Map();
				const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
				for (const comp of comparators) {
					if (isNullSet(comp)) {
						return [comp];
					}
					rangeMap.set(comp.value, comp);
				}
				if (rangeMap.size > 1 && rangeMap.has("")) {
					rangeMap.delete("");
				}
				const result = [...rangeMap.values()];
				cache.set(memoKey, result);
				return result;
			}
			intersects(range, options) {
				if (!(range instanceof _Range)) {
					throw new TypeError("a Range is required");
				}
				return this.set.some((thisComparators) => {
					return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
						return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
							return rangeComparators.every((rangeComparator) => {
								return thisComparator.intersects(rangeComparator, options);
							});
						});
					});
				});
			}
			// if ANY of the sets match ALL of its comparators, then pass
			test(version) {
				if (!version) {
					return false;
				}
				if (typeof version === "string") {
					try {
						version = new SemVer(version, this.options);
					} catch (er) {
						return false;
					}
				}
				for (let i = 0; i < this.set.length; i++) {
					if (testSet(this.set[i], version, this.options)) {
						return true;
					}
				}
				return false;
			}
		};
		module.exports = Range;
		var LRU = require_lru_cache();
		var cache = new LRU({ max: 1e3 });
		var parseOptions = require_parse_options();
		var Comparator = require_comparator();
		var debug = require_debug();
		var SemVer = require_semver();
		var {
			safeRe: re,
			t,
			comparatorTrimReplace,
			tildeTrimReplace,
			caretTrimReplace
		} = require_re();
		var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
		var isNullSet = (c) => c.value === "<0.0.0-0";
		var isAny = (c) => c.value === "";
		var isSatisfiable = (comparators, options) => {
			let result = true;
			const remainingComparators = comparators.slice();
			let testComparator = remainingComparators.pop();
			while (result && remainingComparators.length) {
				result = remainingComparators.every((otherComparator) => {
					return testComparator.intersects(otherComparator, options);
				});
				testComparator = remainingComparators.pop();
			}
			return result;
		};
		var parseComparator = (comp, options) => {
			debug("comp", comp, options);
			comp = replaceCarets(comp, options);
			debug("caret", comp);
			comp = replaceTildes(comp, options);
			debug("tildes", comp);
			comp = replaceXRanges(comp, options);
			debug("xrange", comp);
			comp = replaceStars(comp, options);
			debug("stars", comp);
			return comp;
		};
		var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
		var replaceTildes = (comp, options) => {
			return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
		};
		var replaceTilde = (comp, options) => {
			const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
			return comp.replace(r, (_, M, m, p, pr) => {
				debug("tilde", comp, _, M, m, p, pr);
				let ret;
				if (isX(M)) {
					ret = "";
				} else if (isX(m)) {
					ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
				} else if (isX(p)) {
					ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
				} else if (pr) {
					debug("replaceTilde pr", pr);
					ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
				} else {
					ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
				}
				debug("tilde return", ret);
				return ret;
			});
		};
		var replaceCarets = (comp, options) => {
			return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
		};
		var replaceCaret = (comp, options) => {
			debug("caret", comp, options);
			const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
			const z = options.includePrerelease ? "-0" : "";
			return comp.replace(r, (_, M, m, p, pr) => {
				debug("caret", comp, _, M, m, p, pr);
				let ret;
				if (isX(M)) {
					ret = "";
				} else if (isX(m)) {
					ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
				} else if (isX(p)) {
					if (M === "0") {
						ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
					} else {
						ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
					}
				} else if (pr) {
					debug("replaceCaret pr", pr);
					if (M === "0") {
						if (m === "0") {
							ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
						} else {
							ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
						}
					} else {
						ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
					}
				} else {
					debug("no pr");
					if (M === "0") {
						if (m === "0") {
							ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
						} else {
							ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
						}
					} else {
						ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
					}
				}
				debug("caret return", ret);
				return ret;
			});
		};
		var replaceXRanges = (comp, options) => {
			debug("replaceXRanges", comp, options);
			return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
		};
		var replaceXRange = (comp, options) => {
			comp = comp.trim();
			const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
			return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
				debug("xRange", comp, ret, gtlt, M, m, p, pr);
				const xM = isX(M);
				const xm = xM || isX(m);
				const xp = xm || isX(p);
				const anyX = xp;
				if (gtlt === "=" && anyX) {
					gtlt = "";
				}
				pr = options.includePrerelease ? "-0" : "";
				if (xM) {
					if (gtlt === ">" || gtlt === "<") {
						ret = "<0.0.0-0";
					} else {
						ret = "*";
					}
				} else if (gtlt && anyX) {
					if (xm) {
						m = 0;
					}
					p = 0;
					if (gtlt === ">") {
						gtlt = ">=";
						if (xm) {
							M = +M + 1;
							m = 0;
							p = 0;
						} else {
							m = +m + 1;
							p = 0;
						}
					} else if (gtlt === "<=") {
						gtlt = "<";
						if (xm) {
							M = +M + 1;
						} else {
							m = +m + 1;
						}
					}
					if (gtlt === "<") {
						pr = "-0";
					}
					ret = `${gtlt + M}.${m}.${p}${pr}`;
				} else if (xm) {
					ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
				} else if (xp) {
					ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
				}
				debug("xRange return", ret);
				return ret;
			});
		};
		var replaceStars = (comp, options) => {
			debug("replaceStars", comp, options);
			return comp.trim().replace(re[t.STAR], "");
		};
		var replaceGTE0 = (comp, options) => {
			debug("replaceGTE0", comp, options);
			return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
		};
		var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr, tb) => {
			if (isX(fM)) {
				from = "";
			} else if (isX(fm)) {
				from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
			} else if (isX(fp)) {
				from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
			} else if (fpr) {
				from = `>=${from}`;
			} else {
				from = `>=${from}${incPr ? "-0" : ""}`;
			}
			if (isX(tM)) {
				to = "";
			} else if (isX(tm)) {
				to = `<${+tM + 1}.0.0-0`;
			} else if (isX(tp)) {
				to = `<${tM}.${+tm + 1}.0-0`;
			} else if (tpr) {
				to = `<=${tM}.${tm}.${tp}-${tpr}`;
			} else if (incPr) {
				to = `<${tM}.${tm}.${+tp + 1}-0`;
			} else {
				to = `<=${to}`;
			}
			return `${from} ${to}`.trim();
		};
		var testSet = (set, version, options) => {
			for (let i = 0; i < set.length; i++) {
				if (!set[i].test(version)) {
					return false;
				}
			}
			if (version.prerelease.length && !options.includePrerelease) {
				for (let i = 0; i < set.length; i++) {
					debug(set[i].semver);
					if (set[i].semver === Comparator.ANY) {
						continue;
					}
					if (set[i].semver.prerelease.length > 0) {
						const allowed = set[i].semver;
						if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
							return true;
						}
					}
				}
				return false;
			}
			return true;
		};
	}
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
	"node_modules/semver/classes/comparator.js"(exports, module) {
		var ANY = Symbol("SemVer ANY");
		var Comparator = class _Comparator {
			static get ANY() {
				return ANY;
			}
			constructor(comp, options) {
				options = parseOptions(options);
				if (comp instanceof _Comparator) {
					if (comp.loose === !!options.loose) {
						return comp;
					} else {
						comp = comp.value;
					}
				}
				comp = comp.trim().split(/\s+/).join(" ");
				debug("comparator", comp, options);
				this.options = options;
				this.loose = !!options.loose;
				this.parse(comp);
				if (this.semver === ANY) {
					this.value = "";
				} else {
					this.value = this.operator + this.semver.version;
				}
				debug("comp", this);
			}
			parse(comp) {
				const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
				const m = comp.match(r);
				if (!m) {
					throw new TypeError(`Invalid comparator: ${comp}`);
				}
				this.operator = m[1] !== void 0 ? m[1] : "";
				if (this.operator === "=") {
					this.operator = "";
				}
				if (!m[2]) {
					this.semver = ANY;
				} else {
					this.semver = new SemVer(m[2], this.options.loose);
				}
			}
			toString() {
				return this.value;
			}
			test(version) {
				debug("Comparator.test", version, this.options.loose);
				if (this.semver === ANY || version === ANY) {
					return true;
				}
				if (typeof version === "string") {
					try {
						version = new SemVer(version, this.options);
					} catch (er) {
						return false;
					}
				}
				return cmp(version, this.operator, this.semver, this.options);
			}
			intersects(comp, options) {
				if (!(comp instanceof _Comparator)) {
					throw new TypeError("a Comparator is required");
				}
				if (this.operator === "") {
					if (this.value === "") {
						return true;
					}
					return new Range(comp.value, options).test(this.value);
				} else if (comp.operator === "") {
					if (comp.value === "") {
						return true;
					}
					return new Range(this.value, options).test(comp.semver);
				}
				options = parseOptions(options);
				if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
					return false;
				}
				if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
					return false;
				}
				if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
					return true;
				}
				if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
					return true;
				}
				if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
					return true;
				}
				if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
					return true;
				}
				if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
					return true;
				}
				return false;
			}
		};
		module.exports = Comparator;
		var parseOptions = require_parse_options();
		var { safeRe: re, t } = require_re();
		var cmp = require_cmp();
		var debug = require_debug();
		var SemVer = require_semver();
		var Range = require_range();
	}
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
	"node_modules/semver/functions/satisfies.js"(exports, module) {
		var Range = require_range();
		var satisfies = (version, range, options) => {
			try {
				range = new Range(range, options);
			} catch (er) {
				return false;
			}
			return range.test(version);
		};
		module.exports = satisfies;
	}
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
	"node_modules/semver/ranges/to-comparators.js"(exports, module) {
		var Range = require_range();
		var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
		module.exports = toComparators;
	}
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
	"node_modules/semver/ranges/max-satisfying.js"(exports, module) {
		var SemVer = require_semver();
		var Range = require_range();
		var maxSatisfying = (versions, range, options) => {
			let max = null;
			let maxSV = null;
			let rangeObj = null;
			try {
				rangeObj = new Range(range, options);
			} catch (er) {
				return null;
			}
			versions.forEach((v) => {
				if (rangeObj.test(v)) {
					if (!max || maxSV.compare(v) === -1) {
						max = v;
						maxSV = new SemVer(max, options);
					}
				}
			});
			return max;
		};
		module.exports = maxSatisfying;
	}
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
	"node_modules/semver/ranges/min-satisfying.js"(exports, module) {
		var SemVer = require_semver();
		var Range = require_range();
		var minSatisfying = (versions, range, options) => {
			let min = null;
			let minSV = null;
			let rangeObj = null;
			try {
				rangeObj = new Range(range, options);
			} catch (er) {
				return null;
			}
			versions.forEach((v) => {
				if (rangeObj.test(v)) {
					if (!min || minSV.compare(v) === 1) {
						min = v;
						minSV = new SemVer(min, options);
					}
				}
			});
			return min;
		};
		module.exports = minSatisfying;
	}
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
	"node_modules/semver/ranges/min-version.js"(exports, module) {
		var SemVer = require_semver();
		var Range = require_range();
		var gt = require_gt();
		var minVersion = (range, loose) => {
			range = new Range(range, loose);
			let minver = new SemVer("0.0.0");
			if (range.test(minver)) {
				return minver;
			}
			minver = new SemVer("0.0.0-0");
			if (range.test(minver)) {
				return minver;
			}
			minver = null;
			for (let i = 0; i < range.set.length; ++i) {
				const comparators = range.set[i];
				let setMin = null;
				comparators.forEach((comparator) => {
					const compver = new SemVer(comparator.semver.version);
					switch (comparator.operator) {
						case ">":
							if (compver.prerelease.length === 0) {
								compver.patch++;
							} else {
								compver.prerelease.push(0);
							}
							compver.raw = compver.format();
						case "":
						case ">=":
							if (!setMin || gt(compver, setMin)) {
								setMin = compver;
							}
							break;
						case "<":
						case "<=":
							break;
						default:
							throw new Error(`Unexpected operation: ${comparator.operator}`);
					}
				});
				if (setMin && (!minver || gt(minver, setMin))) {
					minver = setMin;
				}
			}
			if (minver && range.test(minver)) {
				return minver;
			}
			return null;
		};
		module.exports = minVersion;
	}
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
	"node_modules/semver/ranges/valid.js"(exports, module) {
		var Range = require_range();
		var validRange = (range, options) => {
			try {
				return new Range(range, options).range || "*";
			} catch (er) {
				return null;
			}
		};
		module.exports = validRange;
	}
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
	"node_modules/semver/ranges/outside.js"(exports, module) {
		var SemVer = require_semver();
		var Comparator = require_comparator();
		var { ANY } = Comparator;
		var Range = require_range();
		var satisfies = require_satisfies();
		var gt = require_gt();
		var lt = require_lt();
		var lte = require_lte();
		var gte = require_gte();
		var outside = (version, range, hilo, options) => {
			version = new SemVer(version, options);
			range = new Range(range, options);
			let gtfn, ltefn, ltfn, comp, ecomp;
			switch (hilo) {
				case ">":
					gtfn = gt;
					ltefn = lte;
					ltfn = lt;
					comp = ">";
					ecomp = ">=";
					break;
				case "<":
					gtfn = lt;
					ltefn = gte;
					ltfn = gt;
					comp = "<";
					ecomp = "<=";
					break;
				default:
					throw new TypeError('Must provide a hilo val of "<" or ">"');
			}
			if (satisfies(version, range, options)) {
				return false;
			}
			for (let i = 0; i < range.set.length; ++i) {
				const comparators = range.set[i];
				let high = null;
				let low = null;
				comparators.forEach((comparator) => {
					if (comparator.semver === ANY) {
						comparator = new Comparator(">=0.0.0");
					}
					high = high || comparator;
					low = low || comparator;
					if (gtfn(comparator.semver, high.semver, options)) {
						high = comparator;
					} else if (ltfn(comparator.semver, low.semver, options)) {
						low = comparator;
					}
				});
				if (high.operator === comp || high.operator === ecomp) {
					return false;
				}
				if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
					return false;
				} else if (low.operator === ecomp && ltfn(version, low.semver)) {
					return false;
				}
			}
			return true;
		};
		module.exports = outside;
	}
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
	"node_modules/semver/ranges/gtr.js"(exports, module) {
		var outside = require_outside();
		var gtr = (version, range, options) => outside(version, range, ">", options);
		module.exports = gtr;
	}
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
	"node_modules/semver/ranges/ltr.js"(exports, module) {
		var outside = require_outside();
		var ltr = (version, range, options) => outside(version, range, "<", options);
		module.exports = ltr;
	}
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
	"node_modules/semver/ranges/intersects.js"(exports, module) {
		var Range = require_range();
		var intersects = (r1, r2, options) => {
			r1 = new Range(r1, options);
			r2 = new Range(r2, options);
			return r1.intersects(r2, options);
		};
		module.exports = intersects;
	}
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
	"node_modules/semver/ranges/simplify.js"(exports, module) {
		var satisfies = require_satisfies();
		var compare = require_compare();
		module.exports = (versions, range, options) => {
			const set = [];
			let first = null;
			let prev = null;
			const v = versions.sort((a, b) => compare(a, b, options));
			for (const version of v) {
				const included = satisfies(version, range, options);
				if (included) {
					prev = version;
					if (!first) {
						first = version;
					}
				} else {
					if (prev) {
						set.push([first, prev]);
					}
					prev = null;
					first = null;
				}
			}
			if (first) {
				set.push([first, null]);
			}
			const ranges = [];
			for (const [min, max] of set) {
				if (min === max) {
					ranges.push(min);
				} else if (!max && min === v[0]) {
					ranges.push("*");
				} else if (!max) {
					ranges.push(`>=${min}`);
				} else if (min === v[0]) {
					ranges.push(`<=${max}`);
				} else {
					ranges.push(`${min} - ${max}`);
				}
			}
			const simplified = ranges.join(" || ");
			const original = typeof range.raw === "string" ? range.raw : String(range);
			return simplified.length < original.length ? simplified : range;
		};
	}
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
	"node_modules/semver/ranges/subset.js"(exports, module) {
		var Range = require_range();
		var Comparator = require_comparator();
		var { ANY } = Comparator;
		var satisfies = require_satisfies();
		var compare = require_compare();
		var subset = (sub, dom, options = {}) => {
			if (sub === dom) {
				return true;
			}
			sub = new Range(sub, options);
			dom = new Range(dom, options);
			let sawNonNull = false;
			OUTER:
			for (const simpleSub of sub.set) {
				for (const simpleDom of dom.set) {
					const isSub = simpleSubset(simpleSub, simpleDom, options);
					sawNonNull = sawNonNull || isSub !== null;
					if (isSub) {
						continue OUTER;
					}
				}
				if (sawNonNull) {
					return false;
				}
			}
			return true;
		};
		var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
		var minimumVersion = [new Comparator(">=0.0.0")];
		var simpleSubset = (sub, dom, options) => {
			if (sub === dom) {
				return true;
			}
			if (sub.length === 1 && sub[0].semver === ANY) {
				if (dom.length === 1 && dom[0].semver === ANY) {
					return true;
				} else if (options.includePrerelease) {
					sub = minimumVersionWithPreRelease;
				} else {
					sub = minimumVersion;
				}
			}
			if (dom.length === 1 && dom[0].semver === ANY) {
				if (options.includePrerelease) {
					return true;
				} else {
					dom = minimumVersion;
				}
			}
			const eqSet = /* @__PURE__ */ new Set();
			let gt, lt;
			for (const c of sub) {
				if (c.operator === ">" || c.operator === ">=") {
					gt = higherGT(gt, c, options);
				} else if (c.operator === "<" || c.operator === "<=") {
					lt = lowerLT(lt, c, options);
				} else {
					eqSet.add(c.semver);
				}
			}
			if (eqSet.size > 1) {
				return null;
			}
			let gtltComp;
			if (gt && lt) {
				gtltComp = compare(gt.semver, lt.semver, options);
				if (gtltComp > 0) {
					return null;
				} else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
					return null;
				}
			}
			for (const eq of eqSet) {
				if (gt && !satisfies(eq, String(gt), options)) {
					return null;
				}
				if (lt && !satisfies(eq, String(lt), options)) {
					return null;
				}
				for (const c of dom) {
					if (!satisfies(eq, String(c), options)) {
						return false;
					}
				}
				return true;
			}
			let higher, lower;
			let hasDomLT, hasDomGT;
			let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
			let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
			if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
				needDomLTPre = false;
			}
			for (const c of dom) {
				hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
				hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
				if (gt) {
					if (needDomGTPre) {
						if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
							needDomGTPre = false;
						}
					}
					if (c.operator === ">" || c.operator === ">=") {
						higher = higherGT(gt, c, options);
						if (higher === c && higher !== gt) {
							return false;
						}
					} else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
						return false;
					}
				}
				if (lt) {
					if (needDomLTPre) {
						if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
							needDomLTPre = false;
						}
					}
					if (c.operator === "<" || c.operator === "<=") {
						lower = lowerLT(lt, c, options);
						if (lower === c && lower !== lt) {
							return false;
						}
					} else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
						return false;
					}
				}
				if (!c.operator && (lt || gt) && gtltComp !== 0) {
					return false;
				}
			}
			if (gt && hasDomLT && !lt && gtltComp !== 0) {
				return false;
			}
			if (lt && hasDomGT && !gt && gtltComp !== 0) {
				return false;
			}
			if (needDomGTPre || needDomLTPre) {
				return false;
			}
			return true;
		};
		var higherGT = (a, b, options) => {
			if (!a) {
				return b;
			}
			const comp = compare(a.semver, b.semver, options);
			return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
		};
		var lowerLT = (a, b, options) => {
			if (!a) {
				return b;
			}
			const comp = compare(a.semver, b.semver, options);
			return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
		};
		module.exports = subset;
	}
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
	"node_modules/semver/index.js"(exports, module) {
		var internalRe = require_re();
		var constants = require_constants();
		var SemVer = require_semver();
		var identifiers = require_identifiers();
		var parse = require_parse();
		var valid = require_valid();
		var clean = require_clean();
		var inc = require_inc();
		var diff = require_diff();
		var major = require_major();
		var minor = require_minor();
		var patch = require_patch();
		var prerelease = require_prerelease();
		var compare = require_compare();
		var rcompare = require_rcompare();
		var compareLoose = require_compare_loose();
		var compareBuild = require_compare_build();
		var sort = require_sort();
		var rsort = require_rsort();
		var gt = require_gt();
		var lt = require_lt();
		var eq = require_eq();
		var neq = require_neq();
		var gte = require_gte();
		var lte = require_lte();
		var cmp = require_cmp();
		var coerce = require_coerce();
		var Comparator = require_comparator();
		var Range = require_range();
		var satisfies = require_satisfies();
		var toComparators = require_to_comparators();
		var maxSatisfying = require_max_satisfying();
		var minSatisfying = require_min_satisfying();
		var minVersion = require_min_version();
		var validRange = require_valid2();
		var outside = require_outside();
		var gtr = require_gtr();
		var ltr = require_ltr();
		var intersects = require_intersects();
		var simplifyRange = require_simplify();
		var subset = require_subset();
		module.exports = {
			parse,
			valid,
			clean,
			inc,
			diff,
			major,
			minor,
			patch,
			prerelease,
			compare,
			rcompare,
			compareLoose,
			compareBuild,
			sort,
			rsort,
			gt,
			lt,
			eq,
			neq,
			gte,
			lte,
			cmp,
			coerce,
			Comparator,
			Range,
			satisfies,
			toComparators,
			maxSatisfying,
			minSatisfying,
			minVersion,
			validRange,
			outside,
			gtr,
			ltr,
			intersects,
			simplifyRange,
			subset,
			SemVer,
			re: internalRe.re,
			src: internalRe.src,
			tokens: internalRe.t,
			SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
			RELEASE_TYPES: constants.RELEASE_TYPES,
			compareIdentifiers: identifiers.compareIdentifiers,
			rcompareIdentifiers: identifiers.rcompareIdentifiers
		};
	}
});

// index.js
var import_semver = __toESM(require_semver2());
var semver_build_default = import_semver.default;
export {
	semver_build_default as default
};

export const parse = semver_build_default.parse
export const valid = semver_build_default.valid
export const clean = semver_build_default.clean
export const inc = semver_build_default.inc
export const diff = semver_build_default.diff
export const major = semver_build_default.major
export const minor = semver_build_default.minor
export const patch = semver_build_default.patch
export const prerelease = semver_build_default.prerelease
export const compare = semver_build_default.compare
export const rcompare = semver_build_default.rcompare
export const compareLoose = semver_build_default.compareLoose
export const compareBuild = semver_build_default.compareBuild
export const sort = semver_build_default.sort
export const rsort = semver_build_default.rsort
export const gt = semver_build_default.gt
export const lt = semver_build_default.lt
export const eq = semver_build_default.eq
export const neq = semver_build_default.neq
export const gte = semver_build_default.gte
export const lte = semver_build_default.lte
export const cmp = semver_build_default.cmp
export const coerce = semver_build_default.coerce
export const Comparator = semver_build_default.Comparator
export const Range = semver_build_default.Range
export const satisfies = semver_build_default.satisfies
export const toComparators = semver_build_default.toComparators
export const maxSatisfying = semver_build_default.maxSatisfying
export const minSatisfying = semver_build_default.minSatisfying
export const minVersion = semver_build_default.minVersion
export const validRange = semver_build_default.validRange
export const outside = semver_build_default.outside
export const gtr = semver_build_default.gtr
export const ltr = semver_build_default.ltr
export const intersects = semver_build_default.intersects
export const simplifyRange = semver_build_default.simplifyRange
export const subset = semver_build_default.subset
export const SemVer = semver_build_default.SemVer
export const re = semver_build_default.re
export const src = semver_build_default.src
export const tokens = semver_build_default.tokens
export const SEMVER_SPEC_VERSION = semver_build_default.SEMVER_SPEC_VERSION
export const RELEASE_TYPES = semver_build_default.RELEASE_TYPES
export const compareIdentifiers = semver_build_default.compareIdentifiers
export const rcompareIdentifiers = semver_build_default.rcompareIdentifiers
