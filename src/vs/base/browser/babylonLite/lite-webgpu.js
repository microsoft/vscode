/*! @license @babylonjs/lite 1.38.1 | Apache-2.0 | https://github.com/BabylonJS/Babylon-Lite */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/lite-error.js
function ThrowLiteError(code, ...args) {
  const error = new Error(_decode?.(code, args) ?? `#${code}`);
  error.lite = args;
  throw error;
}
var _decode;
var init_lite_error = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/lite-error.js"() {
    _decode = null;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/typed-arrays.js
var F32, F64, U16, U8;
var init_typed_arrays = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/typed-arrays.js"() {
    F32 = Float32Array;
    F64 = Float64Array;
    U16 = Uint16Array;
    U8 = Uint8Array;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/math/_matrix-allocator.js
function _setHpmAllocator(allocate) {
  _allocate = allocate;
}
var _allocate;
var init_matrix_allocator = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/math/_matrix-allocator.js"() {
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/gpu-flags.js
var TU, BU, SS, CW;
var init_gpu_flags = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/gpu-flags.js"() {
    TU = globalThis.GPUTextureUsage;
    BU = globalThis.GPUBufferUsage;
    SS = globalThis.GPUShaderStage;
    CW = globalThis.GPUColorWrite;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/render-target.js
function resolveDirectRenderTargetSize(descriptor) {
  const size = descriptor.size;
  return "canvas" in size ? size.canvas : size;
}
function _createDirectRenderTarget(descriptor) {
  return {
    _descriptor: descriptor,
    _resolveSize: resolveDirectRenderTargetSize,
    _colorTexture: null,
    _colorView: null,
    _depthTexture: null,
    _depthView: null,
    _width: 0,
    _height: 0
  };
}
var init_render_target = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/render-target.js"() {
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/version.js
var VERSION, _ENGINE_TAG;
var init_version = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/version.js"() {
    VERSION = "1.38.1";
    _ENGINE_TAG = `Babylon Lite v${VERSION}`;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/surface.js
function isDomCanvas(canvas) {
  return "clientWidth" in canvas;
}
function toSrgbFormat(format) {
  return format.endsWith("-srgb") ? format : `${format}-srgb`;
}
function _buildSurface(engine, canvas, options) {
  const context = canvas.getContext("webgpu");
  if (!context) ThrowLiteError(62);
  if (isDomCanvas(canvas)) canvas.setAttribute("data-engine", _ENGINE_TAG);
  const configureFormat = options?.format ?? navigator.gpu.getPreferredCanvasFormat();
  const renderFormat = options?.srgb ? toSrgbFormat(configureFormat) : configureFormat;
  const alphaMode = options?.alphaMode ?? "opaque";
  context.configure({
    device: engine._device,
    format: configureFormat,
    alphaMode,
    viewFormats: [renderFormat]
  });
  const msaaSamples = options?.msaaSamples === 1 ? 1 : 4;
  const scRT = _createDirectRenderTarget({
    lbl: "swapchain",
    format: renderFormat,
    samples: 1,
    size: {
      width: 0,
      height: 0
    }
  });
  scRT._eager = true;
  return {
    engine,
    canvas,
    format: renderFormat,
    msaaSamples,
    scRT,
    maxDevicePixelRatio: options?.maxDevicePixelRatio ?? Infinity,
    _uniqueId: _nextSurfaceId++,
    _context: context,
    _configureFormat: configureFormat,
    _alphaMode: alphaMode,
    _renderingContexts: []
  };
}
function _refreshScRT(surface) {
  const tex = surface._context.getCurrentTexture();
  const swap = surface.scRT;
  swap._colorTexture = tex;
  swap._colorView = tex.createView({ format: surface.format });
  swap._width = tex.width;
  swap._height = tex.height;
}
function resizeSurface(surface) {
  const canvas = surface.canvas;
  if (!isDomCanvas(canvas)) return;
  const clientWidth = surface._w ?? canvas.clientWidth;
  const clientHeight = surface._h ?? canvas.clientHeight;
  if (!(clientWidth > 0 && clientHeight > 0)) return;
  const scale = Math.min(globalThis.devicePixelRatio || 1, surface.maxDevicePixelRatio);
  setSurfaceSize(surface, clientWidth * scale | 0, clientHeight * scale | 0);
}
function setSurfaceSize(surface, widthPx, heightPx) {
  const canvas = surface.canvas;
  const w = widthPx | 0;
  const h = heightPx | 0;
  if (!(w > 0 && h > 0)) return;
  if (w === canvas.width && h === canvas.height) return;
  canvas.width = w;
  canvas.height = h;
  surface.scRT._width = w;
  surface.scRT._height = h;
  for (const c of surface._renderingContexts) c._resize?.();
}
var _nextSurfaceId;
var init_surface = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/surface.js"() {
    init_lite_error();
    init_render_target();
    init_version();
    _nextSurfaceId = 1;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/math/_mat4-storage-f64.js
var mat4_storage_f64_exports = {};
__export(mat4_storage_f64_exports, {
  MAT4_STORAGE_F64_BUILD_TAG: () => MAT4_STORAGE_F64_BUILD_TAG,
  allocateF64Mat4: () => allocateF64Mat4
});
function allocateF64Mat4() {
  return new F64(16);
}
var MAT4_STORAGE_F64_BUILD_TAG;
var init_mat4_storage_f64 = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/math/_mat4-storage-f64.js"() {
    init_typed_arrays();
    MAT4_STORAGE_F64_BUILD_TAG = "@@MAT4_STORAGE_F64@@";
    allocateF64Mat4[MAT4_STORAGE_F64_BUILD_TAG] = true;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/light/types.js
var MAX_LIGHTS;
var init_types = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/light/types.js"() {
    MAX_LIGHTS = 16;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/large-world/floating-origin.js
var floating_origin_exports = {};
__export(floating_origin_exports, {
  applyLightFoOffset: () => applyLightFoOffset,
  getFloatingOriginOffset: () => getFloatingOriginOffset,
  lightFoVersion: () => lightFoVersion,
  wrapRenderableForFO: () => wrapRenderableForFO
});
function getFloatingOriginOffset(scene) {
  const cam = scene.camera;
  if (!cam) return {
    x: 0,
    y: 0,
    z: 0
  };
  const w = cam.worldMatrix;
  return {
    x: w[12],
    y: w[13],
    z: w[14]
  };
}
function lightFoVersion(scene) {
  const cam = scene.camera;
  const version = cam ? cam.worldMatrixVersion : -1;
  const keys = _lightFoKeys ??= /* @__PURE__ */ new WeakMap();
  let key = keys.get(scene);
  if (!key) keys.set(scene, key = [
    cam,
    version,
    0
  ]);
  else if (key[0] !== cam || key[1] !== version) {
    key[0] = cam;
    key[1] = version;
    key[2]++;
  }
  return key[2];
}
function applyLightFoOffset(data, scene) {
  const w = scene.camera?.worldMatrix;
  if (!w) return;
  const ox = w[12];
  const oy = w[13];
  const oz = w[14];
  let count = 0;
  for (const light of scene.lights) {
    if (count >= MAX_LIGHTS) break;
    if (!light._writeLightUbo) continue;
    const o = 4 + count * 16;
    const type = data[o + 3];
    if (type !== 1 && type !== 3) {
      const lw = light.worldMatrix;
      data[o] = lw[12] - ox;
      data[o + 1] = lw[13] - oy;
      data[o + 2] = lw[14] - oz;
    }
    count++;
  }
}
function wrapRenderableForFO(inner, scene, invalidate) {
  let _lastCameraVersion = -1;
  let _lastCamera;
  return () => {
    const cam = scene.camera;
    const cv = cam ? cam.worldMatrixVersion : -1;
    if (cv !== _lastCameraVersion || cam !== _lastCamera) {
      invalidate();
      _lastCameraVersion = cv;
      _lastCamera = cam;
    }
    inner();
  };
}
var _lightFoKeys;
var init_floating_origin = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/large-world/floating-origin.js"() {
    init_types();
    _lightFoKeys = null;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/large-world/pack-mat4-with-offset.js
