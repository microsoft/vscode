/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join } from '../../../base/common/path.js';

/**
 * On-device transcriber for NVIDIA's `nemotron-3.5-asr-streaming-0.6b` ONNX
 * export (the same family the GitHub Copilot desktop app ships for dictation).
 *
 * Unlike Whisper, this is an RNN-T *transducer* (encoder + prediction/decoder
 * LSTM + joint network) rather than an encoder-decoder attention model, so it
 * cannot be driven by the transformers.js `automatic-speech-recognition`
 * pipeline (which only supports CTC/attention ASR). Instead we drive the three
 * ONNX graphs directly through onnxruntime-node with a hand-written NeMo
 * log-mel feature extractor and a greedy transducer decode loop.
 *
 * Why bother: the model is multilingual (35+ languages, auto-detected), notably
 * more accurate than whisper-base, and matches the Copilot app for parity. The
 * cost is a ~800MB download and this bespoke runtime glue.
 *
 * Pipeline: PCM16/Float32 @16kHz -> NeMo log-mel (128) -> cache-aware
 * FastConformer encoder (chunked, carries LSTM/conv caches) -> greedy RNN-T
 * (decoder LSTM + joint) -> SentencePiece detokenize.
 */

// --- feature/model constants (from the export's genai_config.json /
//     audio_processor_config.json; see the on-device model card) ---
const SR = 16000, N_FFT = 512, HOP = 160, WIN = 400, N_MELS = 128;
const FMIN = 0, FMAX = 8000, PREEMPH = 0.97, LOG_GUARD = 1e-10;
const PRE_CACHE = 9;                            // pre_encode_cache_size (left-context feature frames)
const CHUNK_FRAMES = 56;                        // new feature frames per encoder step (8960/160)
const CHUNK_TOTAL = PRE_CACHE + CHUNK_FRAMES;   // 65 == encoder audio_signal time dim
const N_LAYERS = 24, HID = 1024, CACHE_T = 56, CONV_CTX = 8;
const DEC_LAYERS = 2, DEC_HID = 640;
const BLANK = 13087, MAX_SYM = 10, VOCAB = 13088;
const SUBSAMPLING = 8;                          // encoder output frames = ceil(featureFrames / 8)

/** Auto-detect the spoken language (0 is the export's language-agnostic id). */
const LANG_AUTODETECT = 0;

/** Files that make up the ONNX export; downloaded on first use. */
const MODEL_FILES = [
	'encoder.onnx', 'encoder.onnx.data',
	'decoder.onnx', 'decoder.onnx.data',
	'joint.onnx', 'joint.onnx.data',
	'vocab.txt',
];

/**
 * Pinned Hugging Face commit the hard-coded tensor shapes, cache sizes, and
 * vocabulary ids below were validated against. Downloads resolve this exact
 * revision (not the mutable `main` branch) and it is part of the on-disk cache
 * identity, so an upstream model update can never hand new users an
 * incompatible export or be silently mixed with a previously cached one.
 */
const MODEL_REVISION = '8364d9e2dd9da23789b480bdbba9e423717e42ee';

/**
 * onnxruntime-node is a heavy native addon (also pulled in by transformers.js);
 * import it lazily and keep its types loose so the platform layer doesn't take
 * a hard build-time dependency on it.
 */
type OrtModule = typeof import('onnxruntime-node');
type OrtSession = import('onnxruntime-node').InferenceSession;
type OrtTensor = import('onnxruntime-node').Tensor;

export interface INemotronProgress {
	/** 0..1 overall download progress, or undefined once loading. */
	(state: { readonly downloaded: boolean; readonly progress?: number }): void;
}

export class NemotronTranscriber {

	/** Model ids this transcriber knows how to run (vs. Whisper). */
	static isNemotronModel(model: string): boolean {
		return /nemotron/i.test(model);
	}

	private _ort: OrtModule | undefined;
	private _enc: OrtSession | undefined;
	private _dec: OrtSession | undefined;
	private _joint: OrtSession | undefined;
	private _vocab: string[] = [];
	private _filterbank: Float64Array[] | undefined;
	private _window: Float64Array | undefined;

