// !(function (e, t) {
// 	"object" == typeof exports && "object" == typeof module
// 	  ? (module.exports = t())
// 	  : "function" == typeof define && define.amd
// 	  ? define([], t)
// 	  : "object" == typeof exports
// 	  ? (exports.Parser = t())
// 	  : (e.Parser = t());
//   })(this, function () {
// return (() => {
//   "use strict";

(function (global, factory) {
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
		typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
			(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Parser = {}));
})(this, (function () {

	var Module = void 0 !== Module ? Module : {};

	TreeSitter = (function () {
		'use strict';
		var initPromise,
			document =
				"object" == typeof window
					? { currentScript: window.document.currentScript }
					: null;
		class Parser {
			constructor() {
				this.initialize();
			}
			initialize() {
				throw new Error("cannot construct a Parser before calling `init()`");
			}
			static init(moduleOptions) {
				return (
					initPromise ||
					((Module = Object.assign({}, Module, moduleOptions)),
						(initPromise = new Promise((resolveInitPromise) => {
							var moduleOverrides = Object.assign({}, Module),
								arguments_ = [],
								thisProgram = "./this.program",
								quit_ = (e, t) => {
									throw t;
								},
								ENVIRONMENT_IS_WEB = "object" == typeof window,
								ENVIRONMENT_IS_WORKER = "function" == typeof importScripts,
								ENVIRONMENT_IS_NODE =
									"object" == typeof process &&
									"object" == typeof process.versions &&
									"string" == typeof process.versions.node,
								scriptDirectory = "",
								read_,
								readAsync,
								readBinary;
							function locateFile(e) {
								return Module.locateFile
									? Module.locateFile(e, scriptDirectory)
									: scriptDirectory + e;
							}
							if (ENVIRONMENT_IS_NODE) {
								var fs = require("fs"),
									nodePath = require("path");
								(scriptDirectory = ENVIRONMENT_IS_WORKER
									? nodePath.dirname(scriptDirectory) + "/"
									: __dirname + "/"),
									(read_ = (e, t) => (
										(e = isFileURI(e) ? new URL(e) : nodePath.normalize(e)),
										fs.readFileSync(e, t ? void 0 : "utf8")
									)),
									(readBinary = (e) => {
										var t = read_(e, !0);
										return t.buffer || (t = new Uint8Array(t)), t;
									}),
									(readAsync = (e, t, _, s = !0) => {
										(e = isFileURI(e) ? new URL(e) : nodePath.normalize(e)),
											fs.readFile(e, s ? void 0 : "utf8", (e, r) => {
												e ? _(e) : t(s ? r.buffer : r);
											});
									}),
									!Module.thisProgram &&
									process.argv.length > 1 &&
									(thisProgram = process.argv[1].replace(/\\/g, "/")),
									(arguments_ = process.argv.slice(2)),
									"undefined" != typeof module && (module.exports = Module),
									(quit_ = (e, t) => {
										throw ((process.exitCode = e), t);
									});
							} else
								(ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) &&
									(ENVIRONMENT_IS_WORKER
										? (scriptDirectory = self.location.href)
										: void 0 !== document &&
										document.currentScript &&
										(scriptDirectory = document.currentScript.src),
										(scriptDirectory = scriptDirectory.startsWith("blob:")
											? ""
											: scriptDirectory.substr(
												0,
												scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1
											)),
										(read_ = (e) => {
											var t = new XMLHttpRequest();
											return t.open("GET", e, !1), t.send(null), t.responseText;
										}),
										ENVIRONMENT_IS_WORKER &&
										(readBinary = (e) => {
											var t = new XMLHttpRequest();
											return (
												t.open("GET", e, !1),
												(t.responseType = "arraybuffer"),
												t.send(null),
												new Uint8Array(t.response)
											);
										}),
										(readAsync = (e, t, _) => {
											var s = new XMLHttpRequest();
											s.open("GET", e, !0),
												(s.responseType = "arraybuffer"),
												(s.onload = () => {
													200 == s.status || (0 == s.status && s.response)
														? t(s.response)
														: _();
												}),
												(s.onerror = _),
												s.send(null);
										}));
							var out = Module.print || console.log.bind(console),
								err = Module.printErr || console.error.bind(console);
							Object.assign(Module, moduleOverrides),
								(moduleOverrides = null),
								Module.arguments && (arguments_ = Module.arguments),
								Module.thisProgram && (thisProgram = Module.thisProgram),
								Module.quit && (quit_ = Module.quit);
							var dynamicLibraries = Module.dynamicLibraries || [],
								wasmBinary,
								wasmMemory;
							Module.wasmBinary && (wasmBinary = Module.wasmBinary),
								"object" != typeof WebAssembly &&
								abort("no native wasm support detected");
							var ABORT = !1,
								EXITSTATUS,
								HEAP8,
								HEAPU8,
								HEAP16,
								HEAPU16,
								HEAP32,
								HEAPU32,
								HEAPF32,
								HEAPF64;
							function updateMemoryViews() {
								var e = wasmMemory.buffer;
								(Module.HEAP8 = HEAP8 = new Int8Array(e)),
									(Module.HEAP16 = HEAP16 = new Int16Array(e)),
									(Module.HEAPU8 = HEAPU8 = new Uint8Array(e)),
									(Module.HEAPU16 = HEAPU16 = new Uint16Array(e)),
									(Module.HEAP32 = HEAP32 = new Int32Array(e)),
									(Module.HEAPU32 = HEAPU32 = new Uint32Array(e)),
									(Module.HEAPF32 = HEAPF32 = new Float32Array(e)),
									(Module.HEAPF64 = HEAPF64 = new Float64Array(e));
							}
							var INITIAL_MEMORY = Module.INITIAL_MEMORY || 33554432;
							(wasmMemory = Module.wasmMemory
								? Module.wasmMemory
								: new WebAssembly.Memory({
									initial: INITIAL_MEMORY / 65536,
									maximum: 32768,
								})),
								updateMemoryViews(),
								(INITIAL_MEMORY = wasmMemory.buffer.byteLength);
							var __ATPRERUN__ = [],
								__ATINIT__ = [],
								__ATMAIN__ = [],
								__ATPOSTRUN__ = [],
								__RELOC_FUNCS__ = [],
								runtimeInitialized = !1;
							function preRun() {
								if (Module.preRun)
									for (
										"function" == typeof Module.preRun &&
										(Module.preRun = [Module.preRun]);
										Module.preRun.length;

									)
										addOnPreRun(Module.preRun.shift());
								callRuntimeCallbacks(__ATPRERUN__);
							}
							function initRuntime() {
								(runtimeInitialized = !0),
									callRuntimeCallbacks(__RELOC_FUNCS__),
									callRuntimeCallbacks(__ATINIT__);
							}
							function preMain() {
								callRuntimeCallbacks(__ATMAIN__);
							}
							function postRun() {
								if (Module.postRun)
									for (
										"function" == typeof Module.postRun &&
										(Module.postRun = [Module.postRun]);
										Module.postRun.length;

									)
										addOnPostRun(Module.postRun.shift());
								callRuntimeCallbacks(__ATPOSTRUN__);
							}
							function addOnPreRun(e) {
								__ATPRERUN__.unshift(e);
							}
							function addOnInit(e) {
								__ATINIT__.unshift(e);
							}
							function addOnPostRun(e) {
								__ATPOSTRUN__.unshift(e);
							}
							var runDependencies = 0,
								runDependencyWatcher = null,
								dependenciesFulfilled = null;
							function getUniqueRunDependency(e) {
								return e;
							}
							function addRunDependency(e) {
								runDependencies++,
									Module.monitorRunDependencies?.(runDependencies);
							}
							function removeRunDependency(e) {
								if (
									(runDependencies--,
										Module.monitorRunDependencies?.(runDependencies),
										0 == runDependencies &&
										(null !== runDependencyWatcher &&
											(clearInterval(runDependencyWatcher),
												(runDependencyWatcher = null)),
											dependenciesFulfilled))
								) {
									var t = dependenciesFulfilled;
									(dependenciesFulfilled = null), t();
								}
							}
							function abort(e) {
								throw (
									(Module.onAbort?.(e),
										err((e = "Aborted(" + e + ")")),
										(ABORT = !0),
										(EXITSTATUS = 1),
										(e += ". Build with -sASSERTIONS for more info."),
										new WebAssembly.RuntimeError(e))
								);
							}
							var dataURIPrefix = "data:application/octet-stream;base64,",
								isDataURI = (e) => e.startsWith(dataURIPrefix),
								isFileURI = (e) => e.startsWith("file://"),
								wasmBinaryFile;
							function getBinarySync(e) {
								if (e == wasmBinaryFile && wasmBinary)
									return new Uint8Array(wasmBinary);
								if (readBinary) return readBinary(e);
								throw "both async and sync fetching of the wasm failed";
							}
							function getBinaryPromise(e) {
								if (
									!wasmBinary &&
									(ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)
								) {
									if ("function" == typeof fetch && !isFileURI(e))
										return fetch(e, { credentials: "same-origin" })
											.then((t) => {
												if (!t.ok)
													throw `failed to load wasm binary file at '${e}'`;
												return t.arrayBuffer();
											})
											.catch(() => getBinarySync(e));
									if (readAsync)
										return new Promise((t, _) => {
											readAsync(e, (e) => t(new Uint8Array(e)), _);
										});
								}
								return Promise.resolve().then(() => getBinarySync(e));
							}
							function instantiateArrayBuffer(e, t, _) {
								return getBinaryPromise(e)
									.then((e) => WebAssembly.instantiate(e, t))
									.then(_, (e) => {
										err(`failed to asynchronously prepare wasm: ${e}`), abort(e);
									});
							}
							function instantiateAsync(e, t, _, s) {
								return e ||
									"function" != typeof WebAssembly.instantiateStreaming ||
									isDataURI(t) ||
									isFileURI(t) ||
									ENVIRONMENT_IS_NODE ||
									"function" != typeof fetch
									? instantiateArrayBuffer(t, _, s)
									: fetch(t, { credentials: "same-origin" }).then((e) =>
										WebAssembly.instantiateStreaming(e, _).then(
											s,
											function (e) {
												return (
													err(`wasm streaming compile failed: ${e}`),
													err("falling back to ArrayBuffer instantiation"),
													instantiateArrayBuffer(t, _, s)
												);
											}
										)
									);
							}
							function createWasm() {
								var e = {
									env: wasmImports,
									wasi_snapshot_preview1: wasmImports,
									"GOT.mem": new Proxy(wasmImports, GOTHandler),
									"GOT.func": new Proxy(wasmImports, GOTHandler),
								};
								function t(e, t) {
									(wasmExports = e.exports),
										(wasmExports = relocateExports(wasmExports, 1024));
									var _ = getDylinkMetadata(t);
									return (
										_.neededDynlibs &&
										(dynamicLibraries =
											_.neededDynlibs.concat(dynamicLibraries)),
										mergeLibSymbols(wasmExports, "main"),
										LDSO.init(),
										loadDylibs(),
										addOnInit(wasmExports.__wasm_call_ctors),
										__RELOC_FUNCS__.push(wasmExports.__wasm_apply_data_relocs),
										removeRunDependency("wasm-instantiate"),
										wasmExports
									);
								}
								if (
									(addRunDependency("wasm-instantiate"), Module.instantiateWasm)
								)
									try {
										return Module.instantiateWasm(e, t);
									} catch (e) {
										return (
											err(
												`Module.instantiateWasm callback failed with error: ${e}`
											),
											!1
										);
									}
								return (
									instantiateAsync(wasmBinary, wasmBinaryFile, e, function (e) {
										t(e.instance, e.module);
									}),
									{}
								);
							}
							(wasmBinaryFile = "tree-sitter.wasm"),
								isDataURI(wasmBinaryFile) ||
								(wasmBinaryFile = locateFile(wasmBinaryFile));
							var ASM_CONSTS = {};
							function ExitStatus(e) {
								(this.name = "ExitStatus"),
									(this.message = `Program terminated with exit(${e})`),
									(this.status = e);
							}
							var GOT = {},
								currentModuleWeakSymbols = new Set([]),
								GOTHandler = {
									get(e, t) {
										var _ = GOT[t];
										return (
											_ ||
											(_ = GOT[t] =
												new WebAssembly.Global({ value: "i32", mutable: !0 })),
											currentModuleWeakSymbols.has(t) || (_.required = !0),
											_
										);
									},
								},
								callRuntimeCallbacks = (e) => {
									for (; e.length > 0;) e.shift()(Module);
								},
								UTF8Decoder =
									"undefined" != typeof TextDecoder
										? new TextDecoder("utf8")
										: void 0,
								UTF8ArrayToString = (e, t, _) => {
									for (var s = t + _, r = t; e[r] && !(r >= s);) ++r;
									if (r - t > 16 && e.buffer && UTF8Decoder)
										return UTF8Decoder.decode(e.subarray(t, r));
									for (var a = ""; t < r;) {
										var o = e[t++];
										if (128 & o) {
											var n = 63 & e[t++];
											if (192 != (224 & o)) {
												var l = 63 & e[t++];
												if (
													(o =
														224 == (240 & o)
															? ((15 & o) << 12) | (n << 6) | l
															: ((7 & o) << 18) |
															(n << 12) |
															(l << 6) |
															(63 & e[t++])) < 65536
												)
													a += String.fromCharCode(o);
												else {
													var d = o - 65536;
													a += String.fromCharCode(
														55296 | (d >> 10),
														56320 | (1023 & d)
													);
												}
											} else a += String.fromCharCode(((31 & o) << 6) | n);
										} else a += String.fromCharCode(o);
									}
									return a;
								},
								getDylinkMetadata = (e) => {
									var t = 0,
										_ = 0;
									function s() {
										for (var _ = 0, s = 1; ;) {
											var r = e[t++];
											if (((_ += (127 & r) * s), (s *= 128), !(128 & r))) break;
										}
										return _;
									}
									function r() {
										var _ = s();
										return UTF8ArrayToString(e, (t += _) - _, _);
									}
									function a(e, t) {
										if (e) throw new Error(t);
									}
									var o = "dylink.0";
									if (e instanceof WebAssembly.Module) {
										var n = WebAssembly.Module.customSections(e, o);
										0 === n.length &&
											((o = "dylink"),
												(n = WebAssembly.Module.customSections(e, o))),
											a(0 === n.length, "need dylink section"),
											(_ = (e = new Uint8Array(n[0])).length);
									} else {
										a(
											!(
												1836278016 ==
												new Uint32Array(
													new Uint8Array(e.subarray(0, 24)).buffer
												)[0]
											),
											"need to see wasm magic number"
										),
											a(0 !== e[8], "need the dylink section to be first"),
											(t = 9);
										var l = s();
										(_ = t + l), (o = r());
									}
									var d = {
										neededDynlibs: [],
										tlsExports: new Set(),
										weakImports: new Set(),
									};
									if ("dylink" == o) {
										(d.memorySize = s()),
											(d.memoryAlign = s()),
											(d.tableSize = s()),
											(d.tableAlign = s());
										for (var u = s(), m = 0; m < u; ++m) {
											var c = r();
											d.neededDynlibs.push(c);
										}
									} else {
										a("dylink.0" !== o);
										for (; t < _;) {
											var w = e[t++],
												p = s();
											if (1 === w)
												(d.memorySize = s()),
													(d.memoryAlign = s()),
													(d.tableSize = s()),
													(d.tableAlign = s());
											else if (2 === w)
												for (u = s(), m = 0; m < u; ++m)
													(c = r()), d.neededDynlibs.push(c);
											else if (3 === w)
												for (var h = s(); h--;) {
													var g = r();
													256 & s() && d.tlsExports.add(g);
												}
											else if (4 === w)
												for (h = s(); h--;) {
													r(), (g = r());
													1 == (3 & s()) && d.weakImports.add(g);
												}
											else t += p;
										}
									}
									return d;
								};
							function getValue(e, t = "i8") {
								switch ((t.endsWith("*") && (t = "*"), t)) {
									case "i1":
									case "i8":
										return HEAP8[e];
									case "i16":
										return HEAP16[e >> 1];
									case "i32":
										return HEAP32[e >> 2];
									case "i64":
										abort("to do getValue(i64) use WASM_BIGINT");
									case "float":
										return HEAPF32[e >> 2];
									case "double":
										return HEAPF64[e >> 3];
									case "*":
										return HEAPU32[e >> 2];
									default:
										abort(`invalid type for getValue: ${t}`);
								}
							}
							var newDSO = (e, t, _) => {
								var s = { refcount: 1 / 0, name: e, exports: _, global: !0 };
								return (
									(LDSO.loadedLibsByName[e] = s),
									null != t && (LDSO.loadedLibsByHandle[t] = s),
									s
								);
							},
								LDSO = {
									loadedLibsByName: {},
									loadedLibsByHandle: {},
									init() {
										newDSO("__main__", 0, wasmImports);
									},
								},
								___heap_base = 78096,
								zeroMemory = (e, t) => (HEAPU8.fill(0, e, e + t), e),
								alignMemory = (e, t) => Math.ceil(e / t) * t,
								getMemory = (e) => {
									if (runtimeInitialized) return zeroMemory(_malloc(e), e);
									var t = ___heap_base,
										_ = t + alignMemory(e, 16);
									return (___heap_base = _), (GOT.__heap_base.value = _), t;
								},
								isInternalSym = (e) =>
									[
										"__cpp_exception",
										"__c_longjmp",
										"__wasm_apply_data_relocs",
										"__dso_handle",
										"__tls_size",
										"__tls_align",
										"__set_stack_limits",
										"_emscripten_tls_init",
										"__wasm_init_tls",
										"__wasm_call_ctors",
										"__start_em_asm",
										"__stop_em_asm",
										"__start_em_js",
										"__stop_em_js",
									].includes(e) || e.startsWith("__em_js__"),
								uleb128Encode = (e, t) => {
									e < 128 ? t.push(e) : t.push(e % 128 | 128, e >> 7);
								},
								sigToWasmTypes = (e) => {
									for (
										var t = {
											i: "i32",
											j: "i64",
											f: "f32",
											d: "f64",
											e: "externref",
											p: "i32",
										},
										_ = {
											parameters: [],
											results: "v" == e[0] ? [] : [t[e[0]]],
										},
										s = 1;
										s < e.length;
										++s
									)
										_.parameters.push(t[e[s]]);
									return _;
								},
								generateFuncType = (e, t) => {
									var _ = e.slice(0, 1),
										s = e.slice(1),
										r = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 };
									t.push(96), uleb128Encode(s.length, t);
									for (var a = 0; a < s.length; ++a) t.push(r[s[a]]);
									"v" == _ ? t.push(0) : t.push(1, r[_]);
								},
								convertJsFunctionToWasm = (e, t) => {
									if ("function" == typeof WebAssembly.Function)
										return new WebAssembly.Function(sigToWasmTypes(t), e);
									var _ = [1];
									generateFuncType(t, _);
									var s = [0, 97, 115, 109, 1, 0, 0, 0, 1];
									uleb128Encode(_.length, s),
										s.push(..._),
										s.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
									var r = new WebAssembly.Module(new Uint8Array(s));
									return new WebAssembly.Instance(r, { e: { f: e } }).exports.f;
								},
								wasmTableMirror = [],
								wasmTable = new WebAssembly.Table({
									initial: 27,
									element: "anyfunc",
								}),
								getWasmTableEntry = (e) => {
									var t = wasmTableMirror[e];
									return (
										t ||
										(e >= wasmTableMirror.length &&
											(wasmTableMirror.length = e + 1),
											(wasmTableMirror[e] = t = wasmTable.get(e))),
										t
									);
								},
								updateTableMap = (e, t) => {
									if (functionsInTableMap)
										for (var _ = e; _ < e + t; _++) {
											var s = getWasmTableEntry(_);
											s && functionsInTableMap.set(s, _);
										}
								},
								functionsInTableMap,
								getFunctionAddress = (e) => (
									functionsInTableMap ||
									((functionsInTableMap = new WeakMap()),
										updateTableMap(0, wasmTable.length)),
									functionsInTableMap.get(e) || 0
								),
								freeTableIndexes = [],
								getEmptyTableSlot = () => {
									if (freeTableIndexes.length) return freeTableIndexes.pop();
									try {
										wasmTable.grow(1);
									} catch (e) {
										if (!(e instanceof RangeError)) throw e;
										throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
									}
									return wasmTable.length - 1;
								},
								setWasmTableEntry = (e, t) => {
									wasmTable.set(e, t), (wasmTableMirror[e] = wasmTable.get(e));
								},
								addFunction = (e, t) => {
									var _ = getFunctionAddress(e);
									if (_) return _;
									var s = getEmptyTableSlot();
									try {
										setWasmTableEntry(s, e);
									} catch (_) {
										if (!(_ instanceof TypeError)) throw _;
										var r = convertJsFunctionToWasm(e, t);
										setWasmTableEntry(s, r);
									}
									return functionsInTableMap.set(e, s), s;
								},
								updateGOT = (e, t) => {
									for (var _ in e)
										if (!isInternalSym(_)) {
											var s = e[_];
											_.startsWith("orig$") && ((_ = _.split("$")[1]), (t = !0)),
												(GOT[_] ||= new WebAssembly.Global({
													value: "i32",
													mutable: !0,
												})),
												(t || 0 == GOT[_].value) &&
												("function" == typeof s
													? (GOT[_].value = addFunction(s))
													: "number" == typeof s
														? (GOT[_].value = s)
														: err(
															`unhandled export type for '${_}': ${typeof s}`
														));
										}
								},
								relocateExports = (e, t, _) => {
									var s = {};
									for (var r in e) {
										var a = e[r];
										"object" == typeof a && (a = a.value),
											"number" == typeof a && (a += t),
											(s[r] = a);
									}
									return updateGOT(s, _), s;
								},
								isSymbolDefined = (e) => {
									var t = wasmImports[e];
									return !(!t || t.stub);
								},
								dynCallLegacy = (e, t, _) => (0, Module["dynCall_" + e])(t, ..._),
								dynCall = (e, t, _ = []) =>
									e.includes("j")
										? dynCallLegacy(e, t, _)
										: getWasmTableEntry(t)(..._),
								createInvokeFunction = (e) =>
									function () {
										var t = stackSave();
										try {
											return dynCall(
												e,
												arguments[0],
												Array.prototype.slice.call(arguments, 1)
											);
										} catch (e) {
											if ((stackRestore(t), e !== e + 0)) throw e;
											_setThrew(1, 0);
										}
									},
								resolveGlobalSymbol = (e, t = !1) => {
									var _;
									return (
										t && "orig$" + e in wasmImports && (e = "orig$" + e),
										isSymbolDefined(e)
											? (_ = wasmImports[e])
											: e.startsWith("invoke_") &&
											(_ = wasmImports[e] =
												createInvokeFunction(e.split("_")[1])),
										{ sym: _, name: e }
									);
								},
								UTF8ToString = (e, t) =>
									e ? UTF8ArrayToString(HEAPU8, e, t) : "",
								loadWebAssemblyModule = (
									binary,
									flags,
									libName,
									localScope,
									handle
								) => {
									var metadata = getDylinkMetadata(binary);
									function loadModule() {
										var firstLoad = !handle || !HEAP8[handle + 8];
										if (firstLoad) {
											var memAlign = Math.pow(2, metadata.memoryAlign),
												memoryBase = metadata.memorySize
													? alignMemory(
														getMemory(metadata.memorySize + memAlign),
														memAlign
													)
													: 0,
												tableBase = metadata.tableSize ? wasmTable.length : 0;
											handle &&
												((HEAP8[handle + 8] = 1),
													(HEAPU32[(handle + 12) >> 2] = memoryBase),
													(HEAP32[(handle + 16) >> 2] = metadata.memorySize),
													(HEAPU32[(handle + 20) >> 2] = tableBase),
													(HEAP32[(handle + 24) >> 2] = metadata.tableSize));
										} else
											(memoryBase = HEAPU32[(handle + 12) >> 2]),
												(tableBase = HEAPU32[(handle + 20) >> 2]);
										var tableGrowthNeeded =
											tableBase + metadata.tableSize - wasmTable.length,
											moduleExports;
										function resolveSymbol(e) {
											var t = resolveGlobalSymbol(e).sym;
											return (
												!t && localScope && (t = localScope[e]),
												t || (t = moduleExports[e]),
												t
											);
										}
										tableGrowthNeeded > 0 && wasmTable.grow(tableGrowthNeeded);
										var proxyHandler = {
											get(e, t) {
												switch (t) {
													case "__memory_base":
														return memoryBase;
													case "__table_base":
														return tableBase;
												}
												if (t in wasmImports && !wasmImports[t].stub)
													return wasmImports[t];
												var _;
												t in e ||
													(e[t] = (...e) => (
														(_ ||= resolveSymbol(t)), _(...e)
													));
												return e[t];
											},
										},
											proxy = new Proxy({}, proxyHandler),
											info = {
												"GOT.mem": new Proxy({}, GOTHandler),
												"GOT.func": new Proxy({}, GOTHandler),
												env: proxy,
												wasi_snapshot_preview1: proxy,
											};
										function postInstantiation(module, instance) {
											function addEmAsm(addr, body) {
												for (
													var args = [], arity = 0;
													arity < 16 && -1 != body.indexOf("$" + arity);
													arity++
												)
													args.push("$" + arity);
												args = args.join(",");
												var func = `(${args}) => { ${body} };`;
												ASM_CONSTS[start] = eval(func);
											}
											if (
												(updateTableMap(tableBase, metadata.tableSize),
													(moduleExports = relocateExports(
														instance.exports,
														memoryBase
													)),
													flags.allowUndefined || reportUndefinedSymbols(),
													"__start_em_asm" in moduleExports)
											)
												for (
													var start = moduleExports.__start_em_asm,
													stop = moduleExports.__stop_em_asm;
													start < stop;

												) {
													var jsString = UTF8ToString(start);
													addEmAsm(start, jsString),
														(start = HEAPU8.indexOf(0, start) + 1);
												}
											function addEmJs(name, cSig, body) {
												var jsArgs = [];
												if (((cSig = cSig.slice(1, -1)), "void" != cSig))
													for (var i in ((cSig = cSig.split(",")), cSig)) {
														var jsArg = cSig[i].split(" ").pop();
														jsArgs.push(jsArg.replace("*", ""));
													}
												var func = `(${jsArgs}) => ${body};`;
												moduleExports[name] = eval(func);
											}
											for (var name in moduleExports)
												if (name.startsWith("__em_js__")) {
													var start = moduleExports[name],
														jsString = UTF8ToString(start),
														parts = jsString.split("<::>");
													addEmJs(
														name.replace("__em_js__", ""),
														parts[0],
														parts[1]
													),
														delete moduleExports[name];
												}
											var applyRelocs = moduleExports.__wasm_apply_data_relocs;
											applyRelocs &&
												(runtimeInitialized
													? applyRelocs()
													: __RELOC_FUNCS__.push(applyRelocs));
											var init = moduleExports.__wasm_call_ctors;
											return (
												init &&
												(runtimeInitialized ? init() : __ATINIT__.push(init)),
												moduleExports
											);
										}
										if (flags.loadAsync) {
											if (binary instanceof WebAssembly.Module) {
												var instance = new WebAssembly.Instance(binary, info);
												return Promise.resolve(
													postInstantiation(binary, instance)
												);
											}
											return WebAssembly.instantiate(binary, info).then((e) =>
												postInstantiation(e.module, e.instance)
											);
										}
										var module =
											binary instanceof WebAssembly.Module
												? binary
												: new WebAssembly.Module(binary),
											instance = new WebAssembly.Instance(module, info);
										return postInstantiation(module, instance);
									}
									return (
										(currentModuleWeakSymbols = metadata.weakImports),
										flags.loadAsync
											? metadata.neededDynlibs
												.reduce(
													(e, t) => e.then(() => loadDynamicLibrary(t, flags)),
													Promise.resolve()
												)
												.then(loadModule)
											: (metadata.neededDynlibs.forEach((e) =>
												loadDynamicLibrary(e, flags, localScope)
											),
												loadModule())
									);
								},
								mergeLibSymbols = (e, t) => {
									for (var [_, s] of Object.entries(e)) {
										const e = (e) => {
											isSymbolDefined(e) || (wasmImports[e] = s);
										};
										e(_);
										const t = "__main_argc_argv";
										"main" == _ && e(t),
											_ == t && e("main"),
											_.startsWith("dynCall_") &&
											!Module.hasOwnProperty(_) &&
											(Module[_] = s);
									}
								},
								asyncLoad = (e, t, _, s) => {
									var r = s ? "" : getUniqueRunDependency(`al ${e}`);
									readAsync(
										e,
										(e) => {
											t(new Uint8Array(e)), r && removeRunDependency(r);
										},
										(t) => {
											if (!_) throw `Loading data file "${e}" failed.`;
											_();
										}
									),
										r && addRunDependency(r);
								};
							function loadDynamicLibrary(
								e,
								t = { global: !0, nodelete: !0 },
								_,
								s
							) {
								var r = LDSO.loadedLibsByName[e];
								if (r)
									return (
										t.global
											? r.global ||
											((r.global = !0), mergeLibSymbols(r.exports, e))
											: _ && Object.assign(_, r.exports),
										t.nodelete && r.refcount !== 1 / 0 && (r.refcount = 1 / 0),
										r.refcount++,
										s && (LDSO.loadedLibsByHandle[s] = r),
										!t.loadAsync || Promise.resolve(!0)
									);
								function a() {
									if (s) {
										var _ = HEAPU32[(s + 28) >> 2],
											r = HEAPU32[(s + 32) >> 2];
										if (_ && r) {
											var a = HEAP8.slice(_, _ + r);
											return t.loadAsync ? Promise.resolve(a) : a;
										}
									}
									var o = locateFile(e);
									if (t.loadAsync)
										return new Promise(function (e, t) {
											asyncLoad(o, e, t);
										});
									if (!readBinary)
										throw new Error(
											`${o}: file not found, and synchronous loading of external files is not available`
										);
									return readBinary(o);
								}
								function o() {
									return t.loadAsync
										? a().then((r) => loadWebAssemblyModule(r, t, e, _, s))
										: loadWebAssemblyModule(a(), t, e, _, s);
								}
								function n(t) {
									r.global ? mergeLibSymbols(t, e) : _ && Object.assign(_, t),
										(r.exports = t);
								}
								return (
									((r = newDSO(e, s, "loading")).refcount = t.nodelete
										? 1 / 0
										: 1),
									(r.global = t.global),
									t.loadAsync ? o().then((e) => (n(e), !0)) : (n(o()), !0)
								);
							}
							var reportUndefinedSymbols = () => {
								for (var [e, t] of Object.entries(GOT))
									if (0 == t.value) {
										var _ = resolveGlobalSymbol(e, !0).sym;
										if (!_ && !t.required) continue;
										if ("function" == typeof _) t.value = addFunction(_, _.sig);
										else {
											if ("number" != typeof _)
												throw new Error(
													`bad export type for '${e}': ${typeof _}`
												);
											t.value = _;
										}
									}
							},
								loadDylibs = () => {
									dynamicLibraries.length
										? (addRunDependency("loadDylibs"),
											dynamicLibraries
												.reduce(
													(e, t) =>
														e.then(() =>
															loadDynamicLibrary(t, {
																loadAsync: !0,
																global: !0,
																nodelete: !0,
																allowUndefined: !0,
															})
														),
													Promise.resolve()
												)
												.then(() => {
													reportUndefinedSymbols(),
														removeRunDependency("loadDylibs");
												}))
										: reportUndefinedSymbols();
								},
								noExitRuntime = Module.noExitRuntime || !0;
							function setValue(e, t, _ = "i8") {
								switch ((_.endsWith("*") && (_ = "*"), _)) {
									case "i1":
									case "i8":
										HEAP8[e] = t;
										break;
									case "i16":
										HEAP16[e >> 1] = t;
										break;
									case "i32":
										HEAP32[e >> 2] = t;
										break;
									case "i64":
										abort("to do setValue(i64) use WASM_BIGINT");
									case "float":
										HEAPF32[e >> 2] = t;
										break;
									case "double":
										HEAPF64[e >> 3] = t;
										break;
									case "*":
										HEAPU32[e >> 2] = t;
										break;
									default:
										abort(`invalid type for setValue: ${_}`);
								}
							}
							var ___memory_base = new WebAssembly.Global(
								{ value: "i32", mutable: !1 },
								1024
							),
								___stack_pointer = new WebAssembly.Global(
									{ value: "i32", mutable: !0 },
									78096
								),
								___table_base = new WebAssembly.Global(
									{ value: "i32", mutable: !1 },
									1
								),
								nowIsMonotonic = 1,
								__emscripten_get_now_is_monotonic = () => nowIsMonotonic;
							__emscripten_get_now_is_monotonic.sig = "i";
							var _abort = () => {
								abort("");
							};
							_abort.sig = "v";
							var _emscripten_date_now = () => Date.now(),
								_emscripten_get_now;
							(_emscripten_date_now.sig = "d"),
								(_emscripten_get_now = () => performance.now()),
								(_emscripten_get_now.sig = "d");
							var _emscripten_memcpy_js = (e, t, _) =>
								HEAPU8.copyWithin(e, t, t + _);
							_emscripten_memcpy_js.sig = "vppp";
							var getHeapMax = () => 2147483648,
								growMemory = (e) => {
									var t = (e - wasmMemory.buffer.byteLength + 65535) / 65536;
									try {
										return wasmMemory.grow(t), updateMemoryViews(), 1;
									} catch (e) { }
								},
								_emscripten_resize_heap = (e) => {
									var t = HEAPU8.length;
									e >>>= 0;
									var _ = getHeapMax();
									if (e > _) return !1;
									for (var s, r, a = 1; a <= 4; a *= 2) {
										var o = t * (1 + 0.2 / a);
										o = Math.min(o, e + 100663296);
										var n = Math.min(
											_,
											(s = Math.max(e, o)) + (((r = 65536) - (s % r)) % r)
										);
										if (growMemory(n)) return !0;
									}
									return !1;
								};
							_emscripten_resize_heap.sig = "ip";
							var _fd_close = (e) => 52;
							_fd_close.sig = "ii";
							var convertI32PairToI53Checked = (e, t) =>
								(t + 2097152) >>> 0 < 4194305 - !!e
									? (e >>> 0) + 4294967296 * t
									: NaN;
							function _fd_seek(e, t, _, s, r) {
								convertI32PairToI53Checked(t, _);
								return 70;
							}
							_fd_seek.sig = "iiiiip";
							var printCharBuffers = [null, [], []],
								printChar = (e, t) => {
									var _ = printCharBuffers[e];
									0 === t || 10 === t
										? ((1 === e ? out : err)(UTF8ArrayToString(_, 0)),
											(_.length = 0))
										: _.push(t);
								},
								SYSCALLS = {
									varargs: void 0,
									get() {
										var e = HEAP32[+SYSCALLS.varargs >> 2];
										return (SYSCALLS.varargs += 4), e;
									},
									getp: () => SYSCALLS.get(),
									getStr: (e) => UTF8ToString(e),
								},
								_fd_write = (e, t, _, s) => {
									for (var r = 0, a = 0; a < _; a++) {
										var o = HEAPU32[t >> 2],
											n = HEAPU32[(t + 4) >> 2];
										t += 8;
										for (var l = 0; l < n; l++) printChar(e, HEAPU8[o + l]);
										r += n;
									}
									return (HEAPU32[s >> 2] = r), 0;
								};
							function _tree_sitter_log_callback(e, t) {
								if (currentLogCallback) {
									const _ = UTF8ToString(t);
									currentLogCallback(_, 0 !== e);
								}
							}
							function _tree_sitter_parse_callback(e, t, _, s, r) {
								const a = currentParseCallback(t, { row: _, column: s });
								"string" == typeof a
									? (setValue(r, a.length, "i32"), stringToUTF16(a, e, 10240))
									: setValue(r, 0, "i32");
							}
							_fd_write.sig = "iippp";
							var runtimeKeepaliveCounter = 0,
								keepRuntimeAlive = () =>
									noExitRuntime || runtimeKeepaliveCounter > 0,
								_proc_exit = (e) => {
									(EXITSTATUS = e),
										keepRuntimeAlive() || (Module.onExit?.(e), (ABORT = !0)),
										quit_(e, new ExitStatus(e));
								};
							_proc_exit.sig = "vi";
							var exitJS = (e, t) => {
								(EXITSTATUS = e), _proc_exit(e);
							},
								handleException = (e) => {
									if (e instanceof ExitStatus || "unwind" == e) return EXITSTATUS;
									quit_(1, e);
								},
								lengthBytesUTF8 = (e) => {
									for (var t = 0, _ = 0; _ < e.length; ++_) {
										var s = e.charCodeAt(_);
										s <= 127
											? t++
											: s <= 2047
												? (t += 2)
												: s >= 55296 && s <= 57343
													? ((t += 4), ++_)
													: (t += 3);
									}
									return t;
								},
								stringToUTF8Array = (e, t, _, s) => {
									if (!(s > 0)) return 0;
									for (var r = _, a = _ + s - 1, o = 0; o < e.length; ++o) {
										var n = e.charCodeAt(o);
										if (n >= 55296 && n <= 57343)
											n =
												(65536 + ((1023 & n) << 10)) | (1023 & e.charCodeAt(++o));
										if (n <= 127) {
											if (_ >= a) break;
											t[_++] = n;
										} else if (n <= 2047) {
											if (_ + 1 >= a) break;
											(t[_++] = 192 | (n >> 6)), (t[_++] = 128 | (63 & n));
										} else if (n <= 65535) {
											if (_ + 2 >= a) break;
											(t[_++] = 224 | (n >> 12)),
												(t[_++] = 128 | ((n >> 6) & 63)),
												(t[_++] = 128 | (63 & n));
										} else {
											if (_ + 3 >= a) break;
											(t[_++] = 240 | (n >> 18)),
												(t[_++] = 128 | ((n >> 12) & 63)),
												(t[_++] = 128 | ((n >> 6) & 63)),
												(t[_++] = 128 | (63 & n));
										}
									}
									return (t[_] = 0), _ - r;
								},
								stringToUTF8 = (e, t, _) => stringToUTF8Array(e, HEAPU8, t, _),
								stringToUTF8OnStack = (e) => {
									var t = lengthBytesUTF8(e) + 1,
										_ = stackAlloc(t);
									return stringToUTF8(e, _, t), _;
								},
								stringToUTF16 = (e, t, _) => {
									if (((_ ??= 2147483647), _ < 2)) return 0;
									for (
										var s = t,
										r = (_ -= 2) < 2 * e.length ? _ / 2 : e.length,
										a = 0;
										a < r;
										++a
									) {
										var o = e.charCodeAt(a);
										(HEAP16[t >> 1] = o), (t += 2);
									}
									return (HEAP16[t >> 1] = 0), t - s;
								},
								AsciiToString = (e) => {
									for (var t = ""; ;) {
										var _ = HEAPU8[e++];
										if (!_) return t;
										t += String.fromCharCode(_);
									}
								},
								wasmImports = {
									__heap_base: ___heap_base,
									__indirect_function_table: wasmTable,
									__memory_base: ___memory_base,
									__stack_pointer: ___stack_pointer,
									__table_base: ___table_base,
									_emscripten_get_now_is_monotonic:
										__emscripten_get_now_is_monotonic,
									abort: _abort,
									emscripten_get_now: _emscripten_get_now,
									emscripten_memcpy_js: _emscripten_memcpy_js,
									emscripten_resize_heap: _emscripten_resize_heap,
									fd_close: _fd_close,
									fd_seek: _fd_seek,
									fd_write: _fd_write,
									memory: wasmMemory,
									tree_sitter_log_callback: _tree_sitter_log_callback,
									tree_sitter_parse_callback: _tree_sitter_parse_callback,
								},
								wasmExports = createWasm(),
								___wasm_call_ctors = () =>
									(___wasm_call_ctors = wasmExports.__wasm_call_ctors)(),
								___wasm_apply_data_relocs = () =>
									(___wasm_apply_data_relocs =
										wasmExports.__wasm_apply_data_relocs)(),
								_malloc = (Module._malloc = (e) =>
									(_malloc = Module._malloc = wasmExports.malloc)(e)),
								_calloc = (Module._calloc = (e, t) =>
									(_calloc = Module._calloc = wasmExports.calloc)(e, t)),
								_realloc = (Module._realloc = (e, t) =>
									(_realloc = Module._realloc = wasmExports.realloc)(e, t)),
								_free = (Module._free = (e) =>
									(_free = Module._free = wasmExports.free)(e)),
								_ts_language_symbol_count = (Module._ts_language_symbol_count = (
									e
								) =>
									(_ts_language_symbol_count = Module._ts_language_symbol_count =
										wasmExports.ts_language_symbol_count)(e)),
								_ts_language_state_count = (Module._ts_language_state_count = (
									e
								) =>
									(_ts_language_state_count = Module._ts_language_state_count =
										wasmExports.ts_language_state_count)(e)),
								_ts_language_version = (Module._ts_language_version = (e) =>
									(_ts_language_version = Module._ts_language_version =
										wasmExports.ts_language_version)(e)),
								_ts_language_field_count = (Module._ts_language_field_count = (
									e
								) =>
									(_ts_language_field_count = Module._ts_language_field_count =
										wasmExports.ts_language_field_count)(e)),
								_ts_language_next_state = (Module._ts_language_next_state = (
									e,
									t,
									_
								) =>
									(_ts_language_next_state = Module._ts_language_next_state =
										wasmExports.ts_language_next_state)(e, t, _)),
								_ts_language_symbol_name = (Module._ts_language_symbol_name = (
									e,
									t
								) =>
									(_ts_language_symbol_name = Module._ts_language_symbol_name =
										wasmExports.ts_language_symbol_name)(e, t)),
								_ts_language_symbol_for_name =
									(Module._ts_language_symbol_for_name = (e, t, _, s) =>
										(_ts_language_symbol_for_name =
											Module._ts_language_symbol_for_name =
											wasmExports.ts_language_symbol_for_name)(e, t, _, s)),
								_strncmp = (Module._strncmp = (e, t, _) =>
									(_strncmp = Module._strncmp = wasmExports.strncmp)(e, t, _)),
								_ts_language_symbol_type = (Module._ts_language_symbol_type = (
									e,
									t
								) =>
									(_ts_language_symbol_type = Module._ts_language_symbol_type =
										wasmExports.ts_language_symbol_type)(e, t)),
								_ts_language_field_name_for_id =
									(Module._ts_language_field_name_for_id = (e, t) =>
										(_ts_language_field_name_for_id =
											Module._ts_language_field_name_for_id =
											wasmExports.ts_language_field_name_for_id)(e, t)),
								_ts_lookahead_iterator_new = (Module._ts_lookahead_iterator_new =
									(e, t) =>
										(_ts_lookahead_iterator_new =
											Module._ts_lookahead_iterator_new =
											wasmExports.ts_lookahead_iterator_new)(e, t)),
								_ts_lookahead_iterator_delete =
									(Module._ts_lookahead_iterator_delete = (e) =>
										(_ts_lookahead_iterator_delete =
											Module._ts_lookahead_iterator_delete =
											wasmExports.ts_lookahead_iterator_delete)(e)),
								_ts_lookahead_iterator_reset_state =
									(Module._ts_lookahead_iterator_reset_state = (e, t) =>
										(_ts_lookahead_iterator_reset_state =
											Module._ts_lookahead_iterator_reset_state =
											wasmExports.ts_lookahead_iterator_reset_state)(e, t)),
								_ts_lookahead_iterator_reset =
									(Module._ts_lookahead_iterator_reset = (e, t, _) =>
										(_ts_lookahead_iterator_reset =
											Module._ts_lookahead_iterator_reset =
											wasmExports.ts_lookahead_iterator_reset)(e, t, _)),
								_ts_lookahead_iterator_next =
									(Module._ts_lookahead_iterator_next = (e) =>
										(_ts_lookahead_iterator_next =
											Module._ts_lookahead_iterator_next =
											wasmExports.ts_lookahead_iterator_next)(e)),
								_ts_lookahead_iterator_current_symbol =
									(Module._ts_lookahead_iterator_current_symbol = (e) =>
										(_ts_lookahead_iterator_current_symbol =
											Module._ts_lookahead_iterator_current_symbol =
											wasmExports.ts_lookahead_iterator_current_symbol)(e)),
								_memset = (Module._memset = (e, t, _) =>
									(_memset = Module._memset = wasmExports.memset)(e, t, _)),
								_memcpy = (Module._memcpy = (e, t, _) =>
									(_memcpy = Module._memcpy = wasmExports.memcpy)(e, t, _)),
								_ts_parser_delete = (Module._ts_parser_delete = (e) =>
									(_ts_parser_delete = Module._ts_parser_delete =
										wasmExports.ts_parser_delete)(e)),
								_ts_parser_reset = (Module._ts_parser_reset = (e) =>
									(_ts_parser_reset = Module._ts_parser_reset =
										wasmExports.ts_parser_reset)(e)),
								_ts_parser_set_language = (Module._ts_parser_set_language = (
									e,
									t
								) =>
									(_ts_parser_set_language = Module._ts_parser_set_language =
										wasmExports.ts_parser_set_language)(e, t)),
								_ts_parser_timeout_micros = (Module._ts_parser_timeout_micros = (
									e
								) =>
									(_ts_parser_timeout_micros = Module._ts_parser_timeout_micros =
										wasmExports.ts_parser_timeout_micros)(e)),
								_ts_parser_set_timeout_micros =
									(Module._ts_parser_set_timeout_micros = (e, t, _) =>
										(_ts_parser_set_timeout_micros =
											Module._ts_parser_set_timeout_micros =
											wasmExports.ts_parser_set_timeout_micros)(e, t, _)),
								_ts_parser_set_included_ranges =
									(Module._ts_parser_set_included_ranges = (e, t, _) =>
										(_ts_parser_set_included_ranges =
											Module._ts_parser_set_included_ranges =
											wasmExports.ts_parser_set_included_ranges)(e, t, _)),
								_memmove = (Module._memmove = (e, t, _) =>
									(_memmove = Module._memmove = wasmExports.memmove)(e, t, _)),
								_memcmp = (Module._memcmp = (e, t, _) =>
									(_memcmp = Module._memcmp = wasmExports.memcmp)(e, t, _)),
								_ts_query_new = (Module._ts_query_new = (e, t, _, s, r) =>
									(_ts_query_new = Module._ts_query_new =
										wasmExports.ts_query_new)(e, t, _, s, r)),
								_ts_query_delete = (Module._ts_query_delete = (e) =>
									(_ts_query_delete = Module._ts_query_delete =
										wasmExports.ts_query_delete)(e)),
								_iswspace = (Module._iswspace = (e) =>
									(_iswspace = Module._iswspace = wasmExports.iswspace)(e)),
								_iswalnum = (Module._iswalnum = (e) =>
									(_iswalnum = Module._iswalnum = wasmExports.iswalnum)(e)),
								_ts_query_pattern_count = (Module._ts_query_pattern_count = (e) =>
									(_ts_query_pattern_count = Module._ts_query_pattern_count =
										wasmExports.ts_query_pattern_count)(e)),
								_ts_query_capture_count = (Module._ts_query_capture_count = (e) =>
									(_ts_query_capture_count = Module._ts_query_capture_count =
										wasmExports.ts_query_capture_count)(e)),
								_ts_query_string_count = (Module._ts_query_string_count = (e) =>
									(_ts_query_string_count = Module._ts_query_string_count =
										wasmExports.ts_query_string_count)(e)),
								_ts_query_capture_name_for_id =
									(Module._ts_query_capture_name_for_id = (e, t, _) =>
										(_ts_query_capture_name_for_id =
											Module._ts_query_capture_name_for_id =
											wasmExports.ts_query_capture_name_for_id)(e, t, _)),
								_ts_query_string_value_for_id =
									(Module._ts_query_string_value_for_id = (e, t, _) =>
										(_ts_query_string_value_for_id =
											Module._ts_query_string_value_for_id =
											wasmExports.ts_query_string_value_for_id)(e, t, _)),
								_ts_query_predicates_for_pattern =
									(Module._ts_query_predicates_for_pattern = (e, t, _) =>
										(_ts_query_predicates_for_pattern =
											Module._ts_query_predicates_for_pattern =
											wasmExports.ts_query_predicates_for_pattern)(e, t, _)),
								_ts_query_disable_capture = (Module._ts_query_disable_capture = (
									e,
									t,
									_
								) =>
									(_ts_query_disable_capture = Module._ts_query_disable_capture =
										wasmExports.ts_query_disable_capture)(e, t, _)),
								_ts_tree_copy = (Module._ts_tree_copy = (e) =>
									(_ts_tree_copy = Module._ts_tree_copy =
										wasmExports.ts_tree_copy)(e)),
								_ts_tree_delete = (Module._ts_tree_delete = (e) =>
									(_ts_tree_delete = Module._ts_tree_delete =
										wasmExports.ts_tree_delete)(e)),
								_ts_init = (Module._ts_init = () =>
									(_ts_init = Module._ts_init = wasmExports.ts_init)()),
								_ts_parser_new_wasm = (Module._ts_parser_new_wasm = () =>
									(_ts_parser_new_wasm = Module._ts_parser_new_wasm =
										wasmExports.ts_parser_new_wasm)()),
								_ts_parser_enable_logger_wasm =
									(Module._ts_parser_enable_logger_wasm = (e, t) =>
										(_ts_parser_enable_logger_wasm =
											Module._ts_parser_enable_logger_wasm =
											wasmExports.ts_parser_enable_logger_wasm)(e, t)),
								_ts_parser_parse_wasm = (Module._ts_parser_parse_wasm = (
									e,
									t,
									_,
									s,
									r
								) =>
									(_ts_parser_parse_wasm = Module._ts_parser_parse_wasm =
										wasmExports.ts_parser_parse_wasm)(e, t, _, s, r)),
								_ts_parser_included_ranges_wasm =
									(Module._ts_parser_included_ranges_wasm = (e) =>
										(_ts_parser_included_ranges_wasm =
											Module._ts_parser_included_ranges_wasm =
											wasmExports.ts_parser_included_ranges_wasm)(e)),
								_ts_language_type_is_named_wasm =
									(Module._ts_language_type_is_named_wasm = (e, t) =>
										(_ts_language_type_is_named_wasm =
											Module._ts_language_type_is_named_wasm =
											wasmExports.ts_language_type_is_named_wasm)(e, t)),
								_ts_language_type_is_visible_wasm =
									(Module._ts_language_type_is_visible_wasm = (e, t) =>
										(_ts_language_type_is_visible_wasm =
											Module._ts_language_type_is_visible_wasm =
											wasmExports.ts_language_type_is_visible_wasm)(e, t)),
								_ts_tree_root_node_wasm = (Module._ts_tree_root_node_wasm = (e) =>
									(_ts_tree_root_node_wasm = Module._ts_tree_root_node_wasm =
										wasmExports.ts_tree_root_node_wasm)(e)),
								_ts_tree_root_node_with_offset_wasm =
									(Module._ts_tree_root_node_with_offset_wasm = (e) =>
										(_ts_tree_root_node_with_offset_wasm =
											Module._ts_tree_root_node_with_offset_wasm =
											wasmExports.ts_tree_root_node_with_offset_wasm)(e)),
								_ts_tree_edit_wasm = (Module._ts_tree_edit_wasm = (e) =>
									(_ts_tree_edit_wasm = Module._ts_tree_edit_wasm =
										wasmExports.ts_tree_edit_wasm)(e)),
								_ts_tree_included_ranges_wasm =
									(Module._ts_tree_included_ranges_wasm = (e) =>
										(_ts_tree_included_ranges_wasm =
											Module._ts_tree_included_ranges_wasm =
											wasmExports.ts_tree_included_ranges_wasm)(e)),
								_ts_tree_get_changed_ranges_wasm =
									(Module._ts_tree_get_changed_ranges_wasm = (e, t) =>
										(_ts_tree_get_changed_ranges_wasm =
											Module._ts_tree_get_changed_ranges_wasm =
											wasmExports.ts_tree_get_changed_ranges_wasm)(e, t)),
								_ts_tree_cursor_new_wasm = (Module._ts_tree_cursor_new_wasm = (
									e
								) =>
									(_ts_tree_cursor_new_wasm = Module._ts_tree_cursor_new_wasm =
										wasmExports.ts_tree_cursor_new_wasm)(e)),
								_ts_tree_cursor_delete_wasm =
									(Module._ts_tree_cursor_delete_wasm = (e) =>
										(_ts_tree_cursor_delete_wasm =
											Module._ts_tree_cursor_delete_wasm =
											wasmExports.ts_tree_cursor_delete_wasm)(e)),
								_ts_tree_cursor_reset_wasm = (Module._ts_tree_cursor_reset_wasm =
									(e) =>
										(_ts_tree_cursor_reset_wasm =
											Module._ts_tree_cursor_reset_wasm =
											wasmExports.ts_tree_cursor_reset_wasm)(e)),
								_ts_tree_cursor_reset_to_wasm =
									(Module._ts_tree_cursor_reset_to_wasm = (e, t) =>
										(_ts_tree_cursor_reset_to_wasm =
											Module._ts_tree_cursor_reset_to_wasm =
											wasmExports.ts_tree_cursor_reset_to_wasm)(e, t)),
								_ts_tree_cursor_goto_first_child_wasm =
									(Module._ts_tree_cursor_goto_first_child_wasm = (e) =>
										(_ts_tree_cursor_goto_first_child_wasm =
											Module._ts_tree_cursor_goto_first_child_wasm =
											wasmExports.ts_tree_cursor_goto_first_child_wasm)(e)),
								_ts_tree_cursor_goto_last_child_wasm =
									(Module._ts_tree_cursor_goto_last_child_wasm = (e) =>
										(_ts_tree_cursor_goto_last_child_wasm =
											Module._ts_tree_cursor_goto_last_child_wasm =
											wasmExports.ts_tree_cursor_goto_last_child_wasm)(e)),
								_ts_tree_cursor_goto_first_child_for_index_wasm =
									(Module._ts_tree_cursor_goto_first_child_for_index_wasm = (e) =>
										(_ts_tree_cursor_goto_first_child_for_index_wasm =
											Module._ts_tree_cursor_goto_first_child_for_index_wasm =
											wasmExports.ts_tree_cursor_goto_first_child_for_index_wasm)(
												e
											)),
								_ts_tree_cursor_goto_first_child_for_position_wasm =
									(Module._ts_tree_cursor_goto_first_child_for_position_wasm = (
										e
									) =>
										(_ts_tree_cursor_goto_first_child_for_position_wasm =
											Module._ts_tree_cursor_goto_first_child_for_position_wasm =
											wasmExports.ts_tree_cursor_goto_first_child_for_position_wasm)(
												e
											)),
								_ts_tree_cursor_goto_next_sibling_wasm =
									(Module._ts_tree_cursor_goto_next_sibling_wasm = (e) =>
										(_ts_tree_cursor_goto_next_sibling_wasm =
											Module._ts_tree_cursor_goto_next_sibling_wasm =
											wasmExports.ts_tree_cursor_goto_next_sibling_wasm)(e)),
								_ts_tree_cursor_goto_previous_sibling_wasm =
									(Module._ts_tree_cursor_goto_previous_sibling_wasm = (e) =>
										(_ts_tree_cursor_goto_previous_sibling_wasm =
											Module._ts_tree_cursor_goto_previous_sibling_wasm =
											wasmExports.ts_tree_cursor_goto_previous_sibling_wasm)(
												e
											)),
								_ts_tree_cursor_goto_descendant_wasm =
									(Module._ts_tree_cursor_goto_descendant_wasm = (e, t) =>
										(_ts_tree_cursor_goto_descendant_wasm =
											Module._ts_tree_cursor_goto_descendant_wasm =
											wasmExports.ts_tree_cursor_goto_descendant_wasm)(e, t)),
								_ts_tree_cursor_goto_parent_wasm =
									(Module._ts_tree_cursor_goto_parent_wasm = (e) =>
										(_ts_tree_cursor_goto_parent_wasm =
											Module._ts_tree_cursor_goto_parent_wasm =
											wasmExports.ts_tree_cursor_goto_parent_wasm)(e)),
								_ts_tree_cursor_current_node_type_id_wasm =
									(Module._ts_tree_cursor_current_node_type_id_wasm = (e) =>
										(_ts_tree_cursor_current_node_type_id_wasm =
											Module._ts_tree_cursor_current_node_type_id_wasm =
											wasmExports.ts_tree_cursor_current_node_type_id_wasm)(e)),
								_ts_tree_cursor_current_node_state_id_wasm =
									(Module._ts_tree_cursor_current_node_state_id_wasm = (e) =>
										(_ts_tree_cursor_current_node_state_id_wasm =
											Module._ts_tree_cursor_current_node_state_id_wasm =
											wasmExports.ts_tree_cursor_current_node_state_id_wasm)(
												e
											)),
								_ts_tree_cursor_current_node_is_named_wasm =
									(Module._ts_tree_cursor_current_node_is_named_wasm = (e) =>
										(_ts_tree_cursor_current_node_is_named_wasm =
											Module._ts_tree_cursor_current_node_is_named_wasm =
											wasmExports.ts_tree_cursor_current_node_is_named_wasm)(
												e
											)),
								_ts_tree_cursor_current_node_is_missing_wasm =
									(Module._ts_tree_cursor_current_node_is_missing_wasm = (e) =>
										(_ts_tree_cursor_current_node_is_missing_wasm =
											Module._ts_tree_cursor_current_node_is_missing_wasm =
											wasmExports.ts_tree_cursor_current_node_is_missing_wasm)(
												e
											)),
								_ts_tree_cursor_current_node_id_wasm =
									(Module._ts_tree_cursor_current_node_id_wasm = (e) =>
										(_ts_tree_cursor_current_node_id_wasm =
											Module._ts_tree_cursor_current_node_id_wasm =
											wasmExports.ts_tree_cursor_current_node_id_wasm)(e)),
								_ts_tree_cursor_start_position_wasm =
									(Module._ts_tree_cursor_start_position_wasm = (e) =>
										(_ts_tree_cursor_start_position_wasm =
											Module._ts_tree_cursor_start_position_wasm =
											wasmExports.ts_tree_cursor_start_position_wasm)(e)),
								_ts_tree_cursor_end_position_wasm =
									(Module._ts_tree_cursor_end_position_wasm = (e) =>
										(_ts_tree_cursor_end_position_wasm =
											Module._ts_tree_cursor_end_position_wasm =
											wasmExports.ts_tree_cursor_end_position_wasm)(e)),
								_ts_tree_cursor_start_index_wasm =
									(Module._ts_tree_cursor_start_index_wasm = (e) =>
										(_ts_tree_cursor_start_index_wasm =
											Module._ts_tree_cursor_start_index_wasm =
											wasmExports.ts_tree_cursor_start_index_wasm)(e)),
								_ts_tree_cursor_end_index_wasm =
									(Module._ts_tree_cursor_end_index_wasm = (e) =>
										(_ts_tree_cursor_end_index_wasm =
											Module._ts_tree_cursor_end_index_wasm =
											wasmExports.ts_tree_cursor_end_index_wasm)(e)),
								_ts_tree_cursor_current_field_id_wasm =
									(Module._ts_tree_cursor_current_field_id_wasm = (e) =>
										(_ts_tree_cursor_current_field_id_wasm =
											Module._ts_tree_cursor_current_field_id_wasm =
											wasmExports.ts_tree_cursor_current_field_id_wasm)(e)),
								_ts_tree_cursor_current_depth_wasm =
									(Module._ts_tree_cursor_current_depth_wasm = (e) =>
										(_ts_tree_cursor_current_depth_wasm =
											Module._ts_tree_cursor_current_depth_wasm =
											wasmExports.ts_tree_cursor_current_depth_wasm)(e)),
								_ts_tree_cursor_current_descendant_index_wasm =
									(Module._ts_tree_cursor_current_descendant_index_wasm = (e) =>
										(_ts_tree_cursor_current_descendant_index_wasm =
											Module._ts_tree_cursor_current_descendant_index_wasm =
											wasmExports.ts_tree_cursor_current_descendant_index_wasm)(
												e
											)),
								_ts_tree_cursor_current_node_wasm =
									(Module._ts_tree_cursor_current_node_wasm = (e) =>
										(_ts_tree_cursor_current_node_wasm =
											Module._ts_tree_cursor_current_node_wasm =
											wasmExports.ts_tree_cursor_current_node_wasm)(e)),
								_ts_node_symbol_wasm = (Module._ts_node_symbol_wasm = (e) =>
									(_ts_node_symbol_wasm = Module._ts_node_symbol_wasm =
										wasmExports.ts_node_symbol_wasm)(e)),
								_ts_node_field_name_for_child_wasm =
									(Module._ts_node_field_name_for_child_wasm = (e, t) =>
										(_ts_node_field_name_for_child_wasm =
											Module._ts_node_field_name_for_child_wasm =
											wasmExports.ts_node_field_name_for_child_wasm)(e, t)),
								_ts_node_children_by_field_id_wasm =
									(Module._ts_node_children_by_field_id_wasm = (e, t) =>
										(_ts_node_children_by_field_id_wasm =
											Module._ts_node_children_by_field_id_wasm =
											wasmExports.ts_node_children_by_field_id_wasm)(e, t)),
								_ts_node_first_child_for_byte_wasm =
									(Module._ts_node_first_child_for_byte_wasm = (e) =>
										(_ts_node_first_child_for_byte_wasm =
											Module._ts_node_first_child_for_byte_wasm =
											wasmExports.ts_node_first_child_for_byte_wasm)(e)),
								_ts_node_first_named_child_for_byte_wasm =
									(Module._ts_node_first_named_child_for_byte_wasm = (e) =>
										(_ts_node_first_named_child_for_byte_wasm =
											Module._ts_node_first_named_child_for_byte_wasm =
											wasmExports.ts_node_first_named_child_for_byte_wasm)(e)),
								_ts_node_grammar_symbol_wasm =
									(Module._ts_node_grammar_symbol_wasm = (e) =>
										(_ts_node_grammar_symbol_wasm =
											Module._ts_node_grammar_symbol_wasm =
											wasmExports.ts_node_grammar_symbol_wasm)(e)),
								_ts_node_child_count_wasm = (Module._ts_node_child_count_wasm = (
									e
								) =>
									(_ts_node_child_count_wasm = Module._ts_node_child_count_wasm =
										wasmExports.ts_node_child_count_wasm)(e)),
								_ts_node_named_child_count_wasm =
									(Module._ts_node_named_child_count_wasm = (e) =>
										(_ts_node_named_child_count_wasm =
											Module._ts_node_named_child_count_wasm =
											wasmExports.ts_node_named_child_count_wasm)(e)),
								_ts_node_child_wasm = (Module._ts_node_child_wasm = (e, t) =>
									(_ts_node_child_wasm = Module._ts_node_child_wasm =
										wasmExports.ts_node_child_wasm)(e, t)),
								_ts_node_named_child_wasm = (Module._ts_node_named_child_wasm = (
									e,
									t
								) =>
									(_ts_node_named_child_wasm = Module._ts_node_named_child_wasm =
										wasmExports.ts_node_named_child_wasm)(e, t)),
								_ts_node_child_by_field_id_wasm =
									(Module._ts_node_child_by_field_id_wasm = (e, t) =>
										(_ts_node_child_by_field_id_wasm =
											Module._ts_node_child_by_field_id_wasm =
											wasmExports.ts_node_child_by_field_id_wasm)(e, t)),
								_ts_node_next_sibling_wasm = (Module._ts_node_next_sibling_wasm =
									(e) =>
										(_ts_node_next_sibling_wasm =
											Module._ts_node_next_sibling_wasm =
											wasmExports.ts_node_next_sibling_wasm)(e)),
								_ts_node_prev_sibling_wasm = (Module._ts_node_prev_sibling_wasm =
									(e) =>
										(_ts_node_prev_sibling_wasm =
											Module._ts_node_prev_sibling_wasm =
											wasmExports.ts_node_prev_sibling_wasm)(e)),
								_ts_node_next_named_sibling_wasm =
									(Module._ts_node_next_named_sibling_wasm = (e) =>
										(_ts_node_next_named_sibling_wasm =
											Module._ts_node_next_named_sibling_wasm =
											wasmExports.ts_node_next_named_sibling_wasm)(e)),
								_ts_node_prev_named_sibling_wasm =
									(Module._ts_node_prev_named_sibling_wasm = (e) =>
										(_ts_node_prev_named_sibling_wasm =
											Module._ts_node_prev_named_sibling_wasm =
											wasmExports.ts_node_prev_named_sibling_wasm)(e)),
								_ts_node_descendant_count_wasm =
									(Module._ts_node_descendant_count_wasm = (e) =>
										(_ts_node_descendant_count_wasm =
											Module._ts_node_descendant_count_wasm =
											wasmExports.ts_node_descendant_count_wasm)(e)),
								_ts_node_parent_wasm = (Module._ts_node_parent_wasm = (e) =>
									(_ts_node_parent_wasm = Module._ts_node_parent_wasm =
										wasmExports.ts_node_parent_wasm)(e)),
								_ts_node_descendant_for_index_wasm =
									(Module._ts_node_descendant_for_index_wasm = (e) =>
										(_ts_node_descendant_for_index_wasm =
											Module._ts_node_descendant_for_index_wasm =
											wasmExports.ts_node_descendant_for_index_wasm)(e)),
								_ts_node_named_descendant_for_index_wasm =
									(Module._ts_node_named_descendant_for_index_wasm = (e) =>
										(_ts_node_named_descendant_for_index_wasm =
											Module._ts_node_named_descendant_for_index_wasm =
											wasmExports.ts_node_named_descendant_for_index_wasm)(e)),
								_ts_node_descendant_for_position_wasm =
									(Module._ts_node_descendant_for_position_wasm = (e) =>
										(_ts_node_descendant_for_position_wasm =
											Module._ts_node_descendant_for_position_wasm =
											wasmExports.ts_node_descendant_for_position_wasm)(e)),
								_ts_node_named_descendant_for_position_wasm =
									(Module._ts_node_named_descendant_for_position_wasm = (e) =>
										(_ts_node_named_descendant_for_position_wasm =
											Module._ts_node_named_descendant_for_position_wasm =
											wasmExports.ts_node_named_descendant_for_position_wasm)(
												e
											)),
								_ts_node_start_point_wasm = (Module._ts_node_start_point_wasm = (
									e
								) =>
									(_ts_node_start_point_wasm = Module._ts_node_start_point_wasm =
										wasmExports.ts_node_start_point_wasm)(e)),
								_ts_node_end_point_wasm = (Module._ts_node_end_point_wasm = (e) =>
									(_ts_node_end_point_wasm = Module._ts_node_end_point_wasm =
										wasmExports.ts_node_end_point_wasm)(e)),
								_ts_node_start_index_wasm = (Module._ts_node_start_index_wasm = (
									e
								) =>
									(_ts_node_start_index_wasm = Module._ts_node_start_index_wasm =
										wasmExports.ts_node_start_index_wasm)(e)),
								_ts_node_end_index_wasm = (Module._ts_node_end_index_wasm = (e) =>
									(_ts_node_end_index_wasm = Module._ts_node_end_index_wasm =
										wasmExports.ts_node_end_index_wasm)(e)),
								_ts_node_to_string_wasm = (Module._ts_node_to_string_wasm = (e) =>
									(_ts_node_to_string_wasm = Module._ts_node_to_string_wasm =
										wasmExports.ts_node_to_string_wasm)(e)),
								_ts_node_children_wasm = (Module._ts_node_children_wasm = (e) =>
									(_ts_node_children_wasm = Module._ts_node_children_wasm =
										wasmExports.ts_node_children_wasm)(e)),
								_ts_node_named_children_wasm =
									(Module._ts_node_named_children_wasm = (e) =>
										(_ts_node_named_children_wasm =
											Module._ts_node_named_children_wasm =
											wasmExports.ts_node_named_children_wasm)(e)),
								_ts_node_descendants_of_type_wasm =
									(Module._ts_node_descendants_of_type_wasm = (
										e,
										t,
										_,
										s,
										r,
										a,
										o
									) =>
										(_ts_node_descendants_of_type_wasm =
											Module._ts_node_descendants_of_type_wasm =
											wasmExports.ts_node_descendants_of_type_wasm)(
												e,
												t,
												_,
												s,
												r,
												a,
												o
											)),
								_ts_node_is_named_wasm = (Module._ts_node_is_named_wasm = (e) =>
									(_ts_node_is_named_wasm = Module._ts_node_is_named_wasm =
										wasmExports.ts_node_is_named_wasm)(e)),
								_ts_node_has_changes_wasm = (Module._ts_node_has_changes_wasm = (
									e
								) =>
									(_ts_node_has_changes_wasm = Module._ts_node_has_changes_wasm =
										wasmExports.ts_node_has_changes_wasm)(e)),
								_ts_node_has_error_wasm = (Module._ts_node_has_error_wasm = (e) =>
									(_ts_node_has_error_wasm = Module._ts_node_has_error_wasm =
										wasmExports.ts_node_has_error_wasm)(e)),
								_ts_node_is_error_wasm = (Module._ts_node_is_error_wasm = (e) =>
									(_ts_node_is_error_wasm = Module._ts_node_is_error_wasm =
										wasmExports.ts_node_is_error_wasm)(e)),
								_ts_node_is_missing_wasm = (Module._ts_node_is_missing_wasm = (
									e
								) =>
									(_ts_node_is_missing_wasm = Module._ts_node_is_missing_wasm =
										wasmExports.ts_node_is_missing_wasm)(e)),
								_ts_node_is_extra_wasm = (Module._ts_node_is_extra_wasm = (e) =>
									(_ts_node_is_extra_wasm = Module._ts_node_is_extra_wasm =
										wasmExports.ts_node_is_extra_wasm)(e)),
								_ts_node_parse_state_wasm = (Module._ts_node_parse_state_wasm = (
									e
								) =>
									(_ts_node_parse_state_wasm = Module._ts_node_parse_state_wasm =
										wasmExports.ts_node_parse_state_wasm)(e)),
								_ts_node_next_parse_state_wasm =
									(Module._ts_node_next_parse_state_wasm = (e) =>
										(_ts_node_next_parse_state_wasm =
											Module._ts_node_next_parse_state_wasm =
											wasmExports.ts_node_next_parse_state_wasm)(e)),
								_ts_query_matches_wasm = (Module._ts_query_matches_wasm = (
									e,
									t,
									_,
									s,
									r,
									a,
									o,
									n,
									l,
									d
								) =>
									(_ts_query_matches_wasm = Module._ts_query_matches_wasm =
										wasmExports.ts_query_matches_wasm)(
											e,
											t,
											_,
											s,
											r,
											a,
											o,
											n,
											l,
											d
										)),
								_ts_query_captures_wasm = (Module._ts_query_captures_wasm = (
									e,
									t,
									_,
									s,
									r,
									a,
									o,
									n,
									l,
									d
								) =>
									(_ts_query_captures_wasm = Module._ts_query_captures_wasm =
										wasmExports.ts_query_captures_wasm)(
											e,
											t,
											_,
											s,
											r,
											a,
											o,
											n,
											l,
											d
										)),
								_iswalpha = (Module._iswalpha = (e) =>
									(_iswalpha = Module._iswalpha = wasmExports.iswalpha)(e)),
								_iswblank = (Module._iswblank = (e) =>
									(_iswblank = Module._iswblank = wasmExports.iswblank)(e)),
								_iswdigit = (Module._iswdigit = (e) =>
									(_iswdigit = Module._iswdigit = wasmExports.iswdigit)(e)),
								_iswlower = (Module._iswlower = (e) =>
									(_iswlower = Module._iswlower = wasmExports.iswlower)(e)),
								_iswupper = (Module._iswupper = (e) =>
									(_iswupper = Module._iswupper = wasmExports.iswupper)(e)),
								_iswxdigit = (Module._iswxdigit = (e) =>
									(_iswxdigit = Module._iswxdigit = wasmExports.iswxdigit)(e)),
								_memchr = (Module._memchr = (e, t, _) =>
									(_memchr = Module._memchr = wasmExports.memchr)(e, t, _)),
								_strlen = (Module._strlen = (e) =>
									(_strlen = Module._strlen = wasmExports.strlen)(e)),
								_strcmp = (Module._strcmp = (e, t) =>
									(_strcmp = Module._strcmp = wasmExports.strcmp)(e, t)),
								_strncat = (Module._strncat = (e, t, _) =>
									(_strncat = Module._strncat = wasmExports.strncat)(e, t, _)),
								_strncpy = (Module._strncpy = (e, t, _) =>
									(_strncpy = Module._strncpy = wasmExports.strncpy)(e, t, _)),
								_towlower = (Module._towlower = (e) =>
									(_towlower = Module._towlower = wasmExports.towlower)(e)),
								_towupper = (Module._towupper = (e) =>
									(_towupper = Module._towupper = wasmExports.towupper)(e)),
								_setThrew = (e, t) => (_setThrew = wasmExports.setThrew)(e, t),
								stackSave = () => (stackSave = wasmExports.stackSave)(),
								stackRestore = (e) =>
									(stackRestore = wasmExports.stackRestore)(e),
								stackAlloc = (e) => (stackAlloc = wasmExports.stackAlloc)(e),
								dynCall_jiji = (Module.dynCall_jiji = (e, t, _, s, r) =>
									(dynCall_jiji = Module.dynCall_jiji = wasmExports.dynCall_jiji)(
										e,
										t,
										_,
										s,
										r
									)),
								_orig$ts_parser_timeout_micros =
									(Module._orig$ts_parser_timeout_micros = (e) =>
										(_orig$ts_parser_timeout_micros =
											Module._orig$ts_parser_timeout_micros =
											wasmExports.orig$ts_parser_timeout_micros)(e)),
								_orig$ts_parser_set_timeout_micros =
									(Module._orig$ts_parser_set_timeout_micros = (e, t) =>
										(_orig$ts_parser_set_timeout_micros =
											Module._orig$ts_parser_set_timeout_micros =
											wasmExports.orig$ts_parser_set_timeout_micros)(e, t)),
								calledRun;
							function callMain(e = []) {
								var t = resolveGlobalSymbol("main").sym;
								if (t) {
									e.unshift(thisProgram);
									var _ = e.length,
										s = stackAlloc(4 * (_ + 1)),
										r = s;
									e.forEach((e) => {
										(HEAPU32[r >> 2] = stringToUTF8OnStack(e)), (r += 4);
									}),
										(HEAPU32[r >> 2] = 0);
									try {
										var a = t(_, s);
										return exitJS(a, !0), a;
									} catch (e) {
										return handleException(e);
									}
								}
							}
							function run(e = arguments_) {
								function t() {
									calledRun ||
										((calledRun = !0),
											(Module.calledRun = !0),
											ABORT ||
											(initRuntime(),
												preMain(),
												Module.onRuntimeInitialized &&
												Module.onRuntimeInitialized(),
												shouldRunNow && callMain(e),
												postRun()));
								}
								runDependencies > 0 ||
									(preRun(),
										runDependencies > 0 ||
										(Module.setStatus
											? (Module.setStatus("Running..."),
												setTimeout(function () {
													setTimeout(function () {
														Module.setStatus("");
													}, 1),
														t();
												}, 1))
											: t()));
							}
							if (
								((Module.AsciiToString = AsciiToString),
									(Module.stringToUTF16 = stringToUTF16),
									(dependenciesFulfilled = function e() {
										calledRun || run(), calledRun || (dependenciesFulfilled = e);
									}),
									Module.preInit)
							)
								for (
									"function" == typeof Module.preInit &&
									(Module.preInit = [Module.preInit]);
									Module.preInit.length > 0;

								)
									Module.preInit.pop()();
							var shouldRunNow = !0;
							Module.noInitialRun && (shouldRunNow = !1), run();
							const C = Module,
								INTERNAL = {},
								SIZE_OF_INT = 4,
								SIZE_OF_CURSOR = 4 * SIZE_OF_INT,
								SIZE_OF_NODE = 5 * SIZE_OF_INT,
								SIZE_OF_POINT = 2 * SIZE_OF_INT,
								SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT,
								ZERO_POINT = { row: 0, column: 0 },
								QUERY_WORD_REGEX = /[\w-.]*/g,
								PREDICATE_STEP_TYPE_CAPTURE = 1,
								PREDICATE_STEP_TYPE_STRING = 2,
								LANGUAGE_FUNCTION_REGEX = /^_?tree_sitter_\w+/;
							let VERSION,
								MIN_COMPATIBLE_VERSION,
								TRANSFER_BUFFER,
								currentParseCallback,
								currentLogCallback;
							class ParserImpl {
								static init() {
									(TRANSFER_BUFFER = C._ts_init()),
										(VERSION = getValue(TRANSFER_BUFFER, "i32")),
										(MIN_COMPATIBLE_VERSION = getValue(
											TRANSFER_BUFFER + SIZE_OF_INT,
											"i32"
										));
								}
								initialize() {
									C._ts_parser_new_wasm(),
										(this[0] = getValue(TRANSFER_BUFFER, "i32")),
										(this[1] = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"));
								}
								delete() {
									C._ts_parser_delete(this[0]),
										C._free(this[1]),
										(this[0] = 0),
										(this[1] = 0);
								}
								setLanguage(e) {
									let t;
									if (e) {
										if (e.constructor !== Language)
											throw new Error("Argument must be a Language");
										{
											t = e[0];
											const _ = C._ts_language_version(t);
											if (_ < MIN_COMPATIBLE_VERSION || VERSION < _)
												throw new Error(
													`Incompatible language version ${_}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${VERSION}.`
												);
										}
									} else (t = 0), (e = null);
									return (
										(this.language = e),
										C._ts_parser_set_language(this[0], t),
										this
									);
								}
								getLanguage() {
									return this.language;
								}
								parse(e, t, _) {
									if ("string" == typeof e)
										currentParseCallback = (t, _) => e.slice(t);
									else {
										if ("function" != typeof e)
											throw new Error("Argument must be a string or a function");
										currentParseCallback = e;
									}
									this.logCallback
										? ((currentLogCallback = this.logCallback),
											C._ts_parser_enable_logger_wasm(this[0], 1))
										: ((currentLogCallback = null),
											C._ts_parser_enable_logger_wasm(this[0], 0));
									let s = 0,
										r = 0;
									if (_?.includedRanges) {
										(s = _.includedRanges.length),
											(r = C._calloc(s, SIZE_OF_RANGE));
										let e = r;
										for (let t = 0; t < s; t++)
											marshalRange(e, _.includedRanges[t]), (e += SIZE_OF_RANGE);
									}
									const a = C._ts_parser_parse_wasm(
										this[0],
										this[1],
										t ? t[0] : 0,
										r,
										s
									);
									if (!a)
										throw (
											((currentParseCallback = null),
												(currentLogCallback = null),
												new Error("Parsing failed"))
										);
									const o = new Tree(
										INTERNAL,
										a,
										this.language,
										currentParseCallback
									);
									return (
										(currentParseCallback = null), (currentLogCallback = null), o
									);
								}
								reset() {
									C._ts_parser_reset(this[0]);
								}
								getIncludedRanges() {
									C._ts_parser_included_ranges_wasm(this[0]);
									const e = getValue(TRANSFER_BUFFER, "i32"),
										t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										_ = new Array(e);
									if (e > 0) {
										let s = t;
										for (let t = 0; t < e; t++)
											(_[t] = unmarshalRange(s)), (s += SIZE_OF_RANGE);
										C._free(t);
									}
									return _;
								}
								getTimeoutMicros() {
									return C._ts_parser_timeout_micros(this[0]);
								}
								setTimeoutMicros(e) {
									C._ts_parser_set_timeout_micros(this[0], e);
								}
								setLogger(e) {
									if (e) {
										if ("function" != typeof e)
											throw new Error("Logger callback must be a function");
									} else e = null;
									return (this.logCallback = e), this;
								}
								getLogger() {
									return this.logCallback;
								}
							}
							class Tree {
								constructor(e, t, _, s) {
									assertInternal(e),
										(this[0] = t),
										(this.language = _),
										(this.textCallback = s);
								}
								copy() {
									const e = C._ts_tree_copy(this[0]);
									return new Tree(INTERNAL, e, this.language, this.textCallback);
								}
								delete() {
									C._ts_tree_delete(this[0]), (this[0] = 0);
								}
								edit(e) {
									marshalEdit(e), C._ts_tree_edit_wasm(this[0]);
								}
								get rootNode() {
									return C._ts_tree_root_node_wasm(this[0]), unmarshalNode(this);
								}
								rootNodeWithOffset(e, t) {
									const _ = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										setValue(_, e, "i32"),
										marshalPoint(_ + SIZE_OF_INT, t),
										C._ts_tree_root_node_with_offset_wasm(this[0]),
										unmarshalNode(this)
									);
								}
								getLanguage() {
									return this.language;
								}
								walk() {
									return this.rootNode.walk();
								}
								getChangedRanges(e) {
									if (e.constructor !== Tree)
										throw new TypeError("Argument must be a Tree");
									C._ts_tree_get_changed_ranges_wasm(this[0], e[0]);
									const t = getValue(TRANSFER_BUFFER, "i32"),
										_ = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										s = new Array(t);
									if (t > 0) {
										let e = _;
										for (let _ = 0; _ < t; _++)
											(s[_] = unmarshalRange(e)), (e += SIZE_OF_RANGE);
										C._free(_);
									}
									return s;
								}
								getIncludedRanges() {
									C._ts_tree_included_ranges_wasm(this[0]);
									const e = getValue(TRANSFER_BUFFER, "i32"),
										t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										_ = new Array(e);
									if (e > 0) {
										let s = t;
										for (let t = 0; t < e; t++)
											(_[t] = unmarshalRange(s)), (s += SIZE_OF_RANGE);
										C._free(t);
									}
									return _;
								}
							}
							class Node {
								constructor(e, t) {
									assertInternal(e), (this.tree = t);
								}
								get typeId() {
									return marshalNode(this), C._ts_node_symbol_wasm(this.tree[0]);
								}
								get grammarId() {
									return (
										marshalNode(this),
										C._ts_node_grammar_symbol_wasm(this.tree[0])
									);
								}
								get type() {
									return this.tree.language.types[this.typeId] || "ERROR";
								}
								get grammarType() {
									return this.tree.language.types[this.grammarId] || "ERROR";
								}
								get endPosition() {
									return (
										marshalNode(this),
										C._ts_node_end_point_wasm(this.tree[0]),
										unmarshalPoint(TRANSFER_BUFFER)
									);
								}
								get endIndex() {
									return (
										marshalNode(this), C._ts_node_end_index_wasm(this.tree[0])
									);
								}
								get text() {
									return getText(this.tree, this.startIndex, this.endIndex);
								}
								get parseState() {
									return (
										marshalNode(this), C._ts_node_parse_state_wasm(this.tree[0])
									);
								}
								get nextParseState() {
									return (
										marshalNode(this),
										C._ts_node_next_parse_state_wasm(this.tree[0])
									);
								}
								get isNamed() {
									return (
										marshalNode(this),
										1 === C._ts_node_is_named_wasm(this.tree[0])
									);
								}
								get hasError() {
									return (
										marshalNode(this),
										1 === C._ts_node_has_error_wasm(this.tree[0])
									);
								}
								get hasChanges() {
									return (
										marshalNode(this),
										1 === C._ts_node_has_changes_wasm(this.tree[0])
									);
								}
								get isError() {
									return (
										marshalNode(this),
										1 === C._ts_node_is_error_wasm(this.tree[0])
									);
								}
								get isMissing() {
									return (
										marshalNode(this),
										1 === C._ts_node_is_missing_wasm(this.tree[0])
									);
								}
								get isExtra() {
									return (
										marshalNode(this),
										1 === C._ts_node_is_extra_wasm(this.tree[0])
									);
								}
								equals(e) {
									return this.id === e.id;
								}
								child(e) {
									return (
										marshalNode(this),
										C._ts_node_child_wasm(this.tree[0], e),
										unmarshalNode(this.tree)
									);
								}
								namedChild(e) {
									return (
										marshalNode(this),
										C._ts_node_named_child_wasm(this.tree[0], e),
										unmarshalNode(this.tree)
									);
								}
								childForFieldId(e) {
									return (
										marshalNode(this),
										C._ts_node_child_by_field_id_wasm(this.tree[0], e),
										unmarshalNode(this.tree)
									);
								}
								childForFieldName(e) {
									const t = this.tree.language.fields.indexOf(e);
									return -1 !== t ? this.childForFieldId(t) : null;
								}
								fieldNameForChild(e) {
									marshalNode(this);
									const t = C._ts_node_field_name_for_child_wasm(this.tree[0], e);
									if (!t) return null;
									return AsciiToString(t);
								}
								childrenForFieldName(e) {
									const t = this.tree.language.fields.indexOf(e);
									return -1 !== t && 0 !== t ? this.childrenForFieldId(t) : [];
								}
								childrenForFieldId(e) {
									marshalNode(this),
										C._ts_node_children_by_field_id_wasm(this.tree[0], e);
									const t = getValue(TRANSFER_BUFFER, "i32"),
										_ = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										s = new Array(t);
									if (t > 0) {
										let e = _;
										for (let _ = 0; _ < t; _++)
											(s[_] = unmarshalNode(this.tree, e)), (e += SIZE_OF_NODE);
										C._free(_);
									}
									return s;
								}
								firstChildForIndex(e) {
									marshalNode(this);
									return (
										setValue(TRANSFER_BUFFER + SIZE_OF_NODE, e, "i32"),
										C._ts_node_first_child_for_byte_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								firstNamedChildForIndex(e) {
									marshalNode(this);
									return (
										setValue(TRANSFER_BUFFER + SIZE_OF_NODE, e, "i32"),
										C._ts_node_first_named_child_for_byte_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								get childCount() {
									return (
										marshalNode(this), C._ts_node_child_count_wasm(this.tree[0])
									);
								}
								get namedChildCount() {
									return (
										marshalNode(this),
										C._ts_node_named_child_count_wasm(this.tree[0])
									);
								}
								get firstChild() {
									return this.child(0);
								}
								get firstNamedChild() {
									return this.namedChild(0);
								}
								get lastChild() {
									return this.child(this.childCount - 1);
								}
								get lastNamedChild() {
									return this.namedChild(this.namedChildCount - 1);
								}
								get children() {
									if (!this._children) {
										marshalNode(this), C._ts_node_children_wasm(this.tree[0]);
										const e = getValue(TRANSFER_BUFFER, "i32"),
											t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
										if (((this._children = new Array(e)), e > 0)) {
											let _ = t;
											for (let t = 0; t < e; t++)
												(this._children[t] = unmarshalNode(this.tree, _)),
													(_ += SIZE_OF_NODE);
											C._free(t);
										}
									}
									return this._children;
								}
								get namedChildren() {
									if (!this._namedChildren) {
										marshalNode(this),
											C._ts_node_named_children_wasm(this.tree[0]);
										const e = getValue(TRANSFER_BUFFER, "i32"),
											t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
										if (((this._namedChildren = new Array(e)), e > 0)) {
											let _ = t;
											for (let t = 0; t < e; t++)
												(this._namedChildren[t] = unmarshalNode(this.tree, _)),
													(_ += SIZE_OF_NODE);
											C._free(t);
										}
									}
									return this._namedChildren;
								}
								descendantsOfType(e, t, _) {
									Array.isArray(e) || (e = [e]),
										t || (t = ZERO_POINT),
										_ || (_ = ZERO_POINT);
									const s = [],
										r = this.tree.language.types;
									for (let t = 0, _ = r.length; t < _; t++)
										e.includes(r[t]) && s.push(t);
									const a = C._malloc(SIZE_OF_INT * s.length);
									for (let e = 0, t = s.length; e < t; e++)
										setValue(a + e * SIZE_OF_INT, s[e], "i32");
									marshalNode(this),
										C._ts_node_descendants_of_type_wasm(
											this.tree[0],
											a,
											s.length,
											t.row,
											t.column,
											_.row,
											_.column
										);
									const o = getValue(TRANSFER_BUFFER, "i32"),
										n = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										l = new Array(o);
									if (o > 0) {
										let e = n;
										for (let t = 0; t < o; t++)
											(l[t] = unmarshalNode(this.tree, e)), (e += SIZE_OF_NODE);
									}
									return C._free(n), C._free(a), l;
								}
								get nextSibling() {
									return (
										marshalNode(this),
										C._ts_node_next_sibling_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								get previousSibling() {
									return (
										marshalNode(this),
										C._ts_node_prev_sibling_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								get nextNamedSibling() {
									return (
										marshalNode(this),
										C._ts_node_next_named_sibling_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								get previousNamedSibling() {
									return (
										marshalNode(this),
										C._ts_node_prev_named_sibling_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								get descendantCount() {
									return (
										marshalNode(this),
										C._ts_node_descendant_count_wasm(this.tree[0])
									);
								}
								get parent() {
									return (
										marshalNode(this),
										C._ts_node_parent_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								descendantForIndex(e, t = e) {
									if ("number" != typeof e || "number" != typeof t)
										throw new Error("Arguments must be numbers");
									marshalNode(this);
									const _ = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										setValue(_, e, "i32"),
										setValue(_ + SIZE_OF_INT, t, "i32"),
										C._ts_node_descendant_for_index_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								namedDescendantForIndex(e, t = e) {
									if ("number" != typeof e || "number" != typeof t)
										throw new Error("Arguments must be numbers");
									marshalNode(this);
									const _ = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										setValue(_, e, "i32"),
										setValue(_ + SIZE_OF_INT, t, "i32"),
										C._ts_node_named_descendant_for_index_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								descendantForPosition(e, t = e) {
									if (!isPoint(e) || !isPoint(t))
										throw new Error("Arguments must be {row, column} objects");
									marshalNode(this);
									const _ = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										marshalPoint(_, e),
										marshalPoint(_ + SIZE_OF_POINT, t),
										C._ts_node_descendant_for_position_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								namedDescendantForPosition(e, t = e) {
									if (!isPoint(e) || !isPoint(t))
										throw new Error("Arguments must be {row, column} objects");
									marshalNode(this);
									const _ = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										marshalPoint(_, e),
										marshalPoint(_ + SIZE_OF_POINT, t),
										C._ts_node_named_descendant_for_position_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								walk() {
									return (
										marshalNode(this),
										C._ts_tree_cursor_new_wasm(this.tree[0]),
										new TreeCursor(INTERNAL, this.tree)
									);
								}
								toString() {
									marshalNode(this);
									const e = C._ts_node_to_string_wasm(this.tree[0]),
										t = AsciiToString(e);
									return C._free(e), t;
								}
							}
							class TreeCursor {
								constructor(e, t) {
									assertInternal(e), (this.tree = t), unmarshalTreeCursor(this);
								}
								delete() {
									marshalTreeCursor(this),
										C._ts_tree_cursor_delete_wasm(this.tree[0]),
										(this[0] = this[1] = this[2] = 0);
								}
								reset(e) {
									marshalNode(e),
										marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE),
										C._ts_tree_cursor_reset_wasm(this.tree[0]),
										unmarshalTreeCursor(this);
								}
								resetTo(e) {
									marshalTreeCursor(this, TRANSFER_BUFFER),
										marshalTreeCursor(e, TRANSFER_BUFFER + SIZE_OF_CURSOR),
										C._ts_tree_cursor_reset_to_wasm(this.tree[0], e.tree[0]),
										unmarshalTreeCursor(this);
								}
								get nodeType() {
									return this.tree.language.types[this.nodeTypeId] || "ERROR";
								}
								get nodeTypeId() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0])
									);
								}
								get nodeStateId() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0])
									);
								}
								get nodeId() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_current_node_id_wasm(this.tree[0])
									);
								}
								get nodeIsNamed() {
									return (
										marshalTreeCursor(this),
										1 ===
										C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0])
									);
								}
								get nodeIsMissing() {
									return (
										marshalTreeCursor(this),
										1 ===
										C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0])
									);
								}
								get nodeText() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_start_index_wasm(this.tree[0]),
										t = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
									return getText(this.tree, e, t);
								}
								get startPosition() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_start_position_wasm(this.tree[0]),
										unmarshalPoint(TRANSFER_BUFFER)
									);
								}
								get endPosition() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_end_position_wasm(this.tree[0]),
										unmarshalPoint(TRANSFER_BUFFER)
									);
								}
								get startIndex() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_start_index_wasm(this.tree[0])
									);
								}
								get endIndex() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_end_index_wasm(this.tree[0])
									);
								}
								get currentNode() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_current_node_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								get currentFieldId() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_current_field_id_wasm(this.tree[0])
									);
								}
								get currentFieldName() {
									return this.tree.language.fields[this.currentFieldId];
								}
								get currentDepth() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_current_depth_wasm(this.tree[0])
									);
								}
								get currentDescendantIndex() {
									return (
										marshalTreeCursor(this),
										C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0])
									);
								}
								gotoFirstChild() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
									return unmarshalTreeCursor(this), 1 === e;
								}
								gotoLastChild() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
									return unmarshalTreeCursor(this), 1 === e;
								}
								gotoFirstChildForIndex(e) {
									marshalTreeCursor(this),
										setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, e, "i32");
									const t = C._ts_tree_cursor_goto_first_child_for_index_wasm(
										this.tree[0]
									);
									return unmarshalTreeCursor(this), 1 === t;
								}
								gotoFirstChildForPosition(e) {
									marshalTreeCursor(this),
										marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, e);
									const t = C._ts_tree_cursor_goto_first_child_for_position_wasm(
										this.tree[0]
									);
									return unmarshalTreeCursor(this), 1 === t;
								}
								gotoNextSibling() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_goto_next_sibling_wasm(
										this.tree[0]
									);
									return unmarshalTreeCursor(this), 1 === e;
								}
								gotoPreviousSibling() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_goto_previous_sibling_wasm(
										this.tree[0]
									);
									return unmarshalTreeCursor(this), 1 === e;
								}
								gotoDescendant(e) {
									marshalTreeCursor(this),
										C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], e),
										unmarshalTreeCursor(this);
								}
								gotoParent() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
									return unmarshalTreeCursor(this), 1 === e;
								}
							}
							class Language {
								constructor(e, t) {
									assertInternal(e),
										(this[0] = t),
										(this.types = new Array(
											C._ts_language_symbol_count(this[0])
										));
									for (let e = 0, t = this.types.length; e < t; e++)
										C._ts_language_symbol_type(this[0], e) < 2 &&
											(this.types[e] = UTF8ToString(
												C._ts_language_symbol_name(this[0], e)
											));
									this.fields = new Array(
										C._ts_language_field_count(this[0]) + 1
									);
									for (let e = 0, t = this.fields.length; e < t; e++) {
										const t = C._ts_language_field_name_for_id(this[0], e);
										this.fields[e] = 0 !== t ? UTF8ToString(t) : null;
									}
								}
								get version() {
									return C._ts_language_version(this[0]);
								}
								get fieldCount() {
									return this.fields.length - 1;
								}
								get stateCount() {
									return C._ts_language_state_count(this[0]);
								}
								fieldIdForName(e) {
									const t = this.fields.indexOf(e);
									return -1 !== t ? t : null;
								}
								fieldNameForId(e) {
									return this.fields[e] || null;
								}
								idForNodeType(e, t) {
									const _ = lengthBytesUTF8(e),
										s = C._malloc(_ + 1);
									stringToUTF8(e, s, _ + 1);
									const r = C._ts_language_symbol_for_name(this[0], s, _, t);
									return C._free(s), r || null;
								}
								get nodeTypeCount() {
									return C._ts_language_symbol_count(this[0]);
								}
								nodeTypeForId(e) {
									const t = C._ts_language_symbol_name(this[0], e);
									return t ? UTF8ToString(t) : null;
								}
								nodeTypeIsNamed(e) {
									return !!C._ts_language_type_is_named_wasm(this[0], e);
								}
								nodeTypeIsVisible(e) {
									return !!C._ts_language_type_is_visible_wasm(this[0], e);
								}
								nextState(e, t) {
									return C._ts_language_next_state(this[0], e, t);
								}
								lookaheadIterator(e) {
									const t = C._ts_lookahead_iterator_new(this[0], e);
									return t ? new LookaheadIterable(INTERNAL, t, this) : null;
								}
								query(e) {
									const t = lengthBytesUTF8(e),
										_ = C._malloc(t + 1);
									stringToUTF8(e, _, t + 1);
									const s = C._ts_query_new(
										this[0],
										_,
										t,
										TRANSFER_BUFFER,
										TRANSFER_BUFFER + SIZE_OF_INT
									);
									if (!s) {
										const t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
											s = getValue(TRANSFER_BUFFER, "i32"),
											r = UTF8ToString(_, s).length,
											a = e.substr(r, 100).split("\n")[0];
										let o,
											n = a.match(QUERY_WORD_REGEX)[0];
										switch (t) {
											case 2:
												o = new RangeError(`Bad node name '${n}'`);
												break;
											case 3:
												o = new RangeError(`Bad field name '${n}'`);
												break;
											case 4:
												o = new RangeError(`Bad capture name @${n}`);
												break;
											case 5:
												(o = new TypeError(
													`Bad pattern structure at offset ${r}: '${a}'...`
												)),
													(n = "");
												break;
											default:
												(o = new SyntaxError(
													`Bad syntax at offset ${r}: '${a}'...`
												)),
													(n = "");
										}
										throw ((o.index = r), (o.length = n.length), C._free(_), o);
									}
									const r = C._ts_query_string_count(s),
										a = C._ts_query_capture_count(s),
										o = C._ts_query_pattern_count(s),
										n = new Array(a),
										l = new Array(r);
									for (let e = 0; e < a; e++) {
										const t = C._ts_query_capture_name_for_id(
											s,
											e,
											TRANSFER_BUFFER
										),
											_ = getValue(TRANSFER_BUFFER, "i32");
										n[e] = UTF8ToString(t, _);
									}
									for (let e = 0; e < r; e++) {
										const t = C._ts_query_string_value_for_id(
											s,
											e,
											TRANSFER_BUFFER
										),
											_ = getValue(TRANSFER_BUFFER, "i32");
										l[e] = UTF8ToString(t, _);
									}
									const d = new Array(o),
										u = new Array(o),
										m = new Array(o),
										c = new Array(o),
										w = new Array(o);
									for (let e = 0; e < o; e++) {
										const t = C._ts_query_predicates_for_pattern(
											s,
											e,
											TRANSFER_BUFFER
										),
											_ = getValue(TRANSFER_BUFFER, "i32");
										(c[e] = []), (w[e] = []);
										const r = [];
										let a = t;
										for (let t = 0; t < _; t++) {
											const t = getValue(a, "i32");
											a += SIZE_OF_INT;
											const _ = getValue(a, "i32");
											if (((a += SIZE_OF_INT), t === PREDICATE_STEP_TYPE_CAPTURE))
												r.push({ type: "capture", name: n[_] });
											else if (t === PREDICATE_STEP_TYPE_STRING)
												r.push({ type: "string", value: l[_] });
											else if (r.length > 0) {
												if ("string" !== r[0].type)
													throw new Error(
														"Predicates must begin with a literal value"
													);
												const t = r[0].value;
												let _,
													s = !0,
													a = !0;
												switch (t) {
													case "any-not-eq?":
													case "not-eq?":
														s = !1;
													case "any-eq?":
													case "eq?":
														if (3 !== r.length)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected 2, got ${r.length - 1
																}`
															);
														if ("capture" !== r[1].type)
															throw new Error(
																`First argument of \`#${t}\` predicate must be a capture. Got "${r[1].value}"`
															);
														if (
															((a = !t.startsWith("any-")),
																"capture" === r[2].type)
														) {
															const t = r[1].name,
																_ = r[2].name;
															w[e].push((e) => {
																const r = [],
																	o = [];
																for (const s of e)
																	s.name === t && r.push(s.node),
																		s.name === _ && o.push(s.node);
																const n = (e, t, _) =>
																	_ ? e.text === t.text : e.text !== t.text;
																return a
																	? r.every((e) => o.some((t) => n(e, t, s)))
																	: r.some((e) => o.some((t) => n(e, t, s)));
															});
														} else {
															_ = r[1].name;
															const t = r[2].value,
																o = (e) => e.text === t,
																n = (e) => e.text !== t;
															w[e].push((e) => {
																const t = [];
																for (const s of e) s.name === _ && t.push(s.node);
																const r = s ? o : n;
																return a ? t.every(r) : t.some(r);
															});
														}
														break;
													case "any-not-match?":
													case "not-match?":
														s = !1;
													case "any-match?":
													case "match?":
														if (3 !== r.length)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected 2, got ${r.length - 1
																}.`
															);
														if ("capture" !== r[1].type)
															throw new Error(
																`First argument of \`#${t}\` predicate must be a capture. Got "${r[1].value}".`
															);
														if ("string" !== r[2].type)
															throw new Error(
																`Second argument of \`#${t}\` predicate must be a string. Got @${r[2].value}.`
															);
														_ = r[1].name;
														const o = new RegExp(r[2].value);
														(a = !t.startsWith("any-")),
															w[e].push((e) => {
																const t = [];
																for (const s of e)
																	s.name === _ && t.push(s.node.text);
																const r = (e, t) => (t ? o.test(e) : !o.test(e));
																return 0 === t.length
																	? !s
																	: a
																		? t.every((e) => r(e, s))
																		: t.some((e) => r(e, s));
															});
														break;
													case "set!":
														if (r.length < 2 || r.length > 3)
															throw new Error(
																`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${r.length - 1
																}.`
															);
														if (r.some((e) => "string" !== e.type))
															throw new Error(
																'Arguments to `#set!` predicate must be a strings.".'
															);
														d[e] || (d[e] = {}),
															(d[e][r[1].value] = r[2] ? r[2].value : null);
														break;
													case "is?":
													case "is-not?":
														if (r.length < 2 || r.length > 3)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected 1 or 2. Got ${r.length - 1
																}.`
															);
														if (r.some((e) => "string" !== e.type))
															throw new Error(
																`Arguments to \`#${t}\` predicate must be a strings.".`
															);
														const n = "is?" === t ? u : m;
														n[e] || (n[e] = {}),
															(n[e][r[1].value] = r[2] ? r[2].value : null);
														break;
													case "not-any-of?":
														s = !1;
													case "any-of?":
														if (r.length < 2)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected at least 1. Got ${r.length - 1
																}.`
															);
														if ("capture" !== r[1].type)
															throw new Error(
																`First argument of \`#${t}\` predicate must be a capture. Got "${r[1].value}".`
															);
														for (let e = 2; e < r.length; e++)
															if ("string" !== r[e].type)
																throw new Error(
																	`Arguments to \`#${t}\` predicate must be a strings.".`
																);
														_ = r[1].name;
														const l = r.slice(2).map((e) => e.value);
														w[e].push((e) => {
															const t = [];
															for (const s of e)
																s.name === _ && t.push(s.node.text);
															return 0 === t.length
																? !s
																: t.every((e) => l.includes(e)) === s;
														});
														break;
													default:
														c[e].push({ operator: t, operands: r.slice(1) });
												}
												r.length = 0;
											}
										}
										Object.freeze(d[e]), Object.freeze(u[e]), Object.freeze(m[e]);
									}
									return (
										C._free(_),
										new Query(
											INTERNAL,
											s,
											n,
											w,
											c,
											Object.freeze(d),
											Object.freeze(u),
											Object.freeze(m)
										)
									);
								}
								static load(e) {
									let t;
									if (e instanceof Uint8Array) t = Promise.resolve(e);
									else {
										const _ = e;
										if (
											"undefined" != typeof process &&
											process.versions &&
											process.versions.node
										) {
											const e = require("fs");
											t = Promise.resolve(e.readFileSync(_));
										} else
											t = fetch(_).then((e) =>
												e.arrayBuffer().then((t) => {
													if (e.ok) return new Uint8Array(t);
													{
														const _ = new TextDecoder("utf-8").decode(t);
														throw new Error(
															`Language.load failed with status ${e.status}.\n\n${_}`
														);
													}
												})
											);
									}
									return t
										.then((e) => loadWebAssemblyModule(e, { loadAsync: !0 }))
										.then((e) => {
											const t = Object.keys(e),
												_ = t.find(
													(e) =>
														LANGUAGE_FUNCTION_REGEX.test(e) &&
														!e.includes("external_scanner_")
												);
											_ ||
												console.log(
													`Couldn't find language function in WASM file. Symbols:\n${JSON.stringify(
														t,
														null,
														2
													)}`
												);
											const s = e[_]();
											return new Language(INTERNAL, s);
										});
								}
							}
							class LookaheadIterable {
								constructor(e, t, _) {
									assertInternal(e), (this[0] = t), (this.language = _);
								}
								get currentTypeId() {
									return C._ts_lookahead_iterator_current_symbol(this[0]);
								}
								get currentType() {
									return this.language.types[this.currentTypeId] || "ERROR";
								}
								delete() {
									C._ts_lookahead_iterator_delete(this[0]), (this[0] = 0);
								}
								resetState(e) {
									return C._ts_lookahead_iterator_reset_state(this[0], e);
								}
								reset(e, t) {
									return (
										!!C._ts_lookahead_iterator_reset(this[0], e[0], t) &&
										((this.language = e), !0)
									);
								}
								[Symbol.iterator]() {
									const e = this;
									return {
										next: () =>
											C._ts_lookahead_iterator_next(e[0])
												? { done: !1, value: e.currentType }
												: { done: !0, value: "" },
									};
								}
							}
							class Query {
								constructor(e, t, _, s, r, a, o, n) {
									assertInternal(e),
										(this[0] = t),
										(this.captureNames = _),
										(this.textPredicates = s),
										(this.predicates = r),
										(this.setProperties = a),
										(this.assertedProperties = o),
										(this.refutedProperties = n),
										(this.exceededMatchLimit = !1);
								}
								delete() {
									C._ts_query_delete(this[0]), (this[0] = 0);
								}
								matches(
									e,
									{
										startPosition: t = ZERO_POINT,
										endPosition: _ = ZERO_POINT,
										startIndex: s = 0,
										endIndex: r = 0,
										matchLimit: a = 4294967295,
										maxStartDepth: o = 4294967295,
									} = {}
								) {
									if ("number" != typeof a)
										throw new Error("Arguments must be numbers");
									marshalNode(e),
										C._ts_query_matches_wasm(
											this[0],
											e.tree[0],
											t.row,
											t.column,
											_.row,
											_.column,
											s,
											r,
											a,
											o
										);
									const n = getValue(TRANSFER_BUFFER, "i32"),
										l = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										d = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32"),
										u = new Array(n);
									this.exceededMatchLimit = Boolean(d);
									let m = 0,
										c = l;
									for (let t = 0; t < n; t++) {
										const t = getValue(c, "i32");
										c += SIZE_OF_INT;
										const _ = getValue(c, "i32");
										c += SIZE_OF_INT;
										const s = new Array(_);
										if (
											((c = unmarshalCaptures(this, e.tree, c, s)),
												this.textPredicates[t].every((e) => e(s)))
										) {
											u[m] = { pattern: t, captures: s };
											const e = this.setProperties[t];
											e && (u[m].setProperties = e);
											const _ = this.assertedProperties[t];
											_ && (u[m].assertedProperties = _);
											const r = this.refutedProperties[t];
											r && (u[m].refutedProperties = r), m++;
										}
									}
									return (u.length = m), C._free(l), u;
								}
								captures(
									e,
									{
										startPosition: t = ZERO_POINT,
										endPosition: _ = ZERO_POINT,
										startIndex: s = 0,
										endIndex: r = 0,
										matchLimit: a = 4294967295,
										maxStartDepth: o = 4294967295,
									} = {}
								) {
									if ("number" != typeof a)
										throw new Error("Arguments must be numbers");
									marshalNode(e),
										C._ts_query_captures_wasm(
											this[0],
											e.tree[0],
											t.row,
											t.column,
											_.row,
											_.column,
											s,
											r,
											a,
											o
										);
									const n = getValue(TRANSFER_BUFFER, "i32"),
										l = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										d = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32"),
										u = [];
									this.exceededMatchLimit = Boolean(d);
									const m = [];
									let c = l;
									for (let t = 0; t < n; t++) {
										const t = getValue(c, "i32");
										c += SIZE_OF_INT;
										const _ = getValue(c, "i32");
										c += SIZE_OF_INT;
										const s = getValue(c, "i32");
										if (
											((c += SIZE_OF_INT),
												(m.length = _),
												(c = unmarshalCaptures(this, e.tree, c, m)),
												this.textPredicates[t].every((e) => e(m)))
										) {
											const e = m[s],
												_ = this.setProperties[t];
											_ && (e.setProperties = _);
											const r = this.assertedProperties[t];
											r && (e.assertedProperties = r);
											const a = this.refutedProperties[t];
											a && (e.refutedProperties = a), u.push(e);
										}
									}
									return C._free(l), u;
								}
								predicatesForPattern(e) {
									return this.predicates[e];
								}
								disableCapture(e) {
									const t = lengthBytesUTF8(e),
										_ = C._malloc(t + 1);
									stringToUTF8(e, _, t + 1),
										C._ts_query_disable_capture(this[0], _, t),
										C._free(_);
								}
								didExceedMatchLimit() {
									return this.exceededMatchLimit;
								}
							}
							function getText(e, t, _) {
								const s = _ - t;
								let r = e.textCallback(t, null, _);
								for (t += r.length; t < _;) {
									const s = e.textCallback(t, null, _);
									if (!(s && s.length > 0)) break;
									(t += s.length), (r += s);
								}
								return t > _ && (r = r.slice(0, s)), r;
							}
							function unmarshalCaptures(e, t, _, s) {
								for (let r = 0, a = s.length; r < a; r++) {
									const a = getValue(_, "i32"),
										o = unmarshalNode(t, (_ += SIZE_OF_INT));
									(_ += SIZE_OF_NODE),
										(s[r] = { name: e.captureNames[a], node: o });
								}
								return _;
							}
							function assertInternal(e) {
								if (e !== INTERNAL) throw new Error("Illegal constructor");
							}
							function isPoint(e) {
								return (
									e && "number" == typeof e.row && "number" == typeof e.column
								);
							}
							function marshalNode(e) {
								let t = TRANSFER_BUFFER;
								setValue(t, e.id, "i32"),
									(t += SIZE_OF_INT),
									setValue(t, e.startIndex, "i32"),
									(t += SIZE_OF_INT),
									setValue(t, e.startPosition.row, "i32"),
									(t += SIZE_OF_INT),
									setValue(t, e.startPosition.column, "i32"),
									(t += SIZE_OF_INT),
									setValue(t, e[0], "i32");
							}
							function unmarshalNode(e, t = TRANSFER_BUFFER) {
								const _ = getValue(t, "i32");
								if (0 === _) return null;
								const s = getValue((t += SIZE_OF_INT), "i32"),
									r = getValue((t += SIZE_OF_INT), "i32"),
									a = getValue((t += SIZE_OF_INT), "i32"),
									o = getValue((t += SIZE_OF_INT), "i32"),
									n = new Node(INTERNAL, e);
								return (
									(n.id = _),
									(n.startIndex = s),
									(n.startPosition = { row: r, column: a }),
									(n[0] = o),
									n
								);
							}
							function marshalTreeCursor(e, t = TRANSFER_BUFFER) {
								setValue(t + 0 * SIZE_OF_INT, e[0], "i32"),
									setValue(t + 1 * SIZE_OF_INT, e[1], "i32"),
									setValue(t + 2 * SIZE_OF_INT, e[2], "i32"),
									setValue(t + 3 * SIZE_OF_INT, e[3], "i32");
							}
							function unmarshalTreeCursor(e) {
								(e[0] = getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32")),
									(e[1] = getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32")),
									(e[2] = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32")),
									(e[3] = getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32"));
							}
							function marshalPoint(e, t) {
								setValue(e, t.row, "i32"),
									setValue(e + SIZE_OF_INT, t.column, "i32");
							}
							function unmarshalPoint(e) {
								return {
									row: getValue(e, "i32") >>> 0,
									column: getValue(e + SIZE_OF_INT, "i32") >>> 0,
								};
							}
							function marshalRange(e, t) {
								marshalPoint(e, t.startPosition),
									marshalPoint((e += SIZE_OF_POINT), t.endPosition),
									setValue((e += SIZE_OF_POINT), t.startIndex, "i32"),
									setValue((e += SIZE_OF_INT), t.endIndex, "i32"),
									(e += SIZE_OF_INT);
							}
							function unmarshalRange(e) {
								const t = {};
								return (
									(t.startPosition = unmarshalPoint(e)),
									(e += SIZE_OF_POINT),
									(t.endPosition = unmarshalPoint(e)),
									(e += SIZE_OF_POINT),
									(t.startIndex = getValue(e, "i32") >>> 0),
									(e += SIZE_OF_INT),
									(t.endIndex = getValue(e, "i32") >>> 0),
									t
								);
							}
							function marshalEdit(e) {
								let t = TRANSFER_BUFFER;
								marshalPoint(t, e.startPosition),
									(t += SIZE_OF_POINT),
									marshalPoint(t, e.oldEndPosition),
									(t += SIZE_OF_POINT),
									marshalPoint(t, e.newEndPosition),
									(t += SIZE_OF_POINT),
									setValue(t, e.startIndex, "i32"),
									(t += SIZE_OF_INT),
									setValue(t, e.oldEndIndex, "i32"),
									(t += SIZE_OF_INT),
									setValue(t, e.newEndIndex, "i32"),
									(t += SIZE_OF_INT);
							}
							for (const e of Object.getOwnPropertyNames(ParserImpl.prototype))
								Object.defineProperty(Parser.prototype, e, {
									value: ParserImpl.prototype[e],
									enumerable: !1,
									writable: !1,
								});
							(Parser.Language = Language),
								(Module.onRuntimeInitialized = () => {
									ParserImpl.init(), resolveInitPromise();
								});
						})))
				);
			}
		}
		return Parser;
	})();
	"object" == typeof exports && (module.exports = TreeSitter);

	return { Parser: TreeSitter };
}));