var pack_mat4_with_offset_exports = {};
__export(pack_mat4_with_offset_exports, {
  makePackMeshWorld: () => makePackMeshWorld,
  packMat4IntoF32WithOffset: () => packMat4IntoF32WithOffset
});
function packMat4IntoF32WithOffset(view, mat, offsetFloats, srcOffsetFloats, offsetX, offsetY, offsetZ) {
  const src = mat;
  const s = srcOffsetFloats;
  const o = offsetFloats;
  view[o + 0] = src[s + 0];
  view[o + 1] = src[s + 1];
  view[o + 2] = src[s + 2];
  view[o + 3] = src[s + 3];
  view[o + 4] = src[s + 4];
  view[o + 5] = src[s + 5];
  view[o + 6] = src[s + 6];
  view[o + 7] = src[s + 7];
  view[o + 8] = src[s + 8];
  view[o + 9] = src[s + 9];
  view[o + 10] = src[s + 10];
  view[o + 11] = src[s + 11];
  view[o + 12] = src[s + 12] - offsetX;
  view[o + 13] = src[s + 13] - offsetY;
  view[o + 14] = src[s + 14] - offsetZ;
  view[o + 15] = src[s + 15];
}
function makePackMeshWorld(scene) {
  return (view, mat, offsetFloats, srcOffsetFloats) => {
    const cam = scene.camera;
    if (!cam) {
      packMat4IntoF32WithOffset(view, mat, offsetFloats, srcOffsetFloats, 0, 0, 0);
      return;
    }
    const w = cam.worldMatrix;
    packMat4IntoF32WithOffset(view, mat, offsetFloats, srcOffsetFloats, w[12], w[13], w[14]);
  };
}
var init_pack_mat4_with_offset = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/large-world/pack-mat4-with-offset.js"() {
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/engine.js
function registerRenderingContext(surface, context) {
  if (surface._renderingContexts.indexOf(context) !== -1) return false;
  surface._renderingContexts.push(context);
  return true;
}
function unregisterRenderingContext(surface, context) {
  const list = surface._renderingContexts;
  const i = list.indexOf(context);
  if (i === -1) return false;
  list.splice(i, 1);
  return true;
}
function _getSupportedDeviceFeatures(adapter) {
  return OPTIONAL_DEVICE_FEATURES.filter((feature) => adapter.features.has(feature));
}
async function createEngine(canvas, options) {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
    ..._adapterOptionsHook ? _adapterOptionsHook() : {}
  });
  if (!adapter) ThrowLiteError(50);
  const features = _adapterOptionsHook?.deviceFeatures?.(adapter, options) ?? _getSupportedDeviceFeatures(adapter);
  const device = await adapter.requestDevice({
    requiredFeatures: features,
    requiredLimits: options?.requiredLimits
  });
  /* @__PURE__ */ console.log(`${_ENGINE_TAG} - WebGPU engine`);
  const useHpm = !!options?.useHighPrecisionMatrix;
  const useFO = !!options?.useFloatingOrigin;
  if (useFO && !useHpm) ThrowLiteError(51);
  if (useHpm) {
    const { allocateF64Mat4: allocateF64Mat42 } = await Promise.resolve().then(() => (init_mat4_storage_f64(), mat4_storage_f64_exports));
    _setHpmAllocator(allocateF64Mat42);
  }
  let _wrapRenderableForFO;
  let _makePackMeshWorld;
  let _lightFoVersion;
  let _applyLightFoOffset;
  if (useFO) {
    const [{ wrapRenderableForFO: wrapRenderableForFO2, lightFoVersion: lightFoVersion2, applyLightFoOffset: applyLightFoOffset2 }, { makePackMeshWorld: makePackMeshWorld2 }] = await Promise.all([Promise.resolve().then(() => (init_floating_origin(), floating_origin_exports)), Promise.resolve().then(() => (init_pack_mat4_with_offset(), pack_mat4_with_offset_exports))]);
    _wrapRenderableForFO = wrapRenderableForFO2;
    _makePackMeshWorld = makePackMeshWorld2;
    _lightFoVersion = lightFoVersion2;
    _applyLightFoOffset = applyLightFoOffset2;
  }
  const engine = { _device: device };
  const surfaces = [engine];
  Object.assign(engine, {
    engine,
    surfaces,
    _surfaces: surfaces,
    _device: device,
    _options: options,
    drawCallCount: 0,
    gpuFrameTimeMs: 0,
    useHighPrecisionMatrix: useHpm,
    useFloatingOrigin: useFO,
    _animFrameId: 0,
    _renderFn: null,
    _currentEncoder: void 0,
    _currentDelta: 0,
    _cbs: [],
    _wrapRenderableForFO,
    _makePackMeshWorld,
    _lightFoVersion,
    _applyLightFoOffset
  }, _buildSurface(engine, canvas, options));
  resizeSurface(engine);
  _refreshScRT(engine);
  return engine;
}
function setEngineSize(engine, widthPx, heightPx) {
  setSurfaceSize(engine, widthPx, heightPx);
}
function getRenderTargetSize(surface) {
  const c = surface.canvas;
  return {
    width: c.width,
    height: c.height
  };
}
function stopEngine(engine) {
  if (engine._animFrameId) cancelAnimationFrame(engine._animFrameId);
  engine._animFrameId = 0;
  engine._renderFn = null;
  engine._flushGpuRetirements?.(engine);
}
function renderFrame(engine, delta, surfaces = engine.surfaces) {
  if (surfaces !== engine.surfaces) {
    for (let i = surfaces.length; i--; ) if (surfaces[i].engine !== engine) ThrowLiteError(52);
  }
  _renderFrame(engine, delta, surfaces);
}
function _renderFrame(engine, delta, surfaces = engine._surfaces) {
  let total = 0;
  for (let i = surfaces.length; i--; ) total += surfaces[i]._renderingContexts.length;
  if (!total) {
    engine.drawCallCount = 0;
    return engine._flushGpuRetirements?.(engine);
  }
  const encoder = engine._device.createCommandEncoder({ label: "frame" });
  engine._currentEncoder = encoder;
  engine._currentDelta = delta;
  let submitted = false;
  try {
    engine._gpuTimerBegin?.(encoder);
    total = 0;
    for (let i = 0; i < surfaces.length; i++) {
      const surface = surfaces[i];
      surface._capturePreFrame?.(surface);
      _refreshScRT(surface);
      const ctxs = surface._renderingContexts;
      for (let j = 0; j < ctxs.length; j++) {
        const s = ctxs[j];
        s._update();
        total += s._drawCallsPre + s._record();
      }
    }
    const finalEncoder = engine._currentEncoder;
    for (let i = 0; i < surfaces.length; i++) {
      const surface = surfaces[i];
      surface._captureService?.(surface, finalEncoder);
    }
    engine._gpuTimerEnd?.(finalEncoder);
    engine._cbs[0] = finalEncoder.finish();
    engine._device.queue.submit(engine._cbs);
    submitted = true;
    engine._flushGpuRetirements?.(engine);
    engine.drawCallCount = total;
    engine._gpuTimerResolve?.();
  } finally {
    engine._currentEncoder = void 0;
    engine._finishOptionalFrame?.(submitted);
  }
}
var _adapterOptionsHook, OPTIONAL_DEVICE_FEATURES;
var init_engine = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/engine.js"() {
    init_lite_error();
    init_matrix_allocator();
    init_version();
    init_surface();
    _adapterOptionsHook = null;
    OPTIONAL_DEVICE_FEATURES = [
      "float32-filterable",
      "texture-compression-astc",
      "texture-compression-bc",
      "texture-compression-etc2",
      "texture-compression-unaligned",
      "timestamp-query",
      "primitive-index"
    ];
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/buffer-alignment.js
function align(n, to) {
  return Math.ceil(n / to) * to;
}
var init_buffer_alignment = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/buffer-alignment.js"() {
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/mapped-buffer.js
function createMappedBuffer(engine, data, usage, label) {
  const buffer = engine._device.createBuffer({
    label,
    size: align(Math.max(data.byteLength, 4), 4),
    usage: usage | BU.COPY_DST,
    mappedAtCreation: true
  });
  new U8(buffer.getMappedRange()).set(new U8(data.buffer, data.byteOffset, data.byteLength));
  buffer.unmap();
  return buffer;
}
var init_mapped_buffer = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/mapped-buffer.js"() {
    init_typed_arrays();
    init_gpu_flags();
    init_buffer_alignment();
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/texture-reference-store.js
function getTextureReferenceStore() {
  return _textureReferences ??= /* @__PURE__ */ new WeakMap();
}
var _textureReferences;
var init_texture_reference_store = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/texture-reference-store.js"() {
    _textureReferences = null;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/gpu-texture-acquire.js