	// ---- streaming state (reset per dictation session) ----
	/** How many samples of the cumulative buffer have already been consumed. */
	private _consumedSamples = 0;
	/** Preemphasized + front-reflect-padded signal accumulated so far. */
	private _sig: number[] = [];
	/** Preemphasized samples buffered until enough exist to build the front pad. */
	private _preBuf: number[] = [];
	private _haveFirstSample = false;
	private _rawPrev = 0;
	private _frontPadded = false;
	private _endPadded = false;
	/** Number of feature frames already computed from `_sig`. */
	private _emittedFrames = 0;
	/** Feature frames computed but not yet fed to the encoder. */
	private _featQueue: Float32Array[] = [];
	/** Up to PRE_CACHE most-recent frames already encoded, for left context. */
	private _featLeft: Float32Array[] = [];
	private _cacheCh: Float32Array | undefined;
	private _cacheTime: Float32Array | undefined;
	private _cacheLen = [0];
	private _decH: Float32Array | undefined;
	private _decC: Float32Array | undefined;
	private _decCur: Float32Array | undefined;
	private _decInit = false;
	/** Tokens emitted so far this session (greedy RNN-T is monotonic). */
	private _emitted: number[] = [];

	/** True once the three graphs are loaded and ready to transcribe. */
	get isLoaded(): boolean {
		return !!(this._enc && this._dec && this._joint);
	}

	/**
	 * Release the native ONNX sessions and drop references to them. Safe to call
	 * more than once. Invoke when replacing/reloading the model or disposing the
	 * owning service so the ~800MB of native allocations do not stay resident
	 * for the utility process lifetime.
	 */
	async release(): Promise<void> {
		const sessions = [this._enc, this._dec, this._joint];
		this._enc = this._dec = this._joint = undefined;
		await Promise.allSettled(sessions.map(s => s?.release()));
	}

