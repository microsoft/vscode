/* eslint-disable no-eval */
/* eslint-disable no-case-declarations */
/* eslint-disable no-throw-literal */
/* eslint-disable eqeqeq */
/* eslint-disable curly */
/* eslint-disable local/code-no-unused-expressions */
/* eslint-disable local/code-no-unexternalized-strings */
/* eslint-disable no-var */
/* eslint-disable header/header */

(function (global, factory) {
	typeof define === "function" && define.amd
		? define(["exports"], factory)
		: typeof exports === "object" && typeof module !== "undefined"
		? factory(exports)
		: ((global =
				typeof globalThis !== "undefined" ? globalThis : global || self),
		  factory((global.Parser = {})));
})(this, function () {
	var Module = void 0 !== Module ? Module : {},
		TreeSitter = (function () {
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
								readBinary,
								setWindowTitle;
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
									(readAsync = (e, t, r, _ = !0) => {
										(e = isFileURI(e) ? new URL(e) : nodePath.normalize(e)),
											fs.readFile(e, _ ? void 0 : "utf8", (e, s) => {
												e ? r(e) : t(_ ? s.buffer : s);
											});
									}),
									!Module.thisProgram &&
										process.argv.length > 1 &&
										(thisProgram = process.argv[1].replace(/\\/g, "/")),
									(arguments_ = process.argv.slice(2)),
									"undefined" != typeof module && (module.exports = Module),
									(quit_ = (e, t) => {
										throw ((process.exitCode = e), t);
									}),
									(Module.inspect = () => "[Emscripten Module object]");
							} else
								(ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) &&
									(ENVIRONMENT_IS_WORKER
										? (scriptDirectory = self.location.href)
										: void 0 !== document &&
										  document.currentScript &&
										  (scriptDirectory = document.currentScript.src),
									(scriptDirectory =
										0 !== scriptDirectory.indexOf("blob:")
											? scriptDirectory.substr(
													0,
													scriptDirectory
														.replace(/[?#].*/, "")
														.lastIndexOf("/") + 1
											  )
											: ""),
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
									(readAsync = (e, t, r) => {
										var _ = new XMLHttpRequest();
										_.open("GET", e, !0),
											(_.responseType = "arraybuffer"),
											(_.onload = () => {
												200 == _.status || (0 == _.status && _.response)
													? t(_.response)
													: r();
											}),
											(_.onerror = r),
											_.send(null);
									}),
									(setWindowTitle = (e) => (document.title = e)));
							var out = Module.print || console.log.bind(console),
								err = Module.printErr || console.warn.bind(console);
							Object.assign(Module, moduleOverrides),
								(moduleOverrides = null),
								Module.arguments && (arguments_ = Module.arguments),
								Module.thisProgram && (thisProgram = Module.thisProgram),
								Module.quit && (quit_ = Module.quit);
							var dynamicLibraries = Module.dynamicLibraries || [],
								wasmBinary;
							Module.wasmBinary && (wasmBinary = Module.wasmBinary);
							var noExitRuntime = Module.noExitRuntime || !0,
								wasmMemory;
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
							function assert(e, t) {
								e || abort(t);
							}
							function updateMemoryViews() {
								var e = wasmMemory.buffer;
								(Module.HEAP8 = HEAP8 = new Int8Array(e)),
									(Module.HEAP16 = HEAP16 = new Int16Array(e)),
									(Module.HEAP32 = HEAP32 = new Int32Array(e)),
									(Module.HEAPU8 = HEAPU8 = new Uint8Array(e)),
									(Module.HEAPU16 = HEAPU16 = new Uint16Array(e)),
									(Module.HEAPU32 = HEAPU32 = new Uint32Array(e)),
									(Module.HEAPF32 = HEAPF32 = new Float32Array(e)),
									(Module.HEAPF64 = HEAPF64 = new Float64Array(e));
							}
							var INITIAL_MEMORY = Module.INITIAL_MEMORY || 33554432;
							assert(
								INITIAL_MEMORY >= 65536,
								"INITIAL_MEMORY should be larger than STACK_SIZE, was " +
									INITIAL_MEMORY +
									"! (STACK_SIZE=65536)"
							),
								(wasmMemory = Module.wasmMemory
									? Module.wasmMemory
									: new WebAssembly.Memory({
											initial: INITIAL_MEMORY / 65536,
											maximum: 32768,
									  })),
								updateMemoryViews(),
								(INITIAL_MEMORY = wasmMemory.buffer.byteLength);
							var wasmTable = new WebAssembly.Table({
									initial: 25,
									element: "anyfunc",
								}),
								__ATPRERUN__ = [],
								__ATINIT__ = [],
								__ATMAIN__ = [],
								__ATPOSTRUN__ = [],
								__RELOC_FUNCS__ = [],
								runtimeInitialized = !1,
								runtimeKeepaliveCounter = 0;
							function keepRuntimeAlive() {
								return noExitRuntime || runtimeKeepaliveCounter > 0;
							}
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
									Module.monitorRunDependencies &&
										Module.monitorRunDependencies(runDependencies);
							}
							function removeRunDependency(e) {
								if (
									(runDependencies--,
									Module.monitorRunDependencies &&
										Module.monitorRunDependencies(runDependencies),
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
									(Module.onAbort && Module.onAbort(e),
									err((e = "Aborted(" + e + ")")),
									(ABORT = !0),
									(EXITSTATUS = 1),
									(e += ". Build with -sASSERTIONS for more info."),
									new WebAssembly.RuntimeError(e))
								);
							}
							var dataURIPrefix = "data:application/octet-stream;base64,",
								wasmBinaryFile,
								tempDouble,
								tempI64;
							function isDataURI(e) {
								return e.startsWith(dataURIPrefix);
							}
							function isFileURI(e) {
								return e.startsWith("file://");
							}
							function getBinary(e) {
								try {
									if (e == wasmBinaryFile && wasmBinary)
										return new Uint8Array(wasmBinary);
									if (readBinary) return readBinary(e);
									throw "both async and sync fetching of the wasm failed";
								} catch (e) {
									abort(e);
								}
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
													throw (
														"failed to load wasm binary file at '" + e + "'"
													);
												return t.arrayBuffer();
											})
											.catch(() => getBinary(e));
									if (readAsync)
										return new Promise((t, r) => {
											readAsync(e, (e) => t(new Uint8Array(e)), r);
										});
								}
								return Promise.resolve().then(() => getBinary(e));
							}
							function instantiateArrayBuffer(e, t, r) {
								return getBinaryPromise(e)
									.then((e) => WebAssembly.instantiate(e, t))
									.then((e) => e)
									.then(r, (e) => {
										err("failed to asynchronously prepare wasm: " + e),
											abort(e);
									});
							}
							function instantiateAsync(e, t, r, _) {
								return e ||
									"function" != typeof WebAssembly.instantiateStreaming ||
									isDataURI(t) ||
									isFileURI(t) ||
									ENVIRONMENT_IS_NODE ||
									"function" != typeof fetch
									? instantiateArrayBuffer(t, r, _)
									: fetch(t, { credentials: "same-origin" }).then((e) =>
											WebAssembly.instantiateStreaming(e, r).then(
												_,
												function (e) {
													return (
														err("wasm streaming compile failed: " + e),
														err("falling back to ArrayBuffer instantiation"),
														instantiateArrayBuffer(t, r, _)
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
									var r = e.exports;
									r = relocateExports(r, 1024);
									var _ = getDylinkMetadata(t);
									return (
										_.neededDynlibs &&
											(dynamicLibraries =
												_.neededDynlibs.concat(dynamicLibraries)),
										mergeLibSymbols(r, "main"),
										(Module.asm = r),
										addOnInit(Module.asm.__wasm_call_ctors),
										__RELOC_FUNCS__.push(Module.asm.__wasm_apply_data_relocs),
										removeRunDependency("wasm-instantiate"),
										r
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
												"Module.instantiateWasm callback failed with error: " +
													e
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
									(this.message = "Program terminated with exit(" + e + ")"),
									(this.status = e);
							}
							var GOT = {},
								currentModuleWeakSymbols = new Set([]),
								GOTHandler = {
									get: function (e, t) {
										var r = GOT[t];
										return (
											r ||
												(r = GOT[t] =
													new WebAssembly.Global({
														value: "i32",
														mutable: !0,
													})),
											currentModuleWeakSymbols.has(t) || (r.required = !0),
											r
										);
									},
								};
							function callRuntimeCallbacks(e) {
								for (; e.length > 0; ) e.shift()(Module);
							}
							var UTF8Decoder =
								"undefined" != typeof TextDecoder
									? new TextDecoder("utf8")
									: void 0;
							function UTF8ArrayToString(e, t, r) {
								for (var _ = t + r, s = t; e[s] && !(s >= _); ) ++s;
								if (s - t > 16 && e.buffer && UTF8Decoder)
									return UTF8Decoder.decode(e.subarray(t, s));
								for (var n = ""; t < s; ) {
									var a = e[t++];
									if (128 & a) {
										var o = 63 & e[t++];
										if (192 != (224 & a)) {
											var l = 63 & e[t++];
											if (
												(a =
													224 == (240 & a)
														? ((15 & a) << 12) | (o << 6) | l
														: ((7 & a) << 18) |
														  (o << 12) |
														  (l << 6) |
														  (63 & e[t++])) < 65536
											)
												n += String.fromCharCode(a);
											else {
												var i = a - 65536;
												n += String.fromCharCode(
													55296 | (i >> 10),
													56320 | (1023 & i)
												);
											}
										} else n += String.fromCharCode(((31 & a) << 6) | o);
									} else n += String.fromCharCode(a);
								}
								return n;
							}
							function getDylinkMetadata(e) {
								var t = 0,
									r = 0;
								function _() {
									for (var r = 0, _ = 1; ; ) {
										var s = e[t++];
										if (((r += (127 & s) * _), (_ *= 128), !(128 & s))) break;
									}
									return r;
								}
								function s() {
									var r = _();
									return UTF8ArrayToString(e, (t += r) - r, r);
								}
								function n(e, t) {
									if (e) throw new Error(t);
								}
								var a = "dylink.0";
								if (e instanceof WebAssembly.Module) {
									var o = WebAssembly.Module.customSections(e, a);
									0 === o.length &&
										((a = "dylink"),
										(o = WebAssembly.Module.customSections(e, a))),
										n(0 === o.length, "need dylink section"),
										(r = (e = new Uint8Array(o[0])).length);
								} else {
									n(
										!(
											1836278016 ==
											new Uint32Array(
												new Uint8Array(e.subarray(0, 24)).buffer
											)[0]
										),
										"need to see wasm magic number"
									),
										n(0 !== e[8], "need the dylink section to be first"),
										(t = 9);
									var l = _();
									(r = t + l), (a = s());
								}
								var i = {
									neededDynlibs: [],
									tlsExports: new Set(),
									weakImports: new Set(),
								};
								if ("dylink" == a) {
									(i.memorySize = _()),
										(i.memoryAlign = _()),
										(i.tableSize = _()),
										(i.tableAlign = _());
									for (var u = _(), d = 0; d < u; ++d) {
										var m = s();
										i.neededDynlibs.push(m);
									}
								} else {
									n("dylink.0" !== a);
									for (; t < r; ) {
										var c = e[t++],
											p = _();
										if (1 === c)
											(i.memorySize = _()),
												(i.memoryAlign = _()),
												(i.tableSize = _()),
												(i.tableAlign = _());
										else if (2 === c)
											for (u = _(), d = 0; d < u; ++d)
												(m = s()), i.neededDynlibs.push(m);
										else if (3 === c)
											for (var h = _(); h--; ) {
												var f = s();
												256 & _() && i.tlsExports.add(f);
											}
										else if (4 === c)
											for (h = _(); h--; ) {
												s(), (f = s());
												1 == (3 & _()) && i.weakImports.add(f);
											}
										else t += p;
									}
								}
								return i;
							}
							function getValue(e, t = "i8") {
								switch ((t.endsWith("*") && (t = "*"), t)) {
									case "i1":
									case "i8":
										return HEAP8[e | 0];
									case "i16":
										return HEAP16[e >> 1];
									case "i32":
									case "i64":
										return HEAP32[e >> 2];
									case "float":
										return HEAPF32[e >> 2];
									case "double":
										return HEAPF64[e >> 3];
									case "*":
										return HEAPU32[e >> 2];
									default:
										abort("invalid type for getValue: " + t);
								}
							}
							function newDSO(e, t, r) {
								var _ = { refcount: 1 / 0, name: e, exports: r, global: !0 };
								return (
									(LDSO.loadedLibsByName[e] = _),
									null != t && (LDSO.loadedLibsByHandle[t] = _),
									_
								);
							}
							var LDSO = {
									loadedLibsByName: {},
									loadedLibsByHandle: {},
									init: () => newDSO("__main__", 0, wasmImports),
								},
								___heap_base = 78144;
							function zeroMemory(e, t) {
								return HEAPU8.fill(0, e, e + t), e;
							}
							function getMemory(e) {
								if (runtimeInitialized) return zeroMemory(_malloc(e), e);
								var t = ___heap_base,
									r = (t + e + 15) & -16;
								return (___heap_base = r), (GOT.__heap_base.value = r), t;
							}
							function isInternalSym(e) {
								return [
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
								].includes(e);
							}
							function uleb128Encode(e, t) {
								e < 128 ? t.push(e) : t.push(e % 128 | 128, e >> 7);
							}
							function sigToWasmTypes(e) {
								for (
									var t = { i: "i32", j: "i32", f: "f32", d: "f64", p: "i32" },
										r = {
											parameters: [],
											results: "v" == e[0] ? [] : [t[e[0]]],
										},
										_ = 1;
									_ < e.length;
									++_
								)
									r.parameters.push(t[e[_]]),
										"j" === e[_] && r.parameters.push("i32");
								return r;
							}
							function generateFuncType(e, t) {
								var r = e.slice(0, 1),
									_ = e.slice(1),
									s = { i: 127, p: 127, j: 126, f: 125, d: 124 };
								t.push(96), uleb128Encode(_.length, t);
								for (var n = 0; n < _.length; ++n) t.push(s[_[n]]);
								"v" == r ? t.push(0) : t.push(1, s[r]);
							}
							function convertJsFunctionToWasm(e, t) {
								if ("function" == typeof WebAssembly.Function)
									return new WebAssembly.Function(sigToWasmTypes(t), e);
								var r = [1];
								generateFuncType(t, r);
								var _ = [0, 97, 115, 109, 1, 0, 0, 0, 1];
								uleb128Encode(r.length, _),
									_.push.apply(_, r),
									_.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
								var s = new WebAssembly.Module(new Uint8Array(_));
								return new WebAssembly.Instance(s, { e: { f: e } }).exports.f;
							}
							var wasmTableMirror = [];
							function getWasmTableEntry(e) {
								var t = wasmTableMirror[e];
								return (
									t ||
										(e >= wasmTableMirror.length &&
											(wasmTableMirror.length = e + 1),
										(wasmTableMirror[e] = t = wasmTable.get(e))),
									t
								);
							}
							function updateTableMap(e, t) {
								if (functionsInTableMap)
									for (var r = e; r < e + t; r++) {
										var _ = getWasmTableEntry(r);
										_ && functionsInTableMap.set(_, r);
									}
							}
							var functionsInTableMap = void 0;
							function getFunctionAddress(e) {
								return (
									functionsInTableMap ||
										((functionsInTableMap = new WeakMap()),
										updateTableMap(0, wasmTable.length)),
									functionsInTableMap.get(e) || 0
								);
							}
							var freeTableIndexes = [];
							function getEmptyTableSlot() {
								if (freeTableIndexes.length) return freeTableIndexes.pop();
								try {
									wasmTable.grow(1);
								} catch (e) {
									if (!(e instanceof RangeError)) throw e;
									throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
								}
								return wasmTable.length - 1;
							}
							function setWasmTableEntry(e, t) {
								wasmTable.set(e, t), (wasmTableMirror[e] = wasmTable.get(e));
							}
							function addFunction(e, t) {
								var r = getFunctionAddress(e);
								if (r) return r;
								var _ = getEmptyTableSlot();
								try {
									setWasmTableEntry(_, e);
								} catch (r) {
									if (!(r instanceof TypeError)) throw r;
									setWasmTableEntry(_, convertJsFunctionToWasm(e, t));
								}
								return functionsInTableMap.set(e, _), _;
							}
							function updateGOT(e, t) {
								for (var r in e)
									if (!isInternalSym(r)) {
										var _ = e[r];
										r.startsWith("orig$") && ((r = r.split("$")[1]), (t = !0)),
											GOT[r] ||
												(GOT[r] = new WebAssembly.Global({
													value: "i32",
													mutable: !0,
												})),
											(t || 0 == GOT[r].value) &&
												("function" == typeof _
													? (GOT[r].value = addFunction(_))
													: "number" == typeof _
													? (GOT[r].value = _)
													: err(
															"unhandled export type for `" +
																r +
																"`: " +
																typeof _
													  ));
									}
							}
							function relocateExports(e, t, r) {
								var _ = {};
								for (var s in e) {
									var n = e[s];
									"object" == typeof n && (n = n.value),
										"number" == typeof n && (n += t),
										(_[s] = n);
								}
								return updateGOT(_, r), _;
							}
							function isSymbolDefined(e) {
								var t = wasmImports[e];
								return !(!t || t.stub);
							}
							function resolveGlobalSymbol(e, t = !1) {
								var r;
								return (
									t && "orig$" + e in wasmImports && (e = "orig$" + e),
									isSymbolDefined(e)
										? (r = wasmImports[e])
										: e.startsWith("invoke_") &&
										  (r = wasmImports[e] =
												createInvokeFunction(e.split("_")[1])),
									{ sym: r, name: e }
								);
							}
							function alignMemory(e, t) {
								return Math.ceil(e / t) * t;
							}
							function dynCallLegacy(e, t, r) {
								var _ = Module["dynCall_" + e];
								return r && r.length
									? _.apply(null, [t].concat(r))
									: _.call(null, t);
							}
							function dynCall(e, t, r) {
								return e.includes("j")
									? dynCallLegacy(e, t, r)
									: getWasmTableEntry(t).apply(null, r);
							}
							function createInvokeFunction(e) {
								return function () {
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
								};
							}
							function UTF8ToString(e, t) {
								return e ? UTF8ArrayToString(HEAPU8, e, t) : "";
							}
							function loadWebAssemblyModule(
								binary,
								flags,
								localScope,
								handle
							) {
								var metadata = getDylinkMetadata(binary);
								function loadModule() {
									var firstLoad = !handle || !HEAP8[(handle + 8) | 0];
									if (firstLoad) {
										var memAlign = Math.pow(2, metadata.memoryAlign);
										memAlign = Math.max(memAlign, 16);
										var memoryBase = metadata.memorySize
												? alignMemory(
														getMemory(metadata.memorySize + memAlign),
														memAlign
												  )
												: 0,
											tableBase = metadata.tableSize ? wasmTable.length : 0;
										handle &&
											((HEAP8[(handle + 8) | 0] = 1),
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
											get: function (e, t) {
												switch (t) {
													case "__memory_base":
														return memoryBase;
													case "__table_base":
														return tableBase;
												}
												if (t in wasmImports && !wasmImports[t].stub)
													return wasmImports[t];
												var r;
												t in e ||
													(e[t] = function () {
														return (
															r || (r = resolveSymbol(t)),
															r.apply(null, arguments)
														);
													});
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
									function postInstantiation(instance) {
										function addEmAsm(addr, body) {
											for (
												var args = [], arity = 0;
												arity < 16 && -1 != body.indexOf("$" + arity);
												arity++
											)
												args.push("$" + arity);
											args = args.join(",");
											var func = "(" + args + " ) => { " + body + "};";
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
											return Promise.resolve(postInstantiation(instance));
										}
										return WebAssembly.instantiate(binary, info).then((e) =>
											postInstantiation(e.instance)
										);
									}
									var module =
											binary instanceof WebAssembly.Module
												? binary
												: new WebAssembly.Module(binary),
										instance = new WebAssembly.Instance(module, info);
									return postInstantiation(instance);
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
							}
							function mergeLibSymbols(e, t) {
								for (var r in e) {
									if (!e.hasOwnProperty(r)) continue;
									const t = (t) => {
										isSymbolDefined(t) || (wasmImports[t] = e[r]);
									};
									t(r);
									const _ = "__main_argc_argv";
									"main" == r && t(_),
										r == _ && t("main"),
										r.startsWith("dynCall_") &&
											!Module.hasOwnProperty(r) &&
											(Module[r] = e[r]);
								}
							}
							function asyncLoad(e, t, r, _) {
								var s = _ ? "" : getUniqueRunDependency("al " + e);
								readAsync(
									e,
									(r) => {
										assert(
											r,
											'Loading data file "' + e + '" failed (no arrayBuffer).'
										),
											t(new Uint8Array(r)),
											s && removeRunDependency(s);
									},
									(t) => {
										if (!r) throw 'Loading data file "' + e + '" failed.';
										r();
									}
								),
									s && addRunDependency(s);
							}
							function loadDynamicLibrary(
								e,
								t = { global: !0, nodelete: !0 },
								r,
								_
							) {
								var s = LDSO.loadedLibsByName[e];
								if (s)
									return (
										t.global &&
											!s.global &&
											((s.global = !0),
											"loading" !== s.exports && mergeLibSymbols(s.exports, e)),
										t.nodelete && s.refcount !== 1 / 0 && (s.refcount = 1 / 0),
										s.refcount++,
										_ && (LDSO.loadedLibsByHandle[_] = s),
										!t.loadAsync || Promise.resolve(!0)
									);
								function n() {
									if (t.fs && t.fs.findObject(e)) {
										var r = t.fs.readFile(e, { encoding: "binary" });
										return (
											r instanceof Uint8Array || (r = new Uint8Array(r)),
											t.loadAsync ? Promise.resolve(r) : r
										);
									}
									var _ = locateFile(e);
									if (t.loadAsync)
										return new Promise(function (e, t) {
											asyncLoad(_, (t) => e(t), t);
										});
									if (!readBinary)
										throw new Error(
											_ +
												": file not found, and synchronous loading of external files is not available"
										);
									return readBinary(_);
								}
								function a() {
									if ("undefined" != typeof preloadedWasm && preloadedWasm[e]) {
										var s = preloadedWasm[e];
										return t.loadAsync ? Promise.resolve(s) : s;
									}
									return t.loadAsync
										? n().then((e) => loadWebAssemblyModule(e, t, r, _))
										: loadWebAssemblyModule(n(), t, r, _);
								}
								function o(t) {
									s.global ? mergeLibSymbols(t, e) : r && Object.assign(r, t),
										(s.exports = t);
								}
								return (
									((s = newDSO(e, _, "loading")).refcount = t.nodelete
										? 1 / 0
										: 1),
									(s.global = t.global),
									t.loadAsync ? a().then((e) => (o(e), !0)) : (o(a()), !0)
								);
							}
							function reportUndefinedSymbols() {
								for (var e in GOT)
									if (0 == GOT[e].value) {
										var t = resolveGlobalSymbol(e, !0).sym;
										if (!t && !GOT[e].required) continue;
										if ("function" == typeof t)
											GOT[e].value = addFunction(t, t.sig);
										else {
											if ("number" != typeof t)
												throw new Error(
													"bad export type for `" + e + "`: " + typeof t
												);
											GOT[e].value = t;
										}
									}
							}
							function loadDylibs() {
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
							}
							function setValue(e, t, r = "i8") {
								switch ((r.endsWith("*") && (r = "*"), r)) {
									case "i1":
									case "i8":
										HEAP8[e | 0] = t;
										break;
									case "i16":
										HEAP16[e >> 1] = t;
										break;
									case "i32":
										HEAP32[e >> 2] = t;
										break;
									case "i64":
										(tempI64 = [
											t >>> 0,
											((tempDouble = t),
											+Math.abs(tempDouble) >= 1
												? tempDouble > 0
													? +Math.floor(tempDouble / 4294967296) >>> 0
													: ~~+Math.ceil(
															(tempDouble - +(~~tempDouble >>> 0)) / 4294967296
													  ) >>> 0
												: 0),
										]),
											(HEAP32[e >> 2] = tempI64[0]),
											(HEAP32[(e + 4) >> 2] = tempI64[1]);
										break;
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
										abort("invalid type for setValue: " + r);
								}
							}
							var ___memory_base = new WebAssembly.Global(
									{ value: "i32", mutable: !1 },
									1024
								),
								___stack_pointer = new WebAssembly.Global(
									{ value: "i32", mutable: !0 },
									78144
								),
								___table_base = new WebAssembly.Global(
									{ value: "i32", mutable: !1 },
									1
								),
								nowIsMonotonic = !0,
								_emscripten_get_now;
							function __emscripten_get_now_is_monotonic() {
								return nowIsMonotonic;
							}
							function _abort() {
								abort("");
							}
							function _emscripten_date_now() {
								return Date.now();
							}
							function _emscripten_memcpy_big(e, t, r) {
								HEAPU8.copyWithin(e, t, t + r);
							}
							function getHeapMax() {
								return 2147483648;
							}
							function emscripten_realloc_buffer(e) {
								var t = wasmMemory.buffer;
								try {
									return (
										wasmMemory.grow((e - t.byteLength + 65535) >>> 16),
										updateMemoryViews(),
										1
									);
								} catch (e) {}
							}
							function _emscripten_resize_heap(e) {
								var t = HEAPU8.length;
								e >>>= 0;
								var r = getHeapMax();
								if (e > r) return !1;
								for (var _ = 1; _ <= 4; _ *= 2) {
									var s = t * (1 + 0.2 / _);
									if (
										((s = Math.min(s, e + 100663296)),
										emscripten_realloc_buffer(
											Math.min(
												r,
												(n = Math.max(e, s)) + (((a = 65536) - (n % a)) % a)
											)
										))
									)
										return !0;
								}
								var n, a;
								return !1;
							}
							(__emscripten_get_now_is_monotonic.sig = "i"),
								(_abort.sig = "v"),
								(_emscripten_date_now.sig = "d"),
								(_emscripten_get_now = ENVIRONMENT_IS_NODE
									? () => {
											var e = process.hrtime();
											return 1e3 * e[0] + e[1] / 1e6;
									  }
									: () => performance.now()),
								(_emscripten_get_now.sig = "d"),
								(_emscripten_memcpy_big.sig = "vppp"),
								(_emscripten_resize_heap.sig = "ip");
							var SYSCALLS = {
								DEFAULT_POLLMASK: 5,
								calculateAt: function (e, t, r) {
									if (PATH.isAbs(t)) return t;
									var _;
									-100 === e
										? (_ = FS.cwd())
										: (_ = SYSCALLS.getStreamFromFD(e).path);
									if (0 == t.length) {
										if (!r) throw new FS.ErrnoError(44);
										return _;
									}
									return PATH.join2(_, t);
								},
								doStat: function (e, t, r) {
									try {
										var _ = e(t);
									} catch (e) {
										if (
											e &&
											e.node &&
											PATH.normalize(t) !== PATH.normalize(FS.getPath(e.node))
										)
											return -54;
										throw e;
									}
									(HEAP32[r >> 2] = _.dev),
										(HEAP32[(r + 8) >> 2] = _.ino),
										(HEAP32[(r + 12) >> 2] = _.mode),
										(HEAPU32[(r + 16) >> 2] = _.nlink),
										(HEAP32[(r + 20) >> 2] = _.uid),
										(HEAP32[(r + 24) >> 2] = _.gid),
										(HEAP32[(r + 28) >> 2] = _.rdev),
										(tempI64 = [
											_.size >>> 0,
											((tempDouble = _.size),
											+Math.abs(tempDouble) >= 1
												? tempDouble > 0
													? +Math.floor(tempDouble / 4294967296) >>> 0
													: ~~+Math.ceil(
															(tempDouble - +(~~tempDouble >>> 0)) / 4294967296
													  ) >>> 0
												: 0),
										]),
										(HEAP32[(r + 40) >> 2] = tempI64[0]),
										(HEAP32[(r + 44) >> 2] = tempI64[1]),
										(HEAP32[(r + 48) >> 2] = 4096),
										(HEAP32[(r + 52) >> 2] = _.blocks);
									var s = _.atime.getTime(),
										n = _.mtime.getTime(),
										a = _.ctime.getTime();
									return (
										(tempI64 = [
											Math.floor(s / 1e3) >>> 0,
											((tempDouble = Math.floor(s / 1e3)),
											+Math.abs(tempDouble) >= 1
												? tempDouble > 0
													? +Math.floor(tempDouble / 4294967296) >>> 0
													: ~~+Math.ceil(
															(tempDouble - +(~~tempDouble >>> 0)) / 4294967296
													  ) >>> 0
												: 0),
										]),
										(HEAP32[(r + 56) >> 2] = tempI64[0]),
										(HEAP32[(r + 60) >> 2] = tempI64[1]),
										(HEAPU32[(r + 64) >> 2] = (s % 1e3) * 1e3),
										(tempI64 = [
											Math.floor(n / 1e3) >>> 0,
											((tempDouble = Math.floor(n / 1e3)),
											+Math.abs(tempDouble) >= 1
												? tempDouble > 0
													? +Math.floor(tempDouble / 4294967296) >>> 0
													: ~~+Math.ceil(
															(tempDouble - +(~~tempDouble >>> 0)) / 4294967296
													  ) >>> 0
												: 0),
										]),
										(HEAP32[(r + 72) >> 2] = tempI64[0]),
										(HEAP32[(r + 76) >> 2] = tempI64[1]),
										(HEAPU32[(r + 80) >> 2] = (n % 1e3) * 1e3),
										(tempI64 = [
											Math.floor(a / 1e3) >>> 0,
											((tempDouble = Math.floor(a / 1e3)),
											+Math.abs(tempDouble) >= 1
												? tempDouble > 0
													? +Math.floor(tempDouble / 4294967296) >>> 0
													: ~~+Math.ceil(
															(tempDouble - +(~~tempDouble >>> 0)) / 4294967296
													  ) >>> 0
												: 0),
										]),
										(HEAP32[(r + 88) >> 2] = tempI64[0]),
										(HEAP32[(r + 92) >> 2] = tempI64[1]),
										(HEAPU32[(r + 96) >> 2] = (a % 1e3) * 1e3),
										(tempI64 = [
											_.ino >>> 0,
											((tempDouble = _.ino),
											+Math.abs(tempDouble) >= 1
												? tempDouble > 0
													? +Math.floor(tempDouble / 4294967296) >>> 0
													: ~~+Math.ceil(
															(tempDouble - +(~~tempDouble >>> 0)) / 4294967296
													  ) >>> 0
												: 0),
										]),
										(HEAP32[(r + 104) >> 2] = tempI64[0]),
										(HEAP32[(r + 108) >> 2] = tempI64[1]),
										0
									);
								},
								doMsync: function (e, t, r, _, s) {
									if (!FS.isFile(t.node.mode)) throw new FS.ErrnoError(43);
									if (2 & _) return 0;
									var n = HEAPU8.slice(e, e + r);
									FS.msync(t, n, s, r, _);
								},
								varargs: void 0,
								get: function () {
									return (
										(SYSCALLS.varargs += 4), HEAP32[(SYSCALLS.varargs - 4) >> 2]
									);
								},
								getStr: function (e) {
									return UTF8ToString(e);
								},
								getStreamFromFD: function (e) {
									var t = FS.getStream(e);
									if (!t) throw new FS.ErrnoError(8);
									return t;
								},
							};
							function _fd_close(e) {
								try {
									var t = SYSCALLS.getStreamFromFD(e);
									return FS.close(t), 0;
								} catch (e) {
									if ("undefined" == typeof FS || "ErrnoError" !== e.name)
										throw e;
									return e.errno;
								}
							}
							function convertI32PairToI53Checked(e, t) {
								return (t + 2097152) >>> 0 < 4194305 - !!e
									? (e >>> 0) + 4294967296 * t
									: NaN;
							}
							function _fd_seek(e, t, r, _, s) {
								try {
									var n = convertI32PairToI53Checked(t, r);
									if (isNaN(n)) return 61;
									var a = SYSCALLS.getStreamFromFD(e);
									return (
										FS.llseek(a, n, _),
										(tempI64 = [
											a.position >>> 0,
											((tempDouble = a.position),
											+Math.abs(tempDouble) >= 1
												? tempDouble > 0
													? +Math.floor(tempDouble / 4294967296) >>> 0
													: ~~+Math.ceil(
															(tempDouble - +(~~tempDouble >>> 0)) / 4294967296
													  ) >>> 0
												: 0),
										]),
										(HEAP32[s >> 2] = tempI64[0]),
										(HEAP32[(s + 4) >> 2] = tempI64[1]),
										a.getdents && 0 === n && 0 === _ && (a.getdents = null),
										0
									);
								} catch (e) {
									if ("undefined" == typeof FS || "ErrnoError" !== e.name)
										throw e;
									return e.errno;
								}
							}
							function doWritev(e, t, r, _) {
								for (var s = 0, n = 0; n < r; n++) {
									var a = HEAPU32[t >> 2],
										o = HEAPU32[(t + 4) >> 2];
									t += 8;
									var l = FS.write(e, HEAP8, a, o, _);
									if (l < 0) return -1;
									(s += l), void 0 !== _ && (_ += l);
								}
								return s;
							}
							function _fd_write(e, t, r, _) {
								try {
									var s = doWritev(SYSCALLS.getStreamFromFD(e), t, r);
									return (HEAPU32[_ >> 2] = s), 0;
								} catch (e) {
									if ("undefined" == typeof FS || "ErrnoError" !== e.name)
										throw e;
									return e.errno;
								}
							}
							function _tree_sitter_log_callback(e, t) {
								if (currentLogCallback) {
									const r = UTF8ToString(t);
									currentLogCallback(r, 0 !== e);
								}
							}
							function _tree_sitter_parse_callback(e, t, r, _, s) {
								const n = currentParseCallback(t, { row: r, column: _ });
								"string" == typeof n
									? (setValue(s, n.length, "i32"), stringToUTF16(n, e, 10240))
									: setValue(s, 0, "i32");
							}
							function _proc_exit(e) {
								(EXITSTATUS = e),
									keepRuntimeAlive() ||
										(Module.onExit && Module.onExit(e), (ABORT = !0)),
									quit_(e, new ExitStatus(e));
							}
							function exitJS(e, t) {
								(EXITSTATUS = e), _proc_exit(e);
							}
							function handleException(e) {
								if (e instanceof ExitStatus || "unwind" == e) return EXITSTATUS;
								quit_(1, e);
							}
							function lengthBytesUTF8(e) {
								for (var t = 0, r = 0; r < e.length; ++r) {
									var _ = e.charCodeAt(r);
									_ <= 127
										? t++
										: _ <= 2047
										? (t += 2)
										: _ >= 55296 && _ <= 57343
										? ((t += 4), ++r)
										: (t += 3);
								}
								return t;
							}
							function stringToUTF8Array(e, t, r, _) {
								if (!(_ > 0)) return 0;
								for (var s = r, n = r + _ - 1, a = 0; a < e.length; ++a) {
									var o = e.charCodeAt(a);
									if (o >= 55296 && o <= 57343)
										o =
											(65536 + ((1023 & o) << 10)) | (1023 & e.charCodeAt(++a));
									if (o <= 127) {
										if (r >= n) break;
										t[r++] = o;
									} else if (o <= 2047) {
										if (r + 1 >= n) break;
										(t[r++] = 192 | (o >> 6)), (t[r++] = 128 | (63 & o));
									} else if (o <= 65535) {
										if (r + 2 >= n) break;
										(t[r++] = 224 | (o >> 12)),
											(t[r++] = 128 | ((o >> 6) & 63)),
											(t[r++] = 128 | (63 & o));
									} else {
										if (r + 3 >= n) break;
										(t[r++] = 240 | (o >> 18)),
											(t[r++] = 128 | ((o >> 12) & 63)),
											(t[r++] = 128 | ((o >> 6) & 63)),
											(t[r++] = 128 | (63 & o));
									}
								}
								return (t[r] = 0), r - s;
							}
							function stringToUTF8(e, t, r) {
								return stringToUTF8Array(e, HEAPU8, t, r);
							}
							function stringToUTF8OnStack(e) {
								var t = lengthBytesUTF8(e) + 1,
									r = stackAlloc(t);
								return stringToUTF8(e, r, t), r;
							}
							function stringToUTF16(e, t, r) {
								if ((void 0 === r && (r = 2147483647), r < 2)) return 0;
								for (
									var _ = t,
										s = (r -= 2) < 2 * e.length ? r / 2 : e.length,
										n = 0;
									n < s;
									++n
								) {
									var a = e.charCodeAt(n);
									(HEAP16[t >> 1] = a), (t += 2);
								}
								return (HEAP16[t >> 1] = 0), t - _;
							}
							function AsciiToString(e) {
								for (var t = ""; ; ) {
									var r = HEAPU8[e++ | 0];
									if (!r) return t;
									t += String.fromCharCode(r);
								}
							}
							(_fd_close.sig = "ii"),
								(_fd_seek.sig = "iijip"),
								(_fd_write.sig = "iippp"),
								(_proc_exit.sig = "vi");
							var wasmImports = {
									__heap_base: ___heap_base,
									__indirect_function_table: wasmTable,
									__memory_base: ___memory_base,
									__stack_pointer: ___stack_pointer,
									__table_base: ___table_base,
									_emscripten_get_now_is_monotonic:
										__emscripten_get_now_is_monotonic,
									abort: _abort,
									emscripten_get_now: _emscripten_get_now,
									emscripten_memcpy_big: _emscripten_memcpy_big,
									emscripten_resize_heap: _emscripten_resize_heap,
									fd_close: _fd_close,
									fd_seek: _fd_seek,
									fd_write: _fd_write,
									memory: wasmMemory,
									tree_sitter_log_callback: _tree_sitter_log_callback,
									tree_sitter_parse_callback: _tree_sitter_parse_callback,
								},
								asm = createWasm(),
								___wasm_call_ctors = function () {
									return (___wasm_call_ctors =
										Module.asm.__wasm_call_ctors).apply(null, arguments);
								},
								___wasm_apply_data_relocs = (Module.___wasm_apply_data_relocs =
									function () {
										return (___wasm_apply_data_relocs =
											Module.___wasm_apply_data_relocs =
												Module.asm.__wasm_apply_data_relocs).apply(
											null,
											arguments
										);
									}),
								_malloc = (Module._malloc = function () {
									return (_malloc = Module._malloc = Module.asm.malloc).apply(
										null,
										arguments
									);
								}),
								_calloc = (Module._calloc = function () {
									return (_calloc = Module._calloc = Module.asm.calloc).apply(
										null,
										arguments
									);
								}),
								_realloc = (Module._realloc = function () {
									return (_realloc = Module._realloc =
										Module.asm.realloc).apply(null, arguments);
								}),
								_free = (Module._free = function () {
									return (_free = Module._free = Module.asm.free).apply(
										null,
										arguments
									);
								}),
								_ts_language_symbol_count = (Module._ts_language_symbol_count =
									function () {
										return (_ts_language_symbol_count =
											Module._ts_language_symbol_count =
												Module.asm.ts_language_symbol_count).apply(
											null,
											arguments
										);
									}),
								_ts_language_state_count = (Module._ts_language_state_count =
									function () {
										return (_ts_language_state_count =
											Module._ts_language_state_count =
												Module.asm.ts_language_state_count).apply(
											null,
											arguments
										);
									}),
								_ts_language_version = (Module._ts_language_version =
									function () {
										return (_ts_language_version = Module._ts_language_version =
											Module.asm.ts_language_version).apply(null, arguments);
									}),
								_ts_language_field_count = (Module._ts_language_field_count =
									function () {
										return (_ts_language_field_count =
											Module._ts_language_field_count =
												Module.asm.ts_language_field_count).apply(
											null,
											arguments
										);
									}),
								_ts_language_next_state = (Module._ts_language_next_state =
									function () {
										return (_ts_language_next_state =
											Module._ts_language_next_state =
												Module.asm.ts_language_next_state).apply(
											null,
											arguments
										);
									}),
								_ts_language_symbol_name = (Module._ts_language_symbol_name =
									function () {
										return (_ts_language_symbol_name =
											Module._ts_language_symbol_name =
												Module.asm.ts_language_symbol_name).apply(
											null,
											arguments
										);
									}),
								_ts_language_symbol_for_name =
									(Module._ts_language_symbol_for_name = function () {
										return (_ts_language_symbol_for_name =
											Module._ts_language_symbol_for_name =
												Module.asm.ts_language_symbol_for_name).apply(
											null,
											arguments
										);
									}),
								_ts_language_symbol_type = (Module._ts_language_symbol_type =
									function () {
										return (_ts_language_symbol_type =
											Module._ts_language_symbol_type =
												Module.asm.ts_language_symbol_type).apply(
											null,
											arguments
										);
									}),
								_ts_language_field_name_for_id =
									(Module._ts_language_field_name_for_id = function () {
										return (_ts_language_field_name_for_id =
											Module._ts_language_field_name_for_id =
												Module.asm.ts_language_field_name_for_id).apply(
											null,
											arguments
										);
									}),
								_ts_lookahead_iterator_new =
									(Module._ts_lookahead_iterator_new = function () {
										return (_ts_lookahead_iterator_new =
											Module._ts_lookahead_iterator_new =
												Module.asm.ts_lookahead_iterator_new).apply(
											null,
											arguments
										);
									}),
								_ts_lookahead_iterator_delete =
									(Module._ts_lookahead_iterator_delete = function () {
										return (_ts_lookahead_iterator_delete =
											Module._ts_lookahead_iterator_delete =
												Module.asm.ts_lookahead_iterator_delete).apply(
											null,
											arguments
										);
									}),
								_ts_lookahead_iterator_reset_state =
									(Module._ts_lookahead_iterator_reset_state = function () {
										return (_ts_lookahead_iterator_reset_state =
											Module._ts_lookahead_iterator_reset_state =
												Module.asm.ts_lookahead_iterator_reset_state).apply(
											null,
											arguments
										);
									}),
								_ts_lookahead_iterator_reset =
									(Module._ts_lookahead_iterator_reset = function () {
										return (_ts_lookahead_iterator_reset =
											Module._ts_lookahead_iterator_reset =
												Module.asm.ts_lookahead_iterator_reset).apply(
											null,
											arguments
										);
									}),
								_ts_lookahead_iterator_next =
									(Module._ts_lookahead_iterator_next = function () {
										return (_ts_lookahead_iterator_next =
											Module._ts_lookahead_iterator_next =
												Module.asm.ts_lookahead_iterator_next).apply(
											null,
											arguments
										);
									}),
								_ts_lookahead_iterator_current_symbol =
									(Module._ts_lookahead_iterator_current_symbol = function () {
										return (_ts_lookahead_iterator_current_symbol =
											Module._ts_lookahead_iterator_current_symbol =
												Module.asm.ts_lookahead_iterator_current_symbol).apply(
											null,
											arguments
										);
									}),
								_memset = (Module._memset = function () {
									return (_memset = Module._memset = Module.asm.memset).apply(
										null,
										arguments
									);
								}),
								_memcpy = (Module._memcpy = function () {
									return (_memcpy = Module._memcpy = Module.asm.memcpy).apply(
										null,
										arguments
									);
								}),
								_ts_parser_delete = (Module._ts_parser_delete = function () {
									return (_ts_parser_delete = Module._ts_parser_delete =
										Module.asm.ts_parser_delete).apply(null, arguments);
								}),
								_ts_parser_reset = (Module._ts_parser_reset = function () {
									return (_ts_parser_reset = Module._ts_parser_reset =
										Module.asm.ts_parser_reset).apply(null, arguments);
								}),
								_ts_parser_set_language = (Module._ts_parser_set_language =
									function () {
										return (_ts_parser_set_language =
											Module._ts_parser_set_language =
												Module.asm.ts_parser_set_language).apply(
											null,
											arguments
										);
									}),
								_ts_parser_timeout_micros = (Module._ts_parser_timeout_micros =
									function () {
										return (_ts_parser_timeout_micros =
											Module._ts_parser_timeout_micros =
												Module.asm.ts_parser_timeout_micros).apply(
											null,
											arguments
										);
									}),
								_ts_parser_set_timeout_micros =
									(Module._ts_parser_set_timeout_micros = function () {
										return (_ts_parser_set_timeout_micros =
											Module._ts_parser_set_timeout_micros =
												Module.asm.ts_parser_set_timeout_micros).apply(
											null,
											arguments
										);
									}),
								_ts_parser_set_included_ranges =
									(Module._ts_parser_set_included_ranges = function () {
										return (_ts_parser_set_included_ranges =
											Module._ts_parser_set_included_ranges =
												Module.asm.ts_parser_set_included_ranges).apply(
											null,
											arguments
										);
									}),
								_memmove = (Module._memmove = function () {
									return (_memmove = Module._memmove =
										Module.asm.memmove).apply(null, arguments);
								}),
								_memcmp = (Module._memcmp = function () {
									return (_memcmp = Module._memcmp = Module.asm.memcmp).apply(
										null,
										arguments
									);
								}),
								_ts_query_new = (Module._ts_query_new = function () {
									return (_ts_query_new = Module._ts_query_new =
										Module.asm.ts_query_new).apply(null, arguments);
								}),
								_ts_query_delete = (Module._ts_query_delete = function () {
									return (_ts_query_delete = Module._ts_query_delete =
										Module.asm.ts_query_delete).apply(null, arguments);
								}),
								_iswspace = (Module._iswspace = function () {
									return (_iswspace = Module._iswspace =
										Module.asm.iswspace).apply(null, arguments);
								}),
								_iswalnum = (Module._iswalnum = function () {
									return (_iswalnum = Module._iswalnum =
										Module.asm.iswalnum).apply(null, arguments);
								}),
								_ts_query_pattern_count = (Module._ts_query_pattern_count =
									function () {
										return (_ts_query_pattern_count =
											Module._ts_query_pattern_count =
												Module.asm.ts_query_pattern_count).apply(
											null,
											arguments
										);
									}),
								_ts_query_capture_count = (Module._ts_query_capture_count =
									function () {
										return (_ts_query_capture_count =
											Module._ts_query_capture_count =
												Module.asm.ts_query_capture_count).apply(
											null,
											arguments
										);
									}),
								_ts_query_string_count = (Module._ts_query_string_count =
									function () {
										return (_ts_query_string_count =
											Module._ts_query_string_count =
												Module.asm.ts_query_string_count).apply(
											null,
											arguments
										);
									}),
								_ts_query_capture_name_for_id =
									(Module._ts_query_capture_name_for_id = function () {
										return (_ts_query_capture_name_for_id =
											Module._ts_query_capture_name_for_id =
												Module.asm.ts_query_capture_name_for_id).apply(
											null,
											arguments
										);
									}),
								_ts_query_string_value_for_id =
									(Module._ts_query_string_value_for_id = function () {
										return (_ts_query_string_value_for_id =
											Module._ts_query_string_value_for_id =
												Module.asm.ts_query_string_value_for_id).apply(
											null,
											arguments
										);
									}),
								_ts_query_predicates_for_pattern =
									(Module._ts_query_predicates_for_pattern = function () {
										return (_ts_query_predicates_for_pattern =
											Module._ts_query_predicates_for_pattern =
												Module.asm.ts_query_predicates_for_pattern).apply(
											null,
											arguments
										);
									}),
								_ts_query_disable_capture = (Module._ts_query_disable_capture =
									function () {
										return (_ts_query_disable_capture =
											Module._ts_query_disable_capture =
												Module.asm.ts_query_disable_capture).apply(
											null,
											arguments
										);
									}),
								_ts_tree_copy = (Module._ts_tree_copy = function () {
									return (_ts_tree_copy = Module._ts_tree_copy =
										Module.asm.ts_tree_copy).apply(null, arguments);
								}),
								_ts_tree_delete = (Module._ts_tree_delete = function () {
									return (_ts_tree_delete = Module._ts_tree_delete =
										Module.asm.ts_tree_delete).apply(null, arguments);
								}),
								_ts_init = (Module._ts_init = function () {
									return (_ts_init = Module._ts_init =
										Module.asm.ts_init).apply(null, arguments);
								}),
								_ts_parser_new_wasm = (Module._ts_parser_new_wasm =
									function () {
										return (_ts_parser_new_wasm = Module._ts_parser_new_wasm =
											Module.asm.ts_parser_new_wasm).apply(null, arguments);
									}),
								_ts_parser_enable_logger_wasm =
									(Module._ts_parser_enable_logger_wasm = function () {
										return (_ts_parser_enable_logger_wasm =
											Module._ts_parser_enable_logger_wasm =
												Module.asm.ts_parser_enable_logger_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_parser_parse_wasm = (Module._ts_parser_parse_wasm =
									function () {
										return (_ts_parser_parse_wasm =
											Module._ts_parser_parse_wasm =
												Module.asm.ts_parser_parse_wasm).apply(null, arguments);
									}),
								_ts_parser_included_ranges_wasm =
									(Module._ts_parser_included_ranges_wasm = function () {
										return (_ts_parser_included_ranges_wasm =
											Module._ts_parser_included_ranges_wasm =
												Module.asm.ts_parser_included_ranges_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_language_type_is_named_wasm =
									(Module._ts_language_type_is_named_wasm = function () {
										return (_ts_language_type_is_named_wasm =
											Module._ts_language_type_is_named_wasm =
												Module.asm.ts_language_type_is_named_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_language_type_is_visible_wasm =
									(Module._ts_language_type_is_visible_wasm = function () {
										return (_ts_language_type_is_visible_wasm =
											Module._ts_language_type_is_visible_wasm =
												Module.asm.ts_language_type_is_visible_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_root_node_wasm = (Module._ts_tree_root_node_wasm =
									function () {
										return (_ts_tree_root_node_wasm =
											Module._ts_tree_root_node_wasm =
												Module.asm.ts_tree_root_node_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_root_node_with_offset_wasm =
									(Module._ts_tree_root_node_with_offset_wasm = function () {
										return (_ts_tree_root_node_with_offset_wasm =
											Module._ts_tree_root_node_with_offset_wasm =
												Module.asm.ts_tree_root_node_with_offset_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_edit_wasm = (Module._ts_tree_edit_wasm = function () {
									return (_ts_tree_edit_wasm = Module._ts_tree_edit_wasm =
										Module.asm.ts_tree_edit_wasm).apply(null, arguments);
								}),
								_ts_tree_included_ranges_wasm =
									(Module._ts_tree_included_ranges_wasm = function () {
										return (_ts_tree_included_ranges_wasm =
											Module._ts_tree_included_ranges_wasm =
												Module.asm.ts_tree_included_ranges_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_get_changed_ranges_wasm =
									(Module._ts_tree_get_changed_ranges_wasm = function () {
										return (_ts_tree_get_changed_ranges_wasm =
											Module._ts_tree_get_changed_ranges_wasm =
												Module.asm.ts_tree_get_changed_ranges_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_new_wasm = (Module._ts_tree_cursor_new_wasm =
									function () {
										return (_ts_tree_cursor_new_wasm =
											Module._ts_tree_cursor_new_wasm =
												Module.asm.ts_tree_cursor_new_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_delete_wasm =
									(Module._ts_tree_cursor_delete_wasm = function () {
										return (_ts_tree_cursor_delete_wasm =
											Module._ts_tree_cursor_delete_wasm =
												Module.asm.ts_tree_cursor_delete_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_reset_wasm =
									(Module._ts_tree_cursor_reset_wasm = function () {
										return (_ts_tree_cursor_reset_wasm =
											Module._ts_tree_cursor_reset_wasm =
												Module.asm.ts_tree_cursor_reset_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_reset_to_wasm =
									(Module._ts_tree_cursor_reset_to_wasm = function () {
										return (_ts_tree_cursor_reset_to_wasm =
											Module._ts_tree_cursor_reset_to_wasm =
												Module.asm.ts_tree_cursor_reset_to_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_goto_first_child_wasm =
									(Module._ts_tree_cursor_goto_first_child_wasm = function () {
										return (_ts_tree_cursor_goto_first_child_wasm =
											Module._ts_tree_cursor_goto_first_child_wasm =
												Module.asm.ts_tree_cursor_goto_first_child_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_goto_last_child_wasm =
									(Module._ts_tree_cursor_goto_last_child_wasm = function () {
										return (_ts_tree_cursor_goto_last_child_wasm =
											Module._ts_tree_cursor_goto_last_child_wasm =
												Module.asm.ts_tree_cursor_goto_last_child_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_goto_first_child_for_index_wasm =
									(Module._ts_tree_cursor_goto_first_child_for_index_wasm =
										function () {
											return (_ts_tree_cursor_goto_first_child_for_index_wasm =
												Module._ts_tree_cursor_goto_first_child_for_index_wasm =
													Module.asm.ts_tree_cursor_goto_first_child_for_index_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_goto_first_child_for_position_wasm =
									(Module._ts_tree_cursor_goto_first_child_for_position_wasm =
										function () {
											return (_ts_tree_cursor_goto_first_child_for_position_wasm =
												Module._ts_tree_cursor_goto_first_child_for_position_wasm =
													Module.asm.ts_tree_cursor_goto_first_child_for_position_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_goto_next_sibling_wasm =
									(Module._ts_tree_cursor_goto_next_sibling_wasm = function () {
										return (_ts_tree_cursor_goto_next_sibling_wasm =
											Module._ts_tree_cursor_goto_next_sibling_wasm =
												Module.asm.ts_tree_cursor_goto_next_sibling_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_goto_previous_sibling_wasm =
									(Module._ts_tree_cursor_goto_previous_sibling_wasm =
										function () {
											return (_ts_tree_cursor_goto_previous_sibling_wasm =
												Module._ts_tree_cursor_goto_previous_sibling_wasm =
													Module.asm.ts_tree_cursor_goto_previous_sibling_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_goto_descendant_wasm =
									(Module._ts_tree_cursor_goto_descendant_wasm = function () {
										return (_ts_tree_cursor_goto_descendant_wasm =
											Module._ts_tree_cursor_goto_descendant_wasm =
												Module.asm.ts_tree_cursor_goto_descendant_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_goto_parent_wasm =
									(Module._ts_tree_cursor_goto_parent_wasm = function () {
										return (_ts_tree_cursor_goto_parent_wasm =
											Module._ts_tree_cursor_goto_parent_wasm =
												Module.asm.ts_tree_cursor_goto_parent_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_current_node_type_id_wasm =
									(Module._ts_tree_cursor_current_node_type_id_wasm =
										function () {
											return (_ts_tree_cursor_current_node_type_id_wasm =
												Module._ts_tree_cursor_current_node_type_id_wasm =
													Module.asm.ts_tree_cursor_current_node_type_id_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_current_node_state_id_wasm =
									(Module._ts_tree_cursor_current_node_state_id_wasm =
										function () {
											return (_ts_tree_cursor_current_node_state_id_wasm =
												Module._ts_tree_cursor_current_node_state_id_wasm =
													Module.asm.ts_tree_cursor_current_node_state_id_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_current_node_is_named_wasm =
									(Module._ts_tree_cursor_current_node_is_named_wasm =
										function () {
											return (_ts_tree_cursor_current_node_is_named_wasm =
												Module._ts_tree_cursor_current_node_is_named_wasm =
													Module.asm.ts_tree_cursor_current_node_is_named_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_current_node_is_missing_wasm =
									(Module._ts_tree_cursor_current_node_is_missing_wasm =
										function () {
											return (_ts_tree_cursor_current_node_is_missing_wasm =
												Module._ts_tree_cursor_current_node_is_missing_wasm =
													Module.asm.ts_tree_cursor_current_node_is_missing_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_current_node_id_wasm =
									(Module._ts_tree_cursor_current_node_id_wasm = function () {
										return (_ts_tree_cursor_current_node_id_wasm =
											Module._ts_tree_cursor_current_node_id_wasm =
												Module.asm.ts_tree_cursor_current_node_id_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_start_position_wasm =
									(Module._ts_tree_cursor_start_position_wasm = function () {
										return (_ts_tree_cursor_start_position_wasm =
											Module._ts_tree_cursor_start_position_wasm =
												Module.asm.ts_tree_cursor_start_position_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_end_position_wasm =
									(Module._ts_tree_cursor_end_position_wasm = function () {
										return (_ts_tree_cursor_end_position_wasm =
											Module._ts_tree_cursor_end_position_wasm =
												Module.asm.ts_tree_cursor_end_position_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_start_index_wasm =
									(Module._ts_tree_cursor_start_index_wasm = function () {
										return (_ts_tree_cursor_start_index_wasm =
											Module._ts_tree_cursor_start_index_wasm =
												Module.asm.ts_tree_cursor_start_index_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_end_index_wasm =
									(Module._ts_tree_cursor_end_index_wasm = function () {
										return (_ts_tree_cursor_end_index_wasm =
											Module._ts_tree_cursor_end_index_wasm =
												Module.asm.ts_tree_cursor_end_index_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_current_field_id_wasm =
									(Module._ts_tree_cursor_current_field_id_wasm = function () {
										return (_ts_tree_cursor_current_field_id_wasm =
											Module._ts_tree_cursor_current_field_id_wasm =
												Module.asm.ts_tree_cursor_current_field_id_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_current_depth_wasm =
									(Module._ts_tree_cursor_current_depth_wasm = function () {
										return (_ts_tree_cursor_current_depth_wasm =
											Module._ts_tree_cursor_current_depth_wasm =
												Module.asm.ts_tree_cursor_current_depth_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_tree_cursor_current_descendant_index_wasm =
									(Module._ts_tree_cursor_current_descendant_index_wasm =
										function () {
											return (_ts_tree_cursor_current_descendant_index_wasm =
												Module._ts_tree_cursor_current_descendant_index_wasm =
													Module.asm.ts_tree_cursor_current_descendant_index_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_tree_cursor_current_node_wasm =
									(Module._ts_tree_cursor_current_node_wasm = function () {
										return (_ts_tree_cursor_current_node_wasm =
											Module._ts_tree_cursor_current_node_wasm =
												Module.asm.ts_tree_cursor_current_node_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_symbol_wasm = (Module._ts_node_symbol_wasm =
									function () {
										return (_ts_node_symbol_wasm = Module._ts_node_symbol_wasm =
											Module.asm.ts_node_symbol_wasm).apply(null, arguments);
									}),
								_ts_node_field_name_for_child_wasm =
									(Module._ts_node_field_name_for_child_wasm = function () {
										return (_ts_node_field_name_for_child_wasm =
											Module._ts_node_field_name_for_child_wasm =
												Module.asm.ts_node_field_name_for_child_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_children_by_field_id_wasm =
									(Module._ts_node_children_by_field_id_wasm = function () {
										return (_ts_node_children_by_field_id_wasm =
											Module._ts_node_children_by_field_id_wasm =
												Module.asm.ts_node_children_by_field_id_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_first_child_for_byte_wasm =
									(Module._ts_node_first_child_for_byte_wasm = function () {
										return (_ts_node_first_child_for_byte_wasm =
											Module._ts_node_first_child_for_byte_wasm =
												Module.asm.ts_node_first_child_for_byte_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_first_named_child_for_byte_wasm =
									(Module._ts_node_first_named_child_for_byte_wasm =
										function () {
											return (_ts_node_first_named_child_for_byte_wasm =
												Module._ts_node_first_named_child_for_byte_wasm =
													Module.asm.ts_node_first_named_child_for_byte_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_node_grammar_symbol_wasm =
									(Module._ts_node_grammar_symbol_wasm = function () {
										return (_ts_node_grammar_symbol_wasm =
											Module._ts_node_grammar_symbol_wasm =
												Module.asm.ts_node_grammar_symbol_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_child_count_wasm = (Module._ts_node_child_count_wasm =
									function () {
										return (_ts_node_child_count_wasm =
											Module._ts_node_child_count_wasm =
												Module.asm.ts_node_child_count_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_named_child_count_wasm =
									(Module._ts_node_named_child_count_wasm = function () {
										return (_ts_node_named_child_count_wasm =
											Module._ts_node_named_child_count_wasm =
												Module.asm.ts_node_named_child_count_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_child_wasm = (Module._ts_node_child_wasm =
									function () {
										return (_ts_node_child_wasm = Module._ts_node_child_wasm =
											Module.asm.ts_node_child_wasm).apply(null, arguments);
									}),
								_ts_node_named_child_wasm = (Module._ts_node_named_child_wasm =
									function () {
										return (_ts_node_named_child_wasm =
											Module._ts_node_named_child_wasm =
												Module.asm.ts_node_named_child_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_child_by_field_id_wasm =
									(Module._ts_node_child_by_field_id_wasm = function () {
										return (_ts_node_child_by_field_id_wasm =
											Module._ts_node_child_by_field_id_wasm =
												Module.asm.ts_node_child_by_field_id_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_next_sibling_wasm =
									(Module._ts_node_next_sibling_wasm = function () {
										return (_ts_node_next_sibling_wasm =
											Module._ts_node_next_sibling_wasm =
												Module.asm.ts_node_next_sibling_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_prev_sibling_wasm =
									(Module._ts_node_prev_sibling_wasm = function () {
										return (_ts_node_prev_sibling_wasm =
											Module._ts_node_prev_sibling_wasm =
												Module.asm.ts_node_prev_sibling_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_next_named_sibling_wasm =
									(Module._ts_node_next_named_sibling_wasm = function () {
										return (_ts_node_next_named_sibling_wasm =
											Module._ts_node_next_named_sibling_wasm =
												Module.asm.ts_node_next_named_sibling_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_prev_named_sibling_wasm =
									(Module._ts_node_prev_named_sibling_wasm = function () {
										return (_ts_node_prev_named_sibling_wasm =
											Module._ts_node_prev_named_sibling_wasm =
												Module.asm.ts_node_prev_named_sibling_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_descendant_count_wasm =
									(Module._ts_node_descendant_count_wasm = function () {
										return (_ts_node_descendant_count_wasm =
											Module._ts_node_descendant_count_wasm =
												Module.asm.ts_node_descendant_count_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_parent_wasm = (Module._ts_node_parent_wasm =
									function () {
										return (_ts_node_parent_wasm = Module._ts_node_parent_wasm =
											Module.asm.ts_node_parent_wasm).apply(null, arguments);
									}),
								_ts_node_descendant_for_index_wasm =
									(Module._ts_node_descendant_for_index_wasm = function () {
										return (_ts_node_descendant_for_index_wasm =
											Module._ts_node_descendant_for_index_wasm =
												Module.asm.ts_node_descendant_for_index_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_named_descendant_for_index_wasm =
									(Module._ts_node_named_descendant_for_index_wasm =
										function () {
											return (_ts_node_named_descendant_for_index_wasm =
												Module._ts_node_named_descendant_for_index_wasm =
													Module.asm.ts_node_named_descendant_for_index_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_node_descendant_for_position_wasm =
									(Module._ts_node_descendant_for_position_wasm = function () {
										return (_ts_node_descendant_for_position_wasm =
											Module._ts_node_descendant_for_position_wasm =
												Module.asm.ts_node_descendant_for_position_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_named_descendant_for_position_wasm =
									(Module._ts_node_named_descendant_for_position_wasm =
										function () {
											return (_ts_node_named_descendant_for_position_wasm =
												Module._ts_node_named_descendant_for_position_wasm =
													Module.asm.ts_node_named_descendant_for_position_wasm).apply(
												null,
												arguments
											);
										}),
								_ts_node_start_point_wasm = (Module._ts_node_start_point_wasm =
									function () {
										return (_ts_node_start_point_wasm =
											Module._ts_node_start_point_wasm =
												Module.asm.ts_node_start_point_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_end_point_wasm = (Module._ts_node_end_point_wasm =
									function () {
										return (_ts_node_end_point_wasm =
											Module._ts_node_end_point_wasm =
												Module.asm.ts_node_end_point_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_start_index_wasm = (Module._ts_node_start_index_wasm =
									function () {
										return (_ts_node_start_index_wasm =
											Module._ts_node_start_index_wasm =
												Module.asm.ts_node_start_index_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_end_index_wasm = (Module._ts_node_end_index_wasm =
									function () {
										return (_ts_node_end_index_wasm =
											Module._ts_node_end_index_wasm =
												Module.asm.ts_node_end_index_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_to_string_wasm = (Module._ts_node_to_string_wasm =
									function () {
										return (_ts_node_to_string_wasm =
											Module._ts_node_to_string_wasm =
												Module.asm.ts_node_to_string_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_children_wasm = (Module._ts_node_children_wasm =
									function () {
										return (_ts_node_children_wasm =
											Module._ts_node_children_wasm =
												Module.asm.ts_node_children_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_named_children_wasm =
									(Module._ts_node_named_children_wasm = function () {
										return (_ts_node_named_children_wasm =
											Module._ts_node_named_children_wasm =
												Module.asm.ts_node_named_children_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_descendants_of_type_wasm =
									(Module._ts_node_descendants_of_type_wasm = function () {
										return (_ts_node_descendants_of_type_wasm =
											Module._ts_node_descendants_of_type_wasm =
												Module.asm.ts_node_descendants_of_type_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_is_named_wasm = (Module._ts_node_is_named_wasm =
									function () {
										return (_ts_node_is_named_wasm =
											Module._ts_node_is_named_wasm =
												Module.asm.ts_node_is_named_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_has_changes_wasm = (Module._ts_node_has_changes_wasm =
									function () {
										return (_ts_node_has_changes_wasm =
											Module._ts_node_has_changes_wasm =
												Module.asm.ts_node_has_changes_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_has_error_wasm = (Module._ts_node_has_error_wasm =
									function () {
										return (_ts_node_has_error_wasm =
											Module._ts_node_has_error_wasm =
												Module.asm.ts_node_has_error_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_is_error_wasm = (Module._ts_node_is_error_wasm =
									function () {
										return (_ts_node_is_error_wasm =
											Module._ts_node_is_error_wasm =
												Module.asm.ts_node_is_error_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_is_missing_wasm = (Module._ts_node_is_missing_wasm =
									function () {
										return (_ts_node_is_missing_wasm =
											Module._ts_node_is_missing_wasm =
												Module.asm.ts_node_is_missing_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_is_extra_wasm = (Module._ts_node_is_extra_wasm =
									function () {
										return (_ts_node_is_extra_wasm =
											Module._ts_node_is_extra_wasm =
												Module.asm.ts_node_is_extra_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_parse_state_wasm = (Module._ts_node_parse_state_wasm =
									function () {
										return (_ts_node_parse_state_wasm =
											Module._ts_node_parse_state_wasm =
												Module.asm.ts_node_parse_state_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_node_next_parse_state_wasm =
									(Module._ts_node_next_parse_state_wasm = function () {
										return (_ts_node_next_parse_state_wasm =
											Module._ts_node_next_parse_state_wasm =
												Module.asm.ts_node_next_parse_state_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_query_matches_wasm = (Module._ts_query_matches_wasm =
									function () {
										return (_ts_query_matches_wasm =
											Module._ts_query_matches_wasm =
												Module.asm.ts_query_matches_wasm).apply(
											null,
											arguments
										);
									}),
								_ts_query_captures_wasm = (Module._ts_query_captures_wasm =
									function () {
										return (_ts_query_captures_wasm =
											Module._ts_query_captures_wasm =
												Module.asm.ts_query_captures_wasm).apply(
											null,
											arguments
										);
									}),
								___errno_location = function () {
									return (___errno_location =
										Module.asm.__errno_location).apply(null, arguments);
								},
								_iswdigit = (Module._iswdigit = function () {
									return (_iswdigit = Module._iswdigit =
										Module.asm.iswdigit).apply(null, arguments);
								}),
								_iswalpha = (Module._iswalpha = function () {
									return (_iswalpha = Module._iswalpha =
										Module.asm.iswalpha).apply(null, arguments);
								}),
								_iswblank = (Module._iswblank = function () {
									return (_iswblank = Module._iswblank =
										Module.asm.iswblank).apply(null, arguments);
								}),
								_iswlower = (Module._iswlower = function () {
									return (_iswlower = Module._iswlower =
										Module.asm.iswlower).apply(null, arguments);
								}),
								_iswupper = (Module._iswupper = function () {
									return (_iswupper = Module._iswupper =
										Module.asm.iswupper).apply(null, arguments);
								}),
								_iswxdigit = (Module._iswxdigit = function () {
									return (_iswxdigit = Module._iswxdigit =
										Module.asm.iswxdigit).apply(null, arguments);
								}),
								_memchr = (Module._memchr = function () {
									return (_memchr = Module._memchr = Module.asm.memchr).apply(
										null,
										arguments
									);
								}),
								_strlen = (Module._strlen = function () {
									return (_strlen = Module._strlen = Module.asm.strlen).apply(
										null,
										arguments
									);
								}),
								_strcmp = (Module._strcmp = function () {
									return (_strcmp = Module._strcmp = Module.asm.strcmp).apply(
										null,
										arguments
									);
								}),
								_strncpy = (Module._strncpy = function () {
									return (_strncpy = Module._strncpy =
										Module.asm.strncpy).apply(null, arguments);
								}),
								_towlower = (Module._towlower = function () {
									return (_towlower = Module._towlower =
										Module.asm.towlower).apply(null, arguments);
								}),
								_towupper = (Module._towupper = function () {
									return (_towupper = Module._towupper =
										Module.asm.towupper).apply(null, arguments);
								}),
								_setThrew = function () {
									return (_setThrew = Module.asm.setThrew).apply(
										null,
										arguments
									);
								},
								stackSave = function () {
									return (stackSave = Module.asm.stackSave).apply(
										null,
										arguments
									);
								},
								stackRestore = function () {
									return (stackRestore = Module.asm.stackRestore).apply(
										null,
										arguments
									);
								},
								stackAlloc = function () {
									return (stackAlloc = Module.asm.stackAlloc).apply(
										null,
										arguments
									);
								},
								dynCall_jiji = (Module.dynCall_jiji = function () {
									return (dynCall_jiji = Module.dynCall_jiji =
										Module.asm.dynCall_jiji).apply(null, arguments);
								}),
								_orig$ts_parser_timeout_micros =
									(Module._orig$ts_parser_timeout_micros = function () {
										return (_orig$ts_parser_timeout_micros =
											Module._orig$ts_parser_timeout_micros =
												Module.asm.orig$ts_parser_timeout_micros).apply(
											null,
											arguments
										);
									}),
								_orig$ts_parser_set_timeout_micros =
									(Module._orig$ts_parser_set_timeout_micros = function () {
										return (_orig$ts_parser_set_timeout_micros =
											Module._orig$ts_parser_set_timeout_micros =
												Module.asm.orig$ts_parser_set_timeout_micros).apply(
											null,
											arguments
										);
									}),
								calledRun;
							function callMain(e = []) {
								var t = resolveGlobalSymbol("main").sym;
								if (t) {
									e.unshift(thisProgram);
									var r = e.length,
										_ = stackAlloc(4 * (r + 1)),
										s = _ >> 2;
									e.forEach((e) => {
										HEAP32[s++] = stringToUTF8OnStack(e);
									}),
										(HEAP32[s] = 0);
									try {
										var n = t(r, _);
										return exitJS(n, !0), n;
									} catch (e) {
										return handleException(e);
									}
								}
							}
							(Module.AsciiToString = AsciiToString),
								(Module.stringToUTF16 = stringToUTF16),
								(dependenciesFulfilled = function e() {
									calledRun || run(), calledRun || (dependenciesFulfilled = e);
								});
							var dylibsLoaded = !1;
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
									(!dylibsLoaded &&
										(loadDylibs(), (dylibsLoaded = !0), runDependencies > 0)) ||
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
							if ((LDSO.init(), Module.preInit))
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
								SIZE_OF_CURSOR = 3 * SIZE_OF_INT,
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
											const r = C._ts_language_version(t);
											if (r < MIN_COMPATIBLE_VERSION || VERSION < r)
												throw new Error(
													`Incompatible language version ${r}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${VERSION}.`
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
								parse(e, t, r) {
									if ("string" == typeof e)
										currentParseCallback = (t, r) => e.slice(t);
									else {
										if ("function" != typeof e)
											throw new Error(
												"Argument must be a string or a function"
											);
										currentParseCallback = e;
									}
									this.logCallback
										? ((currentLogCallback = this.logCallback),
										  C._ts_parser_enable_logger_wasm(this[0], 1))
										: ((currentLogCallback = null),
										  C._ts_parser_enable_logger_wasm(this[0], 0));
									let _ = 0,
										s = 0;
									if (r && r.includedRanges) {
										(_ = r.includedRanges.length),
											(s = C._calloc(_, SIZE_OF_RANGE));
										let e = s;
										for (let t = 0; t < _; t++)
											marshalRange(e, r.includedRanges[t]),
												(e += SIZE_OF_RANGE);
									}
									const n = C._ts_parser_parse_wasm(
										this[0],
										this[1],
										t ? t[0] : 0,
										s,
										_
									);
									if (!n)
										throw (
											((currentParseCallback = null),
											(currentLogCallback = null),
											new Error("Parsing failed"))
										);
									const a = new Tree(
										INTERNAL,
										n,
										this.language,
										currentParseCallback
									);
									return (
										(currentParseCallback = null),
										(currentLogCallback = null),
										a
									);
								}
								reset() {
									C._ts_parser_reset(this[0]);
								}
								getIncludedRanges() {
									C._ts_parser_included_ranges_wasm(this[0]);
									const e = getValue(TRANSFER_BUFFER, "i32"),
										t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										r = new Array(e);
									if (e > 0) {
										let _ = t;
										for (let t = 0; t < e; t++)
											(r[t] = unmarshalRange(_)), (_ += SIZE_OF_RANGE);
										C._free(t);
									}
									return r;
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
								constructor(e, t, r, _) {
									assertInternal(e),
										(this[0] = t),
										(this.language = r),
										(this.textCallback = _);
								}
								copy() {
									const e = C._ts_tree_copy(this[0]);
									return new Tree(
										INTERNAL,
										e,
										this.language,
										this.textCallback
									);
								}
								delete() {
									C._ts_tree_delete(this[0]), (this[0] = 0);
								}
								edit(e) {
									marshalEdit(e), C._ts_tree_edit_wasm(this[0]);
								}
								get rootNode() {
									return (
										C._ts_tree_root_node_wasm(this[0]), unmarshalNode(this)
									);
								}
								rootNodeWithOffset(e, t) {
									const r = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										setValue(r, e, "i32"),
										marshalPoint(r + SIZE_OF_INT, t),
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
										r = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										_ = new Array(t);
									if (t > 0) {
										let e = r;
										for (let r = 0; r < t; r++)
											(_[r] = unmarshalRange(e)), (e += SIZE_OF_RANGE);
										C._free(r);
									}
									return _;
								}
								getIncludedRanges() {
									C._ts_tree_included_ranges_wasm(this[0]);
									const e = getValue(TRANSFER_BUFFER, "i32"),
										t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										r = new Array(e);
									if (e > 0) {
										let _ = t;
										for (let t = 0; t < e; t++)
											(r[t] = unmarshalRange(_)), (_ += SIZE_OF_RANGE);
										C._free(t);
									}
									return r;
								}
							}
							class Node {
								constructor(e, t) {
									assertInternal(e), (this.tree = t);
								}
								get typeId() {
									return (
										marshalNode(this), C._ts_node_symbol_wasm(this.tree[0])
									);
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
									if (-1 !== t) return this.childForFieldId(t);
								}
								fieldNameForChild(e) {
									marshalNode(this);
									const t = C._ts_node_field_name_for_child_wasm(
										this.tree[0],
										e
									);
									if (!t) return null;
									return AsciiToString(t);
								}
								childrenForFieldName(e) {
									const t = this.tree.language.fields.indexOf(e);
									if (-1 !== t && 0 !== t) return this.childrenForFieldId(t);
								}
								childrenForFieldId(e) {
									marshalNode(this),
										C._ts_node_children_by_field_id_wasm(this.tree[0], e);
									const t = getValue(TRANSFER_BUFFER, "i32"),
										r = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										_ = new Array(t);
									if (t > 0) {
										let e = r;
										for (let r = 0; r < t; r++)
											(_[r] = unmarshalNode(this.tree, e)), (e += SIZE_OF_NODE);
										C._free(r);
									}
									return _;
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
											let r = t;
											for (let t = 0; t < e; t++)
												(this._children[t] = unmarshalNode(this.tree, r)),
													(r += SIZE_OF_NODE);
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
											let r = t;
											for (let t = 0; t < e; t++)
												(this._namedChildren[t] = unmarshalNode(this.tree, r)),
													(r += SIZE_OF_NODE);
											C._free(t);
										}
									}
									return this._namedChildren;
								}
								descendantsOfType(e, t, r) {
									Array.isArray(e) || (e = [e]),
										t || (t = ZERO_POINT),
										r || (r = ZERO_POINT);
									const _ = [],
										s = this.tree.language.types;
									for (let t = 0, r = s.length; t < r; t++)
										e.includes(s[t]) && _.push(t);
									const n = C._malloc(SIZE_OF_INT * _.length);
									for (let e = 0, t = _.length; e < t; e++)
										setValue(n + e * SIZE_OF_INT, _[e], "i32");
									marshalNode(this),
										C._ts_node_descendants_of_type_wasm(
											this.tree[0],
											n,
											_.length,
											t.row,
											t.column,
											r.row,
											r.column
										);
									const a = getValue(TRANSFER_BUFFER, "i32"),
										o = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										l = new Array(a);
									if (a > 0) {
										let e = o;
										for (let t = 0; t < a; t++)
											(l[t] = unmarshalNode(this.tree, e)), (e += SIZE_OF_NODE);
									}
									return C._free(o), C._free(n), l;
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
									const r = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										setValue(r, e, "i32"),
										setValue(r + SIZE_OF_INT, t, "i32"),
										C._ts_node_descendant_for_index_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								namedDescendantForIndex(e, t = e) {
									if ("number" != typeof e || "number" != typeof t)
										throw new Error("Arguments must be numbers");
									marshalNode(this);
									const r = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										setValue(r, e, "i32"),
										setValue(r + SIZE_OF_INT, t, "i32"),
										C._ts_node_named_descendant_for_index_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								descendantForPosition(e, t = e) {
									if (!isPoint(e) || !isPoint(t))
										throw new Error("Arguments must be {row, column} objects");
									marshalNode(this);
									const r = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										marshalPoint(r, e),
										marshalPoint(r + SIZE_OF_POINT, t),
										C._ts_node_descendant_for_position_wasm(this.tree[0]),
										unmarshalNode(this.tree)
									);
								}
								namedDescendantForPosition(e, t = e) {
									if (!isPoint(e) || !isPoint(t))
										throw new Error("Arguments must be {row, column} objects");
									marshalNode(this);
									const r = TRANSFER_BUFFER + SIZE_OF_NODE;
									return (
										marshalPoint(r, e),
										marshalPoint(r + SIZE_OF_POINT, t),
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
											C._ts_tree_cursor_current_node_is_missing_wasm(
												this.tree[0]
											)
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
										C._ts_tree_cursor_current_descendant_index_wasm(
											this.tree[0]
										)
									);
								}
								gotoFirstChild() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_goto_first_child_wasm(
										this.tree[0]
									);
									return unmarshalTreeCursor(this), 1 === e;
								}
								gotoLastChild() {
									marshalTreeCursor(this);
									const e = C._ts_tree_cursor_goto_last_child_wasm(
										this.tree[0]
									);
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
									const t =
										C._ts_tree_cursor_goto_first_child_for_position_wasm(
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
									const r = lengthBytesUTF8(e),
										_ = C._malloc(r + 1);
									stringToUTF8(e, _, r + 1);
									const s = C._ts_language_symbol_for_name(this[0], _, r, t);
									return C._free(_), s || null;
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
									if (t) return new LookaheadIterable(INTERNAL, t, this);
								}
								query(e) {
									const t = lengthBytesUTF8(e),
										r = C._malloc(t + 1);
									stringToUTF8(e, r, t + 1);
									const _ = C._ts_query_new(
										this[0],
										r,
										t,
										TRANSFER_BUFFER,
										TRANSFER_BUFFER + SIZE_OF_INT
									);
									if (!_) {
										const t = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
											_ = UTF8ToString(
												r,
												getValue(TRANSFER_BUFFER, "i32")
											).length,
											s = e.substr(_, 100).split("\n")[0];
										let n,
											a = s.match(QUERY_WORD_REGEX)[0];
										switch (t) {
											case 2:
												n = new RangeError(`Bad node name '${a}'`);
												break;
											case 3:
												n = new RangeError(`Bad field name '${a}'`);
												break;
											case 4:
												n = new RangeError(`Bad capture name @${a}`);
												break;
											case 5:
												(n = new TypeError(
													`Bad pattern structure at offset ${_}: '${s}'...`
												)),
													(a = "");
												break;
											default:
												(n = new SyntaxError(
													`Bad syntax at offset ${_}: '${s}'...`
												)),
													(a = "");
										}
										throw ((n.index = _), (n.length = a.length), C._free(r), n);
									}
									const s = C._ts_query_string_count(_),
										n = C._ts_query_capture_count(_),
										a = C._ts_query_pattern_count(_),
										o = new Array(n),
										l = new Array(s);
									for (let e = 0; e < n; e++) {
										const t = C._ts_query_capture_name_for_id(
												_,
												e,
												TRANSFER_BUFFER
											),
											r = getValue(TRANSFER_BUFFER, "i32");
										o[e] = UTF8ToString(t, r);
									}
									for (let e = 0; e < s; e++) {
										const t = C._ts_query_string_value_for_id(
												_,
												e,
												TRANSFER_BUFFER
											),
											r = getValue(TRANSFER_BUFFER, "i32");
										l[e] = UTF8ToString(t, r);
									}
									const i = new Array(a),
										u = new Array(a),
										d = new Array(a),
										m = new Array(a),
										c = new Array(a);
									for (let e = 0; e < a; e++) {
										const t = C._ts_query_predicates_for_pattern(
												_,
												e,
												TRANSFER_BUFFER
											),
											r = getValue(TRANSFER_BUFFER, "i32");
										(m[e] = []), (c[e] = []);
										const s = [];
										let n = t;
										for (let t = 0; t < r; t++) {
											const t = getValue(n, "i32");
											n += SIZE_OF_INT;
											const r = getValue(n, "i32");
											if (
												((n += SIZE_OF_INT), t === PREDICATE_STEP_TYPE_CAPTURE)
											)
												s.push({ type: "capture", name: o[r] });
											else if (t === PREDICATE_STEP_TYPE_STRING)
												s.push({ type: "string", value: l[r] });
											else if (s.length > 0) {
												if ("string" !== s[0].type)
													throw new Error(
														"Predicates must begin with a literal value"
													);
												const t = s[0].value;
												let r,
													_ = !0,
													n = !0;
												switch (t) {
													case "any-not-eq?":
													case "not-eq?":
														_ = !1;
													case "any-eq?":
													case "eq?":
														if (3 !== s.length)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected 2, got ${
																	s.length - 1
																}`
															);
														if ("capture" !== s[1].type)
															throw new Error(
																`First argument of \`#${t}\` predicate must be a capture. Got "${s[1].value}"`
															);
														if (
															((n = !t.startsWith("any-")),
															"capture" === s[2].type)
														) {
															const t = s[1].name,
																r = s[2].name;
															c[e].push(function (e) {
																const s = [],
																	a = [];
																for (const _ of e)
																	_.name === t && s.push(_.node),
																		_.name === r && a.push(_.node);
																const o = (e, t, r) =>
																	r ? e.text === t.text : e.text !== t.text;
																return n
																	? s.every((e) => a.some((t) => o(e, t, _)))
																	: s.some((e) => a.some((t) => o(e, t, _)));
															});
														} else {
															r = s[1].name;
															const t = s[2].value,
																a = (e) => e.text === t,
																o = (e) => e.text !== t;
															c[e].push(function (e) {
																const t = [];
																for (const _ of e)
																	_.name === r && t.push(_.node);
																const s = _ ? a : o;
																return n ? t.every(s) : t.some(s);
															});
														}
														break;
													case "any-not-match?":
													case "not-match?":
														_ = !1;
													case "any-match?":
													case "match?":
														if (3 !== s.length)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected 2, got ${
																	s.length - 1
																}.`
															);
														if ("capture" !== s[1].type)
															throw new Error(
																`First argument of \`#${t}\` predicate must be a capture. Got "${s[1].value}".`
															);
														if ("string" !== s[2].type)
															throw new Error(
																`Second argument of \`#${t}\` predicate must be a string. Got @${s[2].value}.`
															);
														r = s[1].name;
														const a = new RegExp(s[2].value);
														(n = !t.startsWith("any-")),
															c[e].push(function (e) {
																const t = [];
																for (const _ of e)
																	_.name === r && t.push(_.node.text);
																const s = (e, t) =>
																	t ? a.test(e) : !a.test(e);
																return 0 === t.length
																	? !_
																	: n
																	? t.every((e) => s(e, _))
																	: t.some((e) => s(e, _));
															});
														break;
													case "set!":
														if (s.length < 2 || s.length > 3)
															throw new Error(
																`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${
																	s.length - 1
																}.`
															);
														if (s.some((e) => "string" !== e.type))
															throw new Error(
																'Arguments to `#set!` predicate must be a strings.".'
															);
														i[e] || (i[e] = {}),
															(i[e][s[1].value] = s[2] ? s[2].value : null);
														break;
													case "is?":
													case "is-not?":
														if (s.length < 2 || s.length > 3)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected 1 or 2. Got ${
																	s.length - 1
																}.`
															);
														if (s.some((e) => "string" !== e.type))
															throw new Error(
																`Arguments to \`#${t}\` predicate must be a strings.".`
															);
														const o = "is?" === t ? u : d;
														o[e] || (o[e] = {}),
															(o[e][s[1].value] = s[2] ? s[2].value : null);
														break;
													case "not-any-of?":
														_ = !1;
													case "any-of?":
														if (s.length < 2)
															throw new Error(
																`Wrong number of arguments to \`#${t}\` predicate. Expected at least 1. Got ${
																	s.length - 1
																}.`
															);
														if ("capture" !== s[1].type)
															throw new Error(
																`First argument of \`#${t}\` predicate must be a capture. Got "${s[1].value}".`
															);
														for (let e = 2; e < s.length; e++)
															if ("string" !== s[e].type)
																throw new Error(
																	`Arguments to \`#${t}\` predicate must be a strings.".`
																);
														r = s[1].name;
														const l = s.slice(2).map((e) => e.value);
														c[e].push(function (e) {
															const t = [];
															for (const _ of e)
																_.name === r && t.push(_.node.text);
															return 0 === t.length
																? !_
																: t.every((e) => l.includes(e)) === _;
														});
														break;
													default:
														m[e].push({ operator: t, operands: s.slice(1) });
												}
												s.length = 0;
											}
										}
										Object.freeze(i[e]),
											Object.freeze(u[e]),
											Object.freeze(d[e]);
									}
									return (
										C._free(r),
										new Query(
											INTERNAL,
											_,
											o,
											c,
											m,
											Object.freeze(i),
											Object.freeze(u),
											Object.freeze(d)
										)
									);
								}
								static load(e) {
									let t;
									if (e instanceof Uint8Array) t = Promise.resolve(e);
									else {
										const r = e;
										if (
											"undefined" != typeof process &&
											process.versions &&
											process.versions.node
										) {
											const e = require("fs");
											t = Promise.resolve(e.readFileSync(r));
										} else
											t = fetch(r).then((e) =>
												e.arrayBuffer().then((t) => {
													if (e.ok) return new Uint8Array(t);
													{
														const r = new TextDecoder("utf-8").decode(t);
														throw new Error(
															`Language.load failed with status ${e.status}.\n\n${r}`
														);
													}
												})
											);
									}
									return t
										.then((e) => loadWebAssemblyModule(e, { loadAsync: !0 }))
										.then((e) => {
											const t = Object.keys(e),
												r = t.find(
													(e) =>
														LANGUAGE_FUNCTION_REGEX.test(e) &&
														!e.includes("external_scanner_")
												);
											r ||
												console.log(
													`Couldn't find language function in WASM file. Symbols:\n${JSON.stringify(
														t,
														null,
														2
													)}`
												);
											const _ = e[r]();
											return new Language(INTERNAL, _);
										});
								}
							}
							class LookaheadIterable {
								constructor(e, t, r) {
									assertInternal(e), (this[0] = t), (this.language = r);
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
								constructor(e, t, r, _, s, n, a, o) {
									assertInternal(e),
										(this[0] = t),
										(this.captureNames = r),
										(this.textPredicates = _),
										(this.predicates = s),
										(this.setProperties = n),
										(this.assertedProperties = a),
										(this.refutedProperties = o),
										(this.exceededMatchLimit = !1);
								}
								delete() {
									C._ts_query_delete(this[0]), (this[0] = 0);
								}
								matches(
									e,
									{
										startPosition: t = ZERO_POINT,
										endPosition: r = ZERO_POINT,
										startIndex: _ = 0,
										endIndex: s = 0,
										matchLimit: n = 4294967295,
										maxStartDepth: a = 4294967295,
									} = {}
								) {
									if ("number" != typeof n)
										throw new Error("Arguments must be numbers");
									marshalNode(e),
										C._ts_query_matches_wasm(
											this[0],
											e.tree[0],
											t.row,
											t.column,
											r.row,
											r.column,
											_,
											s,
											n,
											a
										);
									const o = getValue(TRANSFER_BUFFER, "i32"),
										l = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										i = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32"),
										u = new Array(o);
									this.exceededMatchLimit = !!i;
									let d = 0,
										m = l;
									for (let t = 0; t < o; t++) {
										const t = getValue(m, "i32");
										m += SIZE_OF_INT;
										const r = getValue(m, "i32");
										m += SIZE_OF_INT;
										const _ = new Array(r);
										if (
											((m = unmarshalCaptures(this, e.tree, m, _)),
											this.textPredicates[t].every((e) => e(_)))
										) {
											u[d] = { pattern: t, captures: _ };
											const e = this.setProperties[t];
											e && (u[d].setProperties = e);
											const r = this.assertedProperties[t];
											r && (u[d].assertedProperties = r);
											const s = this.refutedProperties[t];
											s && (u[d].refutedProperties = s), d++;
										}
									}
									return (u.length = d), C._free(l), u;
								}
								captures(
									e,
									{
										startPosition: t = ZERO_POINT,
										endPosition: r = ZERO_POINT,
										startIndex: _ = 0,
										endIndex: s = 0,
										matchLimit: n = 4294967295,
										maxStartDepth: a = 4294967295,
									} = {}
								) {
									if ("number" != typeof n)
										throw new Error("Arguments must be numbers");
									marshalNode(e),
										C._ts_query_captures_wasm(
											this[0],
											e.tree[0],
											t.row,
											t.column,
											r.row,
											r.column,
											_,
											s,
											n,
											a
										);
									const o = getValue(TRANSFER_BUFFER, "i32"),
										l = getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32"),
										i = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32"),
										u = [];
									this.exceededMatchLimit = !!i;
									const d = [];
									let m = l;
									for (let t = 0; t < o; t++) {
										const t = getValue(m, "i32");
										m += SIZE_OF_INT;
										const r = getValue(m, "i32");
										m += SIZE_OF_INT;
										const _ = getValue(m, "i32");
										if (
											((m += SIZE_OF_INT),
											(d.length = r),
											(m = unmarshalCaptures(this, e.tree, m, d)),
											this.textPredicates[t].every((e) => e(d)))
										) {
											const e = d[_],
												r = this.setProperties[t];
											r && (e.setProperties = r);
											const s = this.assertedProperties[t];
											s && (e.assertedProperties = s);
											const n = this.refutedProperties[t];
											n && (e.refutedProperties = n), u.push(e);
										}
									}
									return C._free(l), u;
								}
								predicatesForPattern(e) {
									return this.predicates[e];
								}
								disableCapture(e) {
									const t = lengthBytesUTF8(e),
										r = C._malloc(t + 1);
									stringToUTF8(e, r, t + 1),
										C._ts_query_disable_capture(this[0], r, t),
										C._free(r);
								}
								didExceedMatchLimit() {
									return this.exceededMatchLimit;
								}
							}
							function getText(e, t, r) {
								const _ = r - t;
								let s = e.textCallback(t, null, r);
								for (t += s.length; t < r; ) {
									const _ = e.textCallback(t, null, r);
									if (!(_ && _.length > 0)) break;
									(t += _.length), (s += _);
								}
								return t > r && (s = s.slice(0, _)), s;
							}
							function unmarshalCaptures(e, t, r, _) {
								for (let s = 0, n = _.length; s < n; s++) {
									const n = getValue(r, "i32"),
										a = unmarshalNode(t, (r += SIZE_OF_INT));
									(r += SIZE_OF_NODE),
										(_[s] = { name: e.captureNames[n], node: a });
								}
								return r;
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
								const r = getValue(t, "i32");
								if (0 === r) return null;
								const _ = getValue((t += SIZE_OF_INT), "i32"),
									s = getValue((t += SIZE_OF_INT), "i32"),
									n = getValue((t += SIZE_OF_INT), "i32"),
									a = getValue((t += SIZE_OF_INT), "i32"),
									o = new Node(INTERNAL, e);
								return (
									(o.id = r),
									(o.startIndex = _),
									(o.startPosition = { row: s, column: n }),
									(o[0] = a),
									o
								);
							}
							function marshalTreeCursor(e, t = TRANSFER_BUFFER) {
								setValue(t + 0 * SIZE_OF_INT, e[0], "i32"),
									setValue(t + 1 * SIZE_OF_INT, e[1], "i32"),
									setValue(t + 2 * SIZE_OF_INT, e[2], "i32");
							}
							function unmarshalTreeCursor(e) {
								(e[0] = getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32")),
									(e[1] = getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32")),
									(e[2] = getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32"));
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
});