function acquireGPUTexture(texture) {
  const references = getTextureReferenceStore();
  references.set(texture, (references.get(texture) ?? 0) + 1);
}
var init_gpu_texture_acquire = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/gpu-texture-acquire.js"() {
    init_texture_reference_store();
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/texture-acquire.js
function acquireTexture(texture) {
  acquireGPUTexture(texture.texture);
}
var init_texture_acquire = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/texture-acquire.js"() {
    init_gpu_texture_acquire();
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/texture-sampler-pool.js
function getOrCreateSampler(engine, descriptor = {}, extraKey = "") {
  const device = engine._device;
  const caches = samplerCaches ??= /* @__PURE__ */ new WeakMap();
  let cache = caches.get(device);
  if (!cache) caches.set(device, cache = /* @__PURE__ */ new Map());
  let key = extraKey;
  for (const property in textureSamplerDefaults) {
    const field = property;
    key += `:${descriptor[field] ?? textureSamplerDefaults[field]}`;
  }
  let sampler = cache.get(key);
  if (!sampler) cache.set(key, sampler = device.createSampler(descriptor));
  return sampler;
}
var samplerCaches, defaultFilter, defaultAddressMode, textureSamplerDefaults;
var init_texture_sampler_pool = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/texture-sampler-pool.js"() {
    samplerCaches = null;
    defaultFilter = "nearest";
    defaultAddressMode = "clamp-to-edge";
    textureSamplerDefaults = {
      minFilter: defaultFilter,
      magFilter: defaultFilter,
      mipmapFilter: defaultFilter,
      addressModeU: defaultAddressMode,
      addressModeV: defaultAddressMode,
      addressModeW: defaultAddressMode,
      maxAnisotropy: 1
    };
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/gpu-resource-retirement.js
function runBatch(batch) {
  runGpuResourceCallbacks(batch.splice(0));
}
function runGpuResourceCallbacks(disposers) {
  for (const retire of disposers) try {
    retire();
  } catch (error) {
    console.error("GPU resource retirement failed.", error);
  }
}
function disposeGpuResourceRetirements(engine) {
  const batch = engine._retirements;
  const inFlight = engine._retiring;
  engine._retirements = null;
  engine._retiring = null;
  if (batch) runBatch(batch);
  inFlight?.forEach(runBatch);
}
var init_gpu_resource_retirement = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/gpu-resource-retirement.js"() {
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/empty-uniform-buffer.js
function createEmptyUniformBuffer(engine, byteLength, label) {
  return engine._device.createBuffer({
    label,
    size: align(byteLength, 16),
    usage: BU.UNIFORM | BU.COPY_DST
  });
}
var init_empty_uniform_buffer = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/resource/empty-uniform-buffer.js"() {
    init_gpu_flags();
    init_buffer_alignment();
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/render/alpha-to-coverage-hook.js
function _getAlphaToCoverageResolver() {
  return _resolver;
}
var _resolver;
var init_alpha_to_coverage_hook = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/render/alpha-to-coverage-hook.js"() {
    _resolver = null;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/shared/sprite-atlas.js
function resolveSpriteFrame(atlas, frame) {
  if (frame < 0 || frame >= atlas.frames.length) ThrowLiteError(818, frame, atlas.frames.length);
  return frame;
}
function disposeSpriteAtlas(atlas) {
  atlas.texture.texture.destroy();
}
var init_sprite_atlas = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/shared/sprite-atlas.js"() {
    init_lite_error();
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/blend-descriptors.js
var _ALPHA_BLEND_STATE;
var init_blend_descriptors = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/blend-descriptors.js"() {
    _ALPHA_BLEND_STATE = {
      color: {
        srcFactor: "src-alpha",
        dstFactor: "one-minus-src-alpha",
        operation: "add"
      },
      alpha: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add"
      }
    };
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-blend.js
var spriteBlendAlpha;
var init_sprite_blend = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-blend.js"() {
    init_blend_descriptors();
    spriteBlendAlpha = {
      _key: "alpha",
      _descriptor: _ALPHA_BLEND_STATE
    };
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-fx-hook.js
function _getSpriteFxHook() {
  return _spriteFxHook;
}
var _spriteFxHook;
var init_sprite_fx_hook = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-fx-hook.js"() {
    _spriteFxHook = null;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-2d.js