	/**
	 * Download (if needed) and load the model. `cacheDir` is the shared model
	 * cache; files are placed in a per-model subfolder guarded by a `.complete`
	 * sentinel so a half-finished download is never reused.
	 */
	async prepare(cacheDir: string, model: string, onProgress: INemotronProgress): Promise<void> {
		const sanitized = `${model}@${MODEL_REVISION}`.replace(/[^a-zA-Z0-9._-]/g, '_');
		const modelDir = join(cacheDir, 'nemotron', sanitized);
		await this._ensureDownloaded(modelDir, model, onProgress);

		onProgress({ downloaded: true });
		const ort = await this._loadOrt();
		const opts = { executionProviders: ['cpu'] } as const;
		// Open the three graphs concurrently, but if any fails release the ones
		// that already opened so a partial failure cannot leak native sessions.
		const encP = ort.InferenceSession.create(join(modelDir, 'encoder.onnx'), opts);
		const decP = ort.InferenceSession.create(join(modelDir, 'decoder.onnx'), opts);
		const jointP = ort.InferenceSession.create(join(modelDir, 'joint.onnx'), opts);
		try {
			this._enc = await encP;
			this._dec = await decP;
			this._joint = await jointP;
		} catch (err) {
			await Promise.allSettled([encP, decP, jointP].map(p => p.then(s => s.release()).catch(() => { })));
			this._enc = this._dec = this._joint = undefined;
			throw err;
		}
		this._vocab = fs.readFileSync(join(modelDir, 'vocab.txt'), 'utf8').split('\n');
		this._filterbank = melFilterbank();
		// Hann window (symmetric), centered within the N_FFT frame.
		const win = new Float64Array(N_FFT);
		const off = (N_FFT - WIN) / 2;
		for (let i = 0; i < WIN; i++) {
			win[off + i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
		}
		this._window = win;
		this.resetStream();
	}

	/**
	 * Discard all per-session streaming state so the next session starts clean.
	 * Call this whenever a new dictation session begins.
	 */
	resetStream(): void {
		this._consumedSamples = 0;
		this._sig = [];
		this._preBuf = [];
		this._haveFirstSample = false;
		this._rawPrev = 0;
		this._frontPadded = false;
		this._endPadded = false;
		this._emittedFrames = 0;
		this._featQueue = [];
		this._featLeft = [];
		this._cacheCh = new Float32Array(N_LAYERS * CACHE_T * HID);
		this._cacheTime = new Float32Array(N_LAYERS * HID * CONV_CTX);
		this._cacheLen = [0];
		this._decH = new Float32Array(DEC_LAYERS * DEC_HID);
		this._decC = new Float32Array(DEC_LAYERS * DEC_HID);
		this._decCur = undefined;
		this._decInit = false;
		this._emitted = [];
	}

	/**
	 * Incrementally transcribe. `cumulativeAudio` is the whole recording so far
	 * (mono 16kHz Float32); only the samples appended since the previous call are
	 * processed, and the model's encoder caches, LSTM state, and already-emitted
	 * tokens are carried forward — so cost is proportional to the *new* audio,
	 * not the full utterance. Pass `isFinal` on the last call to flush the tail.
	 * Returns the full transcript accumulated so far.
	 */
	async transcribeStreaming(cumulativeAudio: Float32Array, isFinal: boolean): Promise<string> {
		if (!this.isLoaded || !this._filterbank || !this._window) {
			throw new Error('NemotronTranscriber not prepared');
		}
		const delta = cumulativeAudio.subarray(Math.min(this._consumedSamples, cumulativeAudio.length));
		this._consumedSamples = cumulativeAudio.length;

		this._feedSamples(delta, isFinal);
		const newFrames = this._computeFrames();
		for (const f of newFrames) {
			this._featQueue.push(f);
		}
		await this._drainEncoder(isFinal);
		return this._detokenize(this._emitted);
	}

	/**
	 * One-shot transcription of a complete buffer (resets streaming state first).
	 * Kept for callers that don't need incremental results; internally it just
	 * runs the streaming path to completion.
	 */
	async transcribe(audio: Float32Array): Promise<string> {
		this.resetStream();
		return this.transcribeStreaming(audio, true);
	}

	// ---------- model loading / download ----------

	private async _loadOrt(): Promise<OrtModule> {
		if (!this._ort) {
			const mod = await import('onnxruntime-node');
			// onnxruntime-node is CommonJS; unwrap the interop default if present.
			this._ort = ((mod as unknown as { default?: OrtModule }).default ?? mod) as OrtModule;
		}
		return this._ort;
	}

	private async _ensureDownloaded(modelDir: string, model: string, onProgress: INemotronProgress): Promise<void> {
		const sentinel = join(modelDir, '.complete');
		if (fs.existsSync(sentinel)) {
			return;
		}
		await fs.promises.mkdir(modelDir, { recursive: true });

		// Determine total bytes up front so progress can be reported as a single
		// 0..1 value across all files (the .data blobs dominate).
		const base = `https://huggingface.co/${model}/resolve/${MODEL_REVISION}`;
		const sizes: number[] = [];
		for (const file of MODEL_FILES) {
			sizes.push(await headContentLength(`${base}/${file}`));
		}
		const total = sizes.reduce((a, b) => a + b, 0) || 1;

		let done = 0;
		for (let i = 0; i < MODEL_FILES.length; i++) {
			const file = MODEL_FILES[i];
			const dest = join(modelDir, file);
			const doneBefore = done;
			await downloadFile(`${base}/${file}`, dest, received => {
				onProgress({ downloaded: false, progress: Math.min(1, (doneBefore + received) / total) });
			});
			done += sizes[i];
		}
		await fs.promises.writeFile(sentinel, '');
	}

	// ---------- streaming NeMo log-mel features ----------

	/**
	 * Preemphasize and append `samples` to `_sig`, matching the offline
	 * featurizer's center padding: a one-time front reflect pad, and (when
	 * `isFinal`) an end reflect pad. Preemphasis (`x[i]=raw[i]-0.97*raw[i-1]`,
	 * first sample unchanged) is carried across calls via `_rawPrev`.
	 */
	private _feedSamples(samples: Float32Array, isFinal: boolean): void {
		const pad = N_FFT / 2;
		for (let i = 0; i < samples.length; i++) {
			const s = samples[i];
			let x: number;
			if (!this._haveFirstSample) {
				x = s;
				this._haveFirstSample = true;
			} else {
				x = s - PREEMPH * this._rawPrev;
			}
			this._rawPrev = s;
			if (this._frontPadded) {
				this._sig.push(x);
			} else {
				this._preBuf.push(x);
				if (this._preBuf.length >= pad + 1) {
					this._emitFrontPad(pad);
				}
			}
		}
		if (isFinal && !this._endPadded) {
			// A very short utterance may never have reached the front-pad
			// threshold; emit it now with whatever was buffered.
			if (!this._frontPadded) {
				this._emitFrontPad(pad);
			}
			const n = this._sig.length;
			for (let i = 0; i < pad; i++) {
				const idx = n - 2 - i;
				this._sig.push(idx >= 0 ? this._sig[idx] : 0);
			}
			this._endPadded = true;
		}
	}

	/** Emit the front reflect pad (`x[pad]..x[1]`) followed by the buffered samples. */
	private _emitFrontPad(pad: number): void {
		const pb = this._preBuf;
		for (let i = 0; i < pad; i++) {
			const idx = pad - i;
			this._sig.push(pb[Math.min(idx, pb.length - 1)] ?? 0);
		}
		for (const v of pb) {
			this._sig.push(v);
		}
		this._preBuf = [];
		this._frontPadded = true;
	}

	/** Compute every feature frame now fully covered by `_sig`, advancing `_emittedFrames`. */
	private _computeFrames(): Float32Array[] {
		const fb = this._filterbank!;
		const win = this._window!;
		const nBins = N_FFT / 2 + 1;
		const frames: Float32Array[] = [];
		const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
		while (this._emittedFrames * HOP + N_FFT <= this._sig.length) {
			const s = this._emittedFrames * HOP;
			for (let i = 0; i < N_FFT; i++) {
				re[i] = this._sig[s + i] * win[i];
				im[i] = 0;
			}
			fft(re, im);
			const mel = new Float32Array(N_MELS);
			for (let m = 0; m < N_MELS; m++) {
				let acc = 0;
				const row = fb[m];
				for (let k = 0; k < nBins; k++) {
					acc += row[k] * (re[k] * re[k] + im[k] * im[k]); // mag_power = 2
				}
				mel[m] = Math.log(acc + LOG_GUARD);
			}
			frames.push(mel);
			this._emittedFrames++;
		}
		return frames;
	}

	// ---------- streaming cache-aware encoder + greedy RNN-T ----------

	/**
	 * Feed queued feature frames to the encoder in fixed 56-frame chunks (the
	 * same boundaries the offline path used), decoding each chunk's encoder
	 * output greedily. A partial trailing chunk is only processed when `isFinal`.
	 */
	private async _drainEncoder(isFinal: boolean): Promise<void> {
		while (this._featQueue.length >= CHUNK_FRAMES) {
			await this._encodeChunk(this._featQueue.splice(0, CHUNK_FRAMES));
		}
		if (isFinal && this._featQueue.length > 0) {
			await this._encodeChunk(this._featQueue.splice(0, this._featQueue.length));
		}
	}

	private async _encodeChunk(chunkFrames: Float32Array[]): Promise<void> {
		const ort = await this._loadOrt();
		const f32 = (data: Float32Array, dims: number[]): OrtTensor => new ort.Tensor('float32', data, dims);
		const i64 = (arr: number[], dims: number[]): OrtTensor => new ort.Tensor('int64', BigInt64Array.from(arr.map(BigInt)), dims);

		const buf = new Float32Array(CHUNK_TOTAL * N_MELS);
		// Left context: up to PRE_CACHE most-recent already-encoded frames,
		// right-aligned so the missing left (first chunk) stays zero-padded.
		const left = this._featLeft;
		const avail = Math.min(PRE_CACHE, left.length);
		for (let i = 0; i < avail; i++) {
			buf.set(left[left.length - avail + i], (PRE_CACHE - avail + i) * N_MELS);
		}
		for (let i = 0; i < chunkFrames.length; i++) {
			buf.set(chunkFrames[i], (PRE_CACHE + i) * N_MELS);
		}
		const valid = chunkFrames.length;

		const res = await this._enc!.run({
			audio_signal: f32(buf, [1, CHUNK_TOTAL, N_MELS]),
			length: i64([CHUNK_TOTAL], [1]),
			cache_last_channel: f32(this._cacheCh!, [1, N_LAYERS, CACHE_T, HID]),
			cache_last_time: f32(this._cacheTime!, [1, N_LAYERS, HID, CONV_CTX]),
			cache_last_channel_len: i64(this._cacheLen, [1]),
			lang_id: i64([LANG_AUTODETECT], [1]),
		});
		this._cacheCh = res.cache_last_channel_next.data as Float32Array;
		this._cacheTime = res.cache_last_time_next.data as Float32Array;
		this._cacheLen = [Number((res.cache_last_channel_len_next.data as BigInt64Array)[0])];

		const outData = res.outputs.data as Float32Array;
		const tOut = res.outputs.dims[1];
		const encLen = Number((res.encoded_lengths.data as BigInt64Array)[0]);
		// Trust encoded_lengths, but never take more than the valid frames this
		// chunk actually contributed (the final chunk is usually partial).
		const nUse = Math.min(tOut, encLen, Math.ceil(valid / SUBSAMPLING) || tOut);
		for (let t = 0; t < nUse; t++) {
			await this._decodeFrame(outData.slice(t * HID, t * HID + HID));
		}
		// The last PRE_CACHE frames of this chunk are the next chunk's left context.
		this._featLeft = chunkFrames.slice(Math.max(0, chunkFrames.length - PRE_CACHE));
	}

	private async _stepDecoder(token: number): Promise<void> {
		const ort = await this._loadOrt();
		const r = await this._dec!.run({
			targets: new ort.Tensor('int64', BigInt64Array.from([BigInt(token)]), [1, 1]),
			h_in: new ort.Tensor('float32', this._decH!, [DEC_LAYERS, 1, DEC_HID]),
			c_in: new ort.Tensor('float32', this._decC!, [DEC_LAYERS, 1, DEC_HID]),
		});
		this._decCur = r.decoder_output.data as Float32Array; // [1,640,1] == 640 contiguous
		this._decH = r.h_out.data as Float32Array;
		this._decC = r.c_out.data as Float32Array;
	}

	/** Greedy-decode a single encoder frame, appending any emitted tokens. */
	private async _decodeFrame(encT: Float32Array): Promise<void> {
		const ort = await this._loadOrt();
		if (!this._decInit) {
			await this._stepDecoder(BLANK); // BLANK as start-of-sequence
			this._decInit = true;
		}
		let sym = 0;
		while (sym < MAX_SYM) {
			const jr = await this._joint!.run({
				encoder_output: new ort.Tensor('float32', encT, [1, 1, HID]),
				decoder_output: new ort.Tensor('float32', this._decCur!, [1, 1, DEC_HID]),
			});
			const logits = jr.joint_output.data as Float32Array;
			let best = 0, bestv = -Infinity;
			for (let k = 0; k < VOCAB; k++) {
				if (logits[k] > bestv) {
					bestv = logits[k];
					best = k;
				}
			}
			if (best === BLANK) {
				break;
			}
			this._emitted.push(best);
			await this._stepDecoder(best);
			sym++;
		}
	}

	// ---------- detokenize (SentencePiece unigram: U+2581 == space) ----------

	private _detokenize(tokens: number[]): string {
		let text = '';
		for (const id of tokens) {
			const piece = this._vocab[id] ?? '';
			if (piece.startsWith('<') && piece.endsWith('>')) {
				continue; // language / special tags
			}
			text += piece.replace(/\u2581/g, ' ');
		}
		return text.trim();
	}
}

// ---------- shared helpers ----------

/** Iterative radix-2 in-place FFT (N_FFT is a power of two). */
function fft(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) {
			j ^= bit;
		}
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wr = Math.cos(ang), wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1, ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const a = i + k, b = i + k + len / 2;
				const tr = re[b] * cr - im[b] * ci;
				const ti = re[b] * ci + im[b] * cr;
				re[b] = re[a] - tr; im[b] = im[a] - ti;
				re[a] += tr; im[a] += ti;
				const ncr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = ncr;
			}
		}
	}
}