function _getSprite2DYSortHook() {
  return _sprite2DYSortHook;
}
function createSprite2DLayer(atlas, opts = {}) {
  const depth = opts.depth ?? "none";
  const blendMode = opts.blendMode ?? spriteBlendAlpha;
  const capacity = Math.max(1, opts.capacity ?? DEFAULT_CAPACITY);
  const view = {
    positionPx: [opts.view?.positionPx?.[0] ?? 0, opts.view?.positionPx?.[1] ?? 0],
    zoom: opts.view?.zoom ?? 1,
    rotation: opts.view?.rotation ?? 0
  };
  const instanceFloatsPerSprite = depth === "none" ? 13 : 14;
  const instanceStrideBytes = instanceFloatsPerSprite * 4;
  const instanceData = new F32(capacity * instanceFloatsPerSprite);
  const layer = {
    _entityType: "sprite-2d-layer",
    atlas,
    depth,
    blendMode,
    opacity: opts.opacity ?? 1,
    visible: opts.visible ?? true,
    order: opts.order ?? 0,
    view,
    pivot: [opts.pivot?.[0] ?? 0.5, opts.pivot?.[1] ?? 0.5],
    layerZ: opts.layerZ ?? 0.5,
    count: 0,
    _capacity: capacity,
    _instanceFloatsPerSprite: instanceFloatsPerSprite,
    _instanceStrideBytes: instanceStrideBytes,
    _instanceData: instanceData,
    _savedSize: new F32(capacity * 2),
    _version: 0,
    _dirtyMin: 0,
    _dirtyMax: 0
  };
  _getSpriteFxHook()?.initLayer(layer, opts);
  return layer;
}
function growCapacity(layer, minCapacity) {
  let cap = layer._capacity;
  while (cap < minCapacity) cap *= 2;
  const next = new F32(cap * layer._instanceFloatsPerSprite);
  next.set(layer._instanceData);
  layer._instanceData = next;
  const nextSaved = new F32(cap * 2);
  nextSaved.set(layer._savedSize);
  layer._savedSize = nextSaved;
  layer._capacity = cap;
}
function _setSprite2DCount(layer, count) {
  layer.count = count;
}
function writeInstance(layer, slotIndex, props, prev) {
  const data = layer._instanceData;
  const base = slotIndex * layer._instanceFloatsPerSprite;
  const savedBase = slotIndex * 2;
  const isAdd = prev === null;
  const frame = props.frame !== void 0 ? layer.atlas.frames[resolveSpriteFrame(layer.atlas, props.frame)] : null;
  const posX = props.positionPx ? props.positionPx[0] : prev[0];
  const posY = props.positionPx ? props.positionPx[1] : prev[1];
  let trueW;
  let trueH;
  if (props.sizePx) {
    trueW = props.sizePx[0];
    trueH = props.sizePx[1];
  } else if (frame) {
    trueW = frame.sourceSizePx[0];
    trueH = frame.sourceSizePx[1];
  } else if (isAdd) {
    trueW = 0;
    trueH = 0;
  } else {
    trueW = layer._savedSize[savedBase];
    trueH = layer._savedSize[savedBase + 1];
  }
  layer._savedSize[savedBase] = trueW;
  layer._savedSize[savedBase + 1] = trueH;
  let visible;
  if (props.visible !== void 0) visible = props.visible;
  else if (isAdd) visible = true;
  else visible = prev[2] !== 0 || prev[3] !== 0;
  let uMin;
  let vMin;
  let uMax;
  let vMax;
  if (frame) {
    uMin = frame.uvMin[0];
    vMin = frame.uvMin[1];
    uMax = frame.uvMax[0];
    vMax = frame.uvMax[1];
  } else if (isAdd) {
    uMin = 0;
    vMin = 0;
    uMax = 1;
    vMax = 1;
  } else {
    uMin = prev[4];
    vMin = prev[5];
    uMax = prev[6];
    vMax = prev[7];
  }
  const currentFlipX = uMin > uMax;
  const currentFlipY = vMin > vMax;
  const prevFlipX = !isAdd && prev[4] > prev[6];
  const prevFlipY = !isAdd && prev[5] > prev[7];
  const wantsFlipX = props.flipX !== void 0 ? props.flipX === true : prevFlipX;
  const wantsFlipY = props.flipY !== void 0 ? props.flipY === true : prevFlipY;
  if (currentFlipX !== wantsFlipX) {
    const previousMinU = uMin;
    uMin = uMax;
    uMax = previousMinU;
  }
  if (currentFlipY !== wantsFlipY) {
    const previousMinV = vMin;
    vMin = vMax;
    vMax = previousMinV;
  }
  const rotation = props.rotation ?? (prev ? prev[8] : 0);
  const hasDepthSlot = layer.depth !== "none";
  const z = hasDepthSlot ? props.z ?? (prev ? prev[13] : layer.layerZ) : 0;
  data[base + 0] = posX;
  data[base + 1] = posY;
  data[base + 2] = visible ? trueW : 0;
  data[base + 3] = visible ? trueH : 0;
  data[base + 4] = uMin;
  data[base + 5] = vMin;
  data[base + 6] = uMax;
  data[base + 7] = vMax;
  data[base + 8] = rotation;
  if (props.color) {
    data[base + 9] = props.color[0];
    data[base + 10] = props.color[1];
    data[base + 11] = props.color[2];
    data[base + 12] = props.color[3];
  } else if (isAdd) {
    data[base + 9] = 1;
    data[base + 10] = 1;
    data[base + 11] = 1;
    data[base + 12] = 1;
  }
  if (hasDepthSlot) data[base + 13] = z;
}
function markDirty(layer, lo, hi) {
  if (layer._dirtyMin >= layer._dirtyMax) {
    layer._dirtyMin = lo;
    layer._dirtyMax = hi;
  } else {
    if (lo < layer._dirtyMin) layer._dirtyMin = lo;
    if (hi > layer._dirtyMax) layer._dirtyMax = hi;
  }
  layer._version = layer._version + 1 | 0;
  _getSprite2DYSortHook()?.dirty(layer, lo, hi);
}
function addSprite2DIndex(layer, props) {
  if (props.positionPx === void 0) ThrowLiteError(832);
  const idx = layer.count;
  if (idx >= layer._capacity) growCapacity(layer, idx + 1);
  writeInstance(layer, idx, props, null);
  layer._vertexExtension?._initInstance(layer._instanceData, idx * layer._instanceFloatsPerSprite);
  _setSprite2DCount(layer, layer.count + 1);
  _getSprite2DYSortHook()?.add(layer, idx);
  markDirty(layer, idx, idx + 1);
  return idx;
}
function clearSprite2DLayer(layer) {
  const count = layer.count;
  layer._dirtyMin = 0;
  layer._dirtyMax = 0;
  layer._handleHooks?.clear();
  if (count === 0) return;
  layer._savedSize.fill(0, 0, count * 2);
  _setSprite2DCount(layer, 0);
  _getSprite2DYSortHook()?.clear(layer, count);
  layer._version = layer._version + 1 | 0;
}
var _sprite2DYSortHook, DEFAULT_CAPACITY;
var init_sprite_2d = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-2d.js"() {
    init_lite_error();
    init_typed_arrays();
    init_sprite_atlas();
    init_sprite_blend();
    init_sprite_fx_hook();
    _sprite2DYSortHook = null;
    DEFAULT_CAPACITY = 16;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-coverage-gamma-hook.js