/** Mel filterbank matching librosa slaney (htk=false, norm='slaney'). */
function melFilterbank(): Float64Array[] {
	const nBins = N_FFT / 2 + 1;
	const fftFreqs = new Float64Array(nBins);
	for (let k = 0; k < nBins; k++) {
		fftFreqs[k] = (k * SR) / N_FFT;
	}
	const mMin = hzToMel(FMIN), mMax = hzToMel(FMAX);
	const melPts = new Float64Array(N_MELS + 2);
	for (let i = 0; i < N_MELS + 2; i++) {
		melPts[i] = melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1));
	}
	const fb: Float64Array[] = [];
	for (let m = 0; m < N_MELS; m++) {
		const f0 = melPts[m], f1 = melPts[m + 1], f2 = melPts[m + 2];
		const row = new Float64Array(nBins);
		const enorm = 2.0 / (f2 - f0);
		for (let k = 0; k < nBins; k++) {
			const lo = (fftFreqs[k] - f0) / (f1 - f0);
			const hi = (f2 - fftFreqs[k]) / (f2 - f1);
			row[k] = Math.max(0, Math.min(lo, hi)) * enorm;
		}
		fb.push(row);
	}
	return fb;
}

function hzToMel(hz: number): number {
	const fSp = 200.0 / 3, minLogHz = 1000.0, minLogMel = minLogHz / fSp, logStep = Math.log(6.4) / 27.0;
	return hz < minLogHz ? hz / fSp : minLogMel + Math.log(hz / minLogHz) / logStep;
}