function _getSpriteCoverageGammaHook() {
  return _coverageGammaHook;
}
var _coverageGammaHook;
var init_sprite_coverage_gamma_hook = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-coverage-gamma-hook.js"() {
    _coverageGammaHook = null;
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-pipeline.js
function makeSpriteWgsl(hasDepth, spriteGroupIndex, uvScroll) {
  return `${makeSpritePrologueWgsl(hasDepth, spriteGroupIndex, uvScroll)} @fragment fn fs(in:O)->@location(0)vec4f{let s=textureSample(atlasTex,atlasSamp,in.uv);return s*in.tint*L.opacityMul;}`;
}
function makeSpritePrologueWgsl(hasDepth, spriteGroupIndex, uvScroll = false, extension) {
  const group = `@group(${spriteGroupIndex})`;
  const zAttribute = hasDepth ? `,@location(6)z:f32` : "";
  const uvOffsetAttribute = uvScroll ? `,@location(7)o:vec2f` : "";
  const zPosition = hasDepth ? "1 - in.z" : "0";
  return `struct Lr{viewPos:vec2f,viewScale:f32,viewRot:f32,screenSize:vec2f,pivot:vec2f,opacityMul:vec4f,aa:vec4f,};${group} @binding(0)var<uniform>L:Lr;${group} @binding(1)var atlasTex:texture_2d<f32>;${group} @binding(2)var atlasSamp:sampler;struct I{@builtin(vertex_index)vid:u32,@location(0)p:vec2f,@location(1)s:vec2f,@location(2)a:vec2f,@location(3)b:vec2f,@location(4)r:f32,@location(5)c:vec4f${zAttribute}${uvOffsetAttribute}${extension?._input ?? ""}};struct O{@builtin(position)p:vec4f,@location(0)uv:vec2f,@location(1)tint:vec4f,${extension?._output ?? ""}};@vertex fn vs(in:I)->O{var q=array<vec2f,4>(vec2f(0,0),vec2f(1,0),vec2f(1,1),vec2f(0,1));let c=q[in.vid];let l=(c-L.pivot)*in.s;let cr=cos(in.r);let sr=sin(in.r);let r=vec2f(l.x*cr-l.y*sr,l.x*sr+l.y*cr);let p=in.p+r-L.viewPos;let lc=cos(L.viewRot);let ls=sin(L.viewRot);let v=vec2f(p.x*lc-p.y*ls,p.x*ls+p.y*lc)*L.viewScale;let n=vec2f(v.x/L.screenSize.x*2-1,1-v.y/L.screenSize.y*2);let uv=mix(in.a,in.b,c)${uvScroll ? " + in.o" : ""};var out:O;out.p=vec4f(n,${zPosition},1);out.uv=uv;out.tint=in.c;${extension?._assignment ?? ""} return out;}`;
}
function createSpritePipelineCache() {
  return { _devices: /* @__PURE__ */ new WeakMap() };
}
function resetSpritePipelineCache(cache) {
  cache._devices = /* @__PURE__ */ new WeakMap();
}
function acquireSharedSpriteRendererPipelineCache() {
  _sharedSpriteRendererPipelineCache ??= createSpritePipelineCache();
  _sharedSpriteRendererPipelineCacheRefs++;
  return _sharedSpriteRendererPipelineCache;
}
function releaseSharedSpriteRendererPipelineCache() {
  if (_sharedSpriteRendererPipelineCacheRefs > 0 && --_sharedSpriteRendererPipelineCacheRefs === 0 && _sharedSpriteRendererPipelineCache) {
    resetSpritePipelineCache(_sharedSpriteRendererPipelineCache);
    _sharedSpriteRendererPipelineCache = null;
  }
}
function getOrCreateSpritePipeline(engine, cache, format, sampleCount, blendMode, hasDepth, depthWrite = false, depthStencilFormat, sceneBindGroupLayout, layer, depthCompare = "greater-equal") {
  const deviceCache = getSpritePipelineDeviceCache(engine, cache);
  const resolvedDepthStencilFormat = normalizeDepthStencilFormat(hasDepth, depthStencilFormat);
  const alphaToCoverageResolver = _getAlphaToCoverageResolver();
  const alphaToCoverage = hasDepth && depthWrite && sampleCount > 1 && !!layer && !!alphaToCoverageResolver?.(layer);
  const key = spritePipelineKey(format, sampleCount, blendMode, hasDepth, depthWrite, resolvedDepthStencilFormat, alphaToCoverage, layer, depthCompare);
  const cached = deviceCache._pipelines.get(key);
  if (cached) return cached;
  const pipeline = buildSpritePipeline(engine, deviceCache, format, sampleCount, blendMode, hasDepth, depthWrite, resolvedDepthStencilFormat, alphaToCoverage, sceneBindGroupLayout, layer, depthCompare);
  deviceCache._pipelines.set(key, pipeline);
  return pipeline;
}
function createSpriteLayerBindGroup(engine, pipeline, spriteBindGroupIndex, layer, uniformBuffer, fx) {
  const tex = layer.atlas.texture;
  const entries = [
    {
      binding: 0,
      resource: { buffer: uniformBuffer }
    },
    {
      binding: 1,
      resource: tex.view
    },
    {
      binding: 2,
      resource: tex.sampler
    }
  ];
  if (fx) for (const entry of _getSpriteFxHook().bindEntries(fx, 3)) entries.push(entry);
  return engine._device.createBindGroup({
    layout: pipeline.getBindGroupLayout(spriteBindGroupIndex),
    entries
  });
}
function getSpritePipelineDeviceCache(engine, cache) {
  let deviceCache = cache._devices.get(engine._device);
  if (!deviceCache) {
    deviceCache = {
      _shaderModules: /* @__PURE__ */ new Map(),
      _pipelines: /* @__PURE__ */ new Map()
    };
    cache._devices.set(engine._device, deviceCache);
  }
  return deviceCache;
}
function normalizeDepthStencilFormat(hasDepth, depthStencilFormat) {
  if (!hasDepth) return null;
  if (!depthStencilFormat) ThrowLiteError(847);
  return depthStencilFormat;
}
function spritePipelineKey(format, sampleCount, blendMode, hasDepth, depthWrite, depthStencilFormat, alphaToCoverage, layer, depthCompare = "greater-equal") {
  const customKey = layer ? _getSpriteFxHook()?.pipelineKeyPart(layer) ?? "" : "";
  const uvKey = layer?._uvScrollAttr ? "1" : "0";
  const cgKey = layer ? _getSpriteCoverageGammaHook()?.pipelineKeyPart(layer) ?? "0" : "0";
  return `${format}:${sampleCount}:${blendMode._key}:${hasDepth ? 1 : 0}:${depthWrite ? 1 : 0}:${depthStencilFormat ?? "-"}:${hasDepth ? depthCompare : "-"}:${alphaToCoverage ? "a" : "n"}:cs${customKey}:uv${uvKey}:cg${cgKey}`;
}
function getShaderModule(engine, cache, hasDepth, layer) {
  const customModule = layer ? _getSpriteFxHook()?.shaderModule(engine, hasDepth, layer) : null;
  if (customModule) return customModule;
  const gammaModule = layer ? _getSpriteCoverageGammaHook()?.shaderModule(engine, hasDepth, layer) : null;
  if (gammaModule) return gammaModule;
  const uvScroll = layer?._uvScrollAttr != null;
  const key = `${hasDepth ? 1 : 0}:${uvScroll ? 1 : 0}`;
  let module = cache._shaderModules.get(key);
  if (!module) {
    module = engine._device.createShaderModule({ code: makeSpriteWgsl(hasDepth, hasDepth ? 1 : 0, uvScroll) });
    cache._shaderModules.set(key, module);
  }
  return module;
}
function buildSpritePipeline(engine, cache, format, sampleCount, blendMode, hasDepth, depthWrite, depthStencilFormat, alphaToCoverage, sceneBindGroupLayout, layer, depthCompare = "greater-equal") {
  const device = engine._device;
  const layoutEntries = [
    {
      binding: 0,
      visibility: SS.VERTEX | SS.FRAGMENT,
      buffer: { type: "uniform" }
    },
    {
      binding: 1,
      visibility: SS.FRAGMENT,
      texture: { sampleType: "float" }
    },
    {
      binding: 2,
      visibility: SS.FRAGMENT,
      sampler: { type: "filtering" }
    }
  ];
  const extraLayoutEntries = layer ? _getSpriteFxHook()?.layoutEntries(layer, 3) : null;
  if (extraLayoutEntries) for (const entry of extraLayoutEntries) layoutEntries.push(entry);
  const bindGroupLayout = device.createBindGroupLayout({ entries: layoutEntries });
  const module = getShaderModule(engine, cache, hasDepth, layer);
  if (hasDepth && !sceneBindGroupLayout) ThrowLiteError(848);
  const bindGroupLayouts = hasDepth ? [sceneBindGroupLayout, bindGroupLayout] : [bindGroupLayout];
  const instanceAttributes = [
    {
      shaderLocation: 0,
      offset: SPRITE_POSITION_OFFSET_BYTES,
      format: "float32x2"
    },
    {
      shaderLocation: 1,
      offset: SPRITE_SIZE_OFFSET_BYTES,
      format: "float32x2"
    },
    {
      shaderLocation: 2,
      offset: SPRITE_UV_MIN_OFFSET_BYTES,
      format: "float32x2"
    },
    {
      shaderLocation: 3,
      offset: SPRITE_UV_MAX_OFFSET_BYTES,
      format: "float32x2"
    },
    {
      shaderLocation: 4,
      offset: SPRITE_ROTATION_OFFSET_BYTES,
      format: "float32"
    },
    {
      shaderLocation: 5,
      offset: SPRITE_COLOR_OFFSET_BYTES,
      format: "float32x4"
    }
  ];
  if (hasDepth) instanceAttributes.push({
    shaderLocation: 6,
    offset: SPRITE_DEPTH_OFFSET_BYTES,
    format: "float32"
  });
  if (layer?._uvScrollAttr) instanceAttributes.push(layer._uvScrollAttr);
  const vertexAttribute = layer ? _getSpriteFxHook()?.vertexAttribute(layer) : null;
  if (vertexAttribute) instanceAttributes.push(vertexAttribute);
  const arrayStride = layer?._instanceStrideBytes ?? (hasDepth ? 56 : 52);
  const descriptor = {
    layout: device.createPipelineLayout({ bindGroupLayouts }),
    vertex: {
      module,
      entryPoint: "vs",
      buffers: [{
        arrayStride,
        stepMode: "instance",
        attributes: instanceAttributes
      }]
    },
    fragment: {
      module,
      entryPoint: "fs",
      targets: [{
        format,
        blend: blendMode._descriptor,
        writeMask: CW.ALL
      }]
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "none"
    },
    multisample: alphaToCoverage ? {
      count: sampleCount,
      alphaToCoverageEnabled: true
    } : { count: sampleCount }
  };
  if (hasDepth) descriptor.depthStencil = {
    format: depthStencilFormat,
    depthCompare,
    depthWriteEnabled: depthWrite
  };
  return device.createRenderPipeline(descriptor);
}
function createSpriteInstanceBuffer(device, layer, label) {
  return device.createBuffer({
    size: layer._capacity * layer._instanceStrideBytes,
    usage: BU.VERTEX | BU.COPY_DST,
    label
  });
}
function ensureSpriteInstanceBuffer(device, layer, currentBuffer, currentCapacity, label) {
  const neededBytes = layer._capacity * layer._instanceStrideBytes;
  if (currentBuffer.size >= neededBytes) return {
    buffer: currentBuffer,
    capacity: currentCapacity,
    reallocated: false
  };
  currentBuffer.destroy();
  return {
    buffer: createSpriteInstanceBuffer(device, layer, label),
    capacity: layer._capacity,
    reallocated: true
  };
}
function uploadSpriteInstances(device, layer, instanceBuffer, uploadedVersion) {
  const orderedVersion = _getSprite2DYSortHook()?.upload(device, layer, instanceBuffer, uploadedVersion);
  if (orderedVersion !== void 0) return orderedVersion;
  if (uploadedVersion === layer._version) return uploadedVersion;
  if (layer.count === 0) {
    layer._dirtyMin = 0;
    layer._dirtyMax = 0;
    return layer._version;
  }
  let lo;
  let hi;
  if (uploadedVersion === -1) {
    lo = 0;
    hi = layer.count;
  } else {
    lo = layer._dirtyMin;
    hi = Math.min(layer._dirtyMax, layer.count);
  }
  if (hi > lo) {
    const offsetBytes = lo * layer._instanceStrideBytes;
    const bytes = (hi - lo) * layer._instanceStrideBytes;
    device.queue.writeBuffer(instanceBuffer, offsetBytes, layer._instanceData.buffer, layer._instanceData.byteOffset + offsetBytes, bytes);
  }
  layer._dirtyMin = 0;
  layer._dirtyMax = 0;
  return layer._version;
}
function buildSpriteLayerUbo(layer, screenWidth, screenHeight, ubo) {
  ubo[0] = layer.view.positionPx[0];
  ubo[1] = layer.view.positionPx[1];
  ubo[2] = layer.view.zoom;
  ubo[3] = layer.view.rotation;
  ubo[4] = screenWidth;
  ubo[5] = screenHeight;
  ubo[6] = layer.pivot[0];
  ubo[7] = layer.pivot[1];
  const op = layer.opacity;
  if (layer.blendMode._premultipliedOpacity) {
    ubo[8] = op;
    ubo[9] = op;
    ubo[10] = op;
    ubo[11] = op;
  } else {
    ubo[8] = 1;
    ubo[9] = 1;
    ubo[10] = 1;
    ubo[11] = op;
  }
  _getSpriteCoverageGammaHook()?.writeUbo(layer, ubo);
}
function writeSpriteLayerUboIfDirty(device, uniformBuffer, scratchUbo, lastUbo, alreadyUploaded) {
  let dirty = !alreadyUploaded;
  if (!dirty) {
    for (let i = 0; i < 16; i++) if (lastUbo[i] !== scratchUbo[i]) {
      dirty = true;
      break;
    }
  }
  if (dirty) {
    device.queue.writeBuffer(uniformBuffer, 0, scratchUbo.buffer, scratchUbo.byteOffset, 64);
    lastUbo.set(scratchUbo);
  }
  return true;
}
var SPRITE_POSITION_OFFSET_BYTES, SPRITE_SIZE_OFFSET_BYTES, SPRITE_UV_MIN_OFFSET_BYTES, SPRITE_UV_MAX_OFFSET_BYTES, SPRITE_ROTATION_OFFSET_BYTES, SPRITE_COLOR_OFFSET_BYTES, SPRITE_DEPTH_OFFSET_BYTES, _sharedSpriteRendererPipelineCache, _sharedSpriteRendererPipelineCacheRefs, SHARED_SPRITE_INDEX_DATA;
var init_sprite_pipeline = __esm({
  "../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-pipeline.js"() {
    init_lite_error();
    init_typed_arrays();
    init_gpu_flags();
    init_alpha_to_coverage_hook();
    init_sprite_fx_hook();
    init_sprite_2d();
    init_sprite_coverage_gamma_hook();
    SPRITE_POSITION_OFFSET_BYTES = 0;
    SPRITE_SIZE_OFFSET_BYTES = 8;
    SPRITE_UV_MIN_OFFSET_BYTES = 16;
    SPRITE_UV_MAX_OFFSET_BYTES = 24;
    SPRITE_ROTATION_OFFSET_BYTES = 32;
    SPRITE_COLOR_OFFSET_BYTES = 36;
    SPRITE_DEPTH_OFFSET_BYTES = 52;
    _sharedSpriteRendererPipelineCache = null;
    _sharedSpriteRendererPipelineCacheRefs = 0;
    SHARED_SPRITE_INDEX_DATA = new U16([
      0,
      1,
      2,
      0,
      2,
      3
    ]);
  }
});

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/index.js
init_engine();

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/engine-dispose.js
init_engine();
init_gpu_resource_retirement();
function disposeEngine(engine) {
  disposeGpuResourceRetirements(engine);
  stopEngine(engine);
  const surfaces = engine._surfaces;
  for (const surface of surfaces) {
    surface._renderingContexts.length = 0;
    surface._ro?.disconnect();
    surface._context.unconfigure();
  }
  surfaces.length = 0;
  try {
    engine._disposeManagedResources?.();
    engine._disposeStorageBuffers?.();
  } finally {
    engine._device.destroy();
  }
}

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/engine/engine-gpu-events.js
function attach(engine) {
  const events = engine._gpuEvents;
  const device = engine._device;
  if (events._device === device) return;
  events._device?.removeEventListener("uncapturederror", events._onError);
  events._device = device;
  device.addEventListener("uncapturederror", events._onError);
  device.lost.then((info) => {
    if (events._device !== device) return;
    for (const callback of events._lost) callback(info);
  });
}
function eventsFor(engine) {
  let events = engine._gpuEvents;
  if (!events) {
    const errors = /* @__PURE__ */ new Set();
    events = engine._gpuEvents = {
      _errors: errors,
      _lost: /* @__PURE__ */ new Set(),
      _device: null,
      _onError: (event) => {
        const error = event.error;
        for (const callback of errors) callback(error);
      }
    };
    engine._attachGpuEvents = attach;
  }
  attach(engine);
  return events;
}
function onEngineGpuError(engine, callback) {
  const events = eventsFor(engine);
  events._errors.add(callback);
  return () => {
    events._errors.delete(callback);
  };
}
function onEngineDeviceLost(engine, callback) {
  const events = eventsFor(engine);
  events._lost.add(callback);
  return () => {
    events._lost.delete(callback);
  };
}

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/texture/pixels-texture.js
init_lite_error();
init_gpu_flags();
init_texture_acquire();
init_texture_sampler_pool();
function createTexture2DFromPixels(engine, data, width, height, options = {}) {
  if (width < 1 || height < 1) ThrowLiteError(895, width, height);
  const expected = width * height * 4;
  if (data.length < expected) ThrowLiteError(896, expected, width, height, data.length);
  const device = engine._device;
  const format = options.srgb ? "rgba8unorm-srgb" : "rgba8unorm";
  const texture = device.createTexture({
    size: {
      width,
      height
    },
    format,
    usage: TU.TEXTURE_BINDING | TU.COPY_DST
  });
  device.queue.writeTexture({ texture }, data, {
    bytesPerRow: width * 4,
    rowsPerImage: height
  }, {
    width,
    height
  });
  const samplerDesc = {
    addressModeU: options.addressModeU ?? "clamp-to-edge",
    addressModeV: options.addressModeV ?? "clamp-to-edge",
    minFilter: options.minFilter ?? "nearest",
    magFilter: options.magFilter ?? "nearest"
  };
  const sampler = getOrCreateSampler(engine, samplerDesc);
  const tex = {
    texture,
    view: texture.createView(),
    sampler,
    width,
    height
  };
  engine._dlr?.p(tex, data, options);
  acquireTexture(tex);
  return tex;
}

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/index.js
init_sprite_atlas();

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/shared/sprite-atlas-packer.js
init_lite_error();
init_typed_arrays();
function shelfPack(sources, padding, maxWidth, maxHeight, startPenX, startPenY, startShelfHeight, fnLabel) {
  const xs = new Array(sources.length);
  const ys = new Array(sources.length);
  let penX = startPenX;
  let penY = startPenY;
  let shelfHeight = startShelfHeight;
  let contentWidth = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (s.width < 1 || s.height < 1) ThrowLiteError(807, fnLabel, i, s.width, s.height);
    const srcX = s.srcX ?? 0;
    const srcY = s.srcY ?? 0;
    const srcStride = s.srcStrideBytes ?? s.width * 4;
    if (srcX < 0 || srcY < 0) ThrowLiteError(808, fnLabel, i, srcX, srcY);
    if ((srcX + s.width) * 4 > srcStride) ThrowLiteError(809, fnLabel, i, (srcX + s.width) * 4, srcStride);
    const requiredBytes = (srcY + s.height - 1) * srcStride + (srcX + s.width) * 4;
    if (s.pixels.length < requiredBytes) throw new Error(`${fnLabel}: frame ${i} pixel buffer too short \u2014 need ${requiredBytes} bytes (srcX=${srcX}, srcY=${srcY}, srcStride=${srcStride}, w=${s.width}, h=${s.height}), got ${s.pixels.length}.`);
    if (penX > 0 && penX + s.width > maxWidth) {
      penY += shelfHeight + padding;
      penX = 0;
      shelfHeight = 0;
    }
    if (s.width > maxWidth) ThrowLiteError(810, fnLabel, i, s.width, maxWidth);
    if (penY + s.height > maxHeight) ThrowLiteError(811, fnLabel, i, s.width, s.height, maxHeight, penY);
    xs[i] = penX;
    ys[i] = penY;
    const rightEdge = penX + s.width;
    if (rightEdge > contentWidth) contentWidth = rightEdge;
    penX = rightEdge + padding;
    if (s.height > shelfHeight) shelfHeight = s.height;
  }
  const contentHeight = sources.length === 0 ? startPenY : penY + shelfHeight;
  return {
    xs,
    ys,
    penX,
    penY,
    shelfHeight,
    contentWidth,
    contentHeight
  };
}
function createSpriteAtlasFromFrames(engine, sources, options = {}) {
  const padding = options.paddingPx ?? 1;
  const requestedMaxWidth = options.maxWidthPx ?? 1024;
  if (sources.length === 0 && !options.capacityPx) ThrowLiteError(812);
  const maxWidth = options.capacityPx ? Math.min(requestedMaxWidth, options.capacityPx[0]) : requestedMaxWidth;
  const placement = shelfPack(sources, padding, maxWidth, Number.MAX_SAFE_INTEGER, 0, 0, 0, "createSpriteAtlasFromFrames");
  const atlasWidth = options.capacityPx ? options.capacityPx[0] : Math.max(1, placement.contentWidth);
  const atlasHeight = options.capacityPx ? options.capacityPx[1] : Math.max(1, placement.contentHeight);
  if (atlasWidth < 1 || atlasHeight < 1) ThrowLiteError(813, atlasWidth, atlasHeight);
  if (placement.contentWidth > atlasWidth || placement.contentHeight > atlasHeight) ThrowLiteError(814, atlasWidth, atlasHeight, placement.contentWidth, placement.contentHeight);
  const data = new U8(atlasWidth * atlasHeight * 4);
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const srcX = s.srcX ?? 0;
    const srcY = s.srcY ?? 0;
    const srcStride = s.srcStrideBytes ?? s.width * 4;
    const rowBytes = s.width * 4;
    for (let row = 0; row < s.height; row++) {
      const srcOffset = (srcY + row) * srcStride + srcX * 4;
      const dstOffset = ((placement.ys[i] + row) * atlasWidth + placement.xs[i]) * 4;
      data.set(s.pixels.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }
  }
  const sampling = options.sampling ?? "nearest";
  const texture = createTexture2DFromPixels(engine, data, atlasWidth, atlasHeight, {
    minFilter: sampling,
    magFilter: sampling,
    srgb: options.srgb ?? false
  });
  const frames = new Array(sources.length);
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    frames[i] = {
      name: s.name,
      uvMin: [placement.xs[i] / atlasWidth, placement.ys[i] / atlasHeight],
      uvMax: [(placement.xs[i] + s.width) / atlasWidth, (placement.ys[i] + s.height) / atlasHeight],
      sourceSizePx: [s.width, s.height],
      pivot: s.pivot ?? [0.5, 0.5]
    };
  }
  const packState = {
    penX: placement.penX,
    penY: placement.penY,
    shelfHeight: placement.shelfHeight,
    maxWidth,
    padding
  };
  return {
    texture,
    textureSizePx: [atlasWidth, atlasHeight],
    frames,
    premultipliedAlpha: options.premultipliedAlpha ?? false,
    _packState: packState,
    _frames: frames
  };
}

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/index.js
init_sprite_2d();

// ../node_modules/.pnpm/@babylonjs+lite@1.38.1_@webgpu+types@0.1.66/node_modules/@babylonjs/lite/lib/sprite/sprite-renderer.js
init_lite_error();
init_typed_arrays();
init_gpu_flags();
init_engine();
init_mapped_buffer();
init_empty_uniform_buffer();
init_sprite_fx_hook();
init_sprite_pipeline();
var KIND = "sprite-renderer";
function ensureLayerGpu(rr, layer) {
  let lg = rr._layerGpu.get(layer);
  if (!lg) {
    const cap = layer._capacity;
    lg = {
      layer,
      instanceBuffer: createSpriteInstanceBuffer(rr._surface.engine._device, layer),
      instanceBufferCapacity: cap,
      uniformBuffer: createEmptyUniformBuffer(rr._surface.engine, 64),
      bindGroup: null,
      uploadedVersion: -1,
      fx: _getSpriteFxHook()?.createLayerFx(rr._surface.engine, "sprite-layer-fx-ubo", layer) ?? null,
      pipeline: null,
      lastUbo: new F32(16),
      uboUploaded: false,
      renderBundle: null,
      bundleCount: -1
    };
    rr._layerGpu.set(layer, lg);
  }
  const grown = ensureSpriteInstanceBuffer(rr._surface.engine._device, layer, lg.instanceBuffer, lg.instanceBufferCapacity);
  if (grown.reallocated) {
    lg.instanceBuffer = grown.buffer;
    lg.instanceBufferCapacity = grown.capacity;
    lg.uploadedVersion = -1;
    lg.renderBundle = null;
  }
  return lg;
}
function uploadLayer(rr, lg, deltaMs) {
  const layer = lg.layer;
  lg.uploadedVersion = uploadSpriteInstances(rr._surface.engine._device, layer, lg.instanceBuffer, lg.uploadedVersion);
  buildSpriteLayerUbo(layer, rr._targetWidth, rr._targetHeight, _scratchUbo);
  lg.uboUploaded = writeSpriteLayerUboIfDirty(rr._surface.engine._device, lg.uniformBuffer, _scratchUbo, lg.lastUbo, lg.uboUploaded);
  if (lg.fx) _getSpriteFxHook().updateFx(lg.fx, layer, deltaMs);
}
function disposeLayerGpu(lg) {
  lg.instanceBuffer.destroy();
  lg.uniformBuffer.destroy();
  if (lg.fx) _getSpriteFxHook().disposeFx(lg.fx);
}
var _scratchUbo = new F32(16);
function ensureBindGroup(rr, lg, pipeline) {
  if (lg.bindGroup) return lg.bindGroup;
  lg.bindGroup = createSpriteLayerBindGroup(rr._surface.engine, pipeline, 0, lg.layer, lg.uniformBuffer, lg.fx);
  return lg.bindGroup;
}
function compareLayers(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return 0;
}
function createSpriteRenderer(surface, opts) {
  const engine = surface.engine;
  assertSpriteRendererLayers(opts.layers);
  const indexBuffer = createMappedBuffer(engine, SHARED_SPRITE_INDEX_DATA, BU.INDEX);
  const canvas = surface.canvas;
  const layers = opts.layers.slice();
  const rr = {
    _kind: KIND,
    _surface: surface,
    _indexBuffer: indexBuffer,
    _pipelineCache: acquireSharedSpriteRendererPipelineCache(),
    _layerGpu: /* @__PURE__ */ new Map(),
    _visibleBundles: [],
    _targetWidth: canvas.width,
    _targetHeight: canvas.height,
    _disposed: false,
    _clear: opts.clear ?? true,
    _targetView: null,
    _beforeUpdate: [],
    _disposeCallbacks: [],
    layers,
    _layers: layers,
    clearColor: opts.clearValue ?? {
      r: 0,
      g: 0,
      b: 0,
      a: 1
    },
    _drawCallsPre: 0,
    _update() {
      spriteRendererUpdate(rr);
    },
    _record() {
      return spriteRendererRecord(rr);
    }
  };
  try {
    for (const layer of rr.layers) getOrCreateSpritePipeline(engine, rr._pipelineCache, surface.format, 1, layer.blendMode, false, false, void 0, void 0, layer);
  } catch (err) {
    releaseSharedSpriteRendererPipelineCache();
    indexBuffer.destroy();
    throw err;
  }
  return rr;
}
function assertSpriteRendererLayers(layers) {
  for (const layer of layers) assertSpriteRendererLayer(layer);
}
function assertSpriteRendererLayer(layer) {
  if (layer.depth !== "none") ThrowLiteError(851);
}
function spriteRendererUpdate(rr) {
  if (rr._disposed) return;
  const deltaMs = rr._surface.engine._currentDelta ?? 0;
  for (const hook of rr._beforeUpdate) hook(deltaMs);
  assertSpriteRendererLayers(rr.layers);
  const targetSize = getRenderTargetSize(rr._surface);
  rr._targetWidth = targetSize.width;
  rr._targetHeight = targetSize.height;
  if (rr.layers.length > 1) rr._layers.sort(compareLayers);
  for (const layer of rr.layers) {
    if (!layer.visible || layer.count === 0) continue;
    uploadLayer(rr, ensureLayerGpu(rr, layer), deltaMs);
  }
}
function spriteRendererRecord(rr) {
  if (rr._disposed) return 0;
  assertSpriteRendererLayers(rr.layers);
  const encoder = rr._surface.engine._currentEncoder;
  const swapView = rr._targetView ?? rr._surface.scRT._colorView;
  const pass = encoder.beginRenderPass({ colorAttachments: [{
    view: swapView,
    clearValue: rr.clearColor,
    loadOp: rr._clear ? "clear" : "load",
    storeOp: "store"
  }] });
  let drawCalls = 0;
  const visibleBundles = rr._visibleBundles;
  visibleBundles.length = 0;
  for (const layer of rr.layers) {
    if (!layer.visible || layer.count === 0) continue;
    const lg = rr._layerGpu.get(layer);
    if (!lg) continue;
    const sampleCount = 1;
    const pipeline = getOrCreateSpritePipeline(rr._surface.engine, rr._pipelineCache, rr._surface.format, sampleCount, layer.blendMode, false, false, void 0, void 0, layer);
    if (lg.pipeline !== pipeline) {
      lg.pipeline = pipeline;
      lg.bindGroup = null;
      lg.renderBundle = null;
    }
    const bg = ensureBindGroup(rr, lg, pipeline);
    if (lg.renderBundle == null || lg.bundleCount !== layer.count) {
      const be = rr._surface.engine._device.createRenderBundleEncoder({
        colorFormats: [rr._surface.format],
        sampleCount
      });
      be.setIndexBuffer(rr._indexBuffer, "uint16");
      be.setPipeline(pipeline);
      be.setBindGroup(0, bg);
      be.setVertexBuffer(0, lg.instanceBuffer);
      be.drawIndexed(6, layer.count, 0, 0, 0);
      lg.renderBundle = be.finish();
      lg.bundleCount = layer.count;
    }
    visibleBundles.push(lg.renderBundle);
    drawCalls++;
  }
  if (visibleBundles.length > 0) pass.executeBundles(visibleBundles);
  pass.end();
  return drawCalls;
}
function registerSpriteRenderer(sr) {
  registerRenderingContext(sr._surface, sr);
}
function unregisterSpriteRenderer(sr) {
  unregisterRenderingContext(sr._surface, sr);
}
function disposeSpriteRenderer(sr) {
  if (sr._disposed) return;
  unregisterSpriteRenderer(sr);
  sr._disposed = true;
  const disposeCallbacks = sr._disposeCallbacks.slice();
  sr._disposeCallbacks.length = 0;
  for (const dispose of disposeCallbacks) dispose();
  for (const lg of sr._layerGpu.values()) disposeLayerGpu(lg);
  sr._layerGpu.clear();
  sr._visibleBundles.length = 0;
  sr._beforeUpdate.length = 0;
  sr._indexBuffer.destroy();
  releaseSharedSpriteRendererPipelineCache();
  sr._layers.length = 0;
}
export {
  addSprite2DIndex,
  clearSprite2DLayer,
  createEngine,
  createSprite2DLayer,
  createSpriteAtlasFromFrames,
  createSpriteRenderer,
  disposeEngine,
  disposeSpriteAtlas,
  disposeSpriteRenderer,
  onEngineDeviceLost,
  onEngineGpuError,
  registerSpriteRenderer,
  renderFrame,
  setEngineSize
};