function melToHz(mel: number): number {
	const fSp = 200.0 / 3, minLogHz = 1000.0, minLogMel = minLogHz / fSp, logStep = Math.log(6.4) / 27.0;
	return mel < minLogMel ? mel * fSp : minLogHz * Math.exp(logStep * (mel - minLogMel));
}

/** Resolve the final content-length of a URL (following redirects). */
async function headContentLength(url: string): Promise<number> {
	const https = await import('https');
	return new Promise<number>((resolve, reject) => {
		const req = https.request(url, { method: 'HEAD' }, res => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				res.resume();
				headContentLength(new URL(res.headers.location, url).toString()).then(resolve, reject);
				return;
			}
			if (!res.statusCode || res.statusCode >= 400) {
				res.resume();
				reject(new Error(`HEAD ${url} failed: ${res.statusCode}`));
				return;
			}
			resolve(Number(res.headers['content-length']) || 0);
			res.resume();
		});
		req.on('error', reject);
		req.end();
	});
}

/** Stream a URL to `dest` (following redirects), reporting received bytes. */
async function downloadFile(url: string, dest: string, onBytes: (received: number) => void): Promise<void> {
	const https = await import('https');
	return new Promise<void>((resolve, reject) => {
		https.get(url, res => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				res.resume();
				downloadFile(new URL(res.headers.location, url).toString(), dest, onBytes).then(resolve, reject);
				return;
			}
			if (!res.statusCode || res.statusCode >= 400) {
				res.resume();
				reject(new Error(`GET ${url} failed: ${res.statusCode}`));
				return;
			}
			const tmp = `${dest}.tmp`;
			const out = fs.createWriteStream(tmp);
			let received = 0;
			res.on('data', chunk => {
				received += chunk.length;
				onBytes(received);
			});
			res.pipe(out);
			out.on('finish', () => out.close(err => {
				if (err) {
					reject(err);
					return;
				}
				fs.rename(tmp, dest, renameErr => renameErr ? reject(renameErr) : resolve());
			}));
			out.on('error', reject);
			res.on('error', reject);
		}).on('error', reject);
	});
}
