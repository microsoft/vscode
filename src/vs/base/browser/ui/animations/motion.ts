/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../common/lifecycle.js';
import { IMotionEffect, IMotionRecipe } from '../../../common/motion.js';
import { addDisposableListener, getWindow } from '../../dom.js';

export type MotionResult = 'finished' | 'cancelled';

/** Owns one element's animation, including interruption, sequencing and accessibility changes. */
export class MotionController extends Disposable {
	private readonly active = this._register(new MutableDisposable());
	private animation: Animation | undefined;
	private recipe: IMotionRecipe | undefined;
	private reduced: boolean;
	private generation = 0;
	private disposed = false;
	private reversed = false;

	constructor(private readonly element: HTMLElement, reducedMotion?: boolean) {
		super();
		const media = getWindow(element).matchMedia('(prefers-reduced-motion: reduce)');
		this.reduced = reducedMotion ?? media.matches;
		if (reducedMotion === undefined) {
			const onChange = () => this.setReducedMotion(media.matches);
			this._register(addDisposableListener(media, 'change', onChange));
		}
	}

	get state(): AnimationPlayState {
		return this.animation?.playState ?? 'idle';
	}

	play(recipe: IMotionRecipe, signal?: AbortSignal): Promise<MotionResult> {
		this.generation++;
		return this.start(recipe, signal);
	}

	async playSequence(recipes: readonly IMotionRecipe[], signal?: AbortSignal): Promise<MotionResult> {
		if (this.disposed) {
			throw new Error('Motion controller is disposed');
		}
		if (recipes.some(recipe => !Number.isFinite(recipe.effect.iterations))) {
			throw new Error('Looping motion cannot be used in a finite sequence');
		}
		const generation = ++this.generation;
		for (const recipe of recipes) {
			if (generation !== this.generation || signal?.aborted || this.disposed) {
				return 'cancelled';
			}
			const result = await this.start(recipe, signal);
			if (result === 'cancelled' || generation !== this.generation) {
				return 'cancelled';
			}
		}
		return 'finished';
	}

	pause(): void {
		const animation = this.requireAnimation();
		if (animation.playState !== 'running' && animation.playState !== 'paused') {
			throw new Error('Only active motion can be paused');
		}
		animation.pause();
	}

	resume(): void {
		const animation = this.requireAnimation();
		if (animation.playState !== 'paused') {
			throw new Error('Only paused motion can be resumed');
		}
		animation.play();
	}

	reverse(): Promise<MotionResult> {
		this.generation++;
		const animation = this.requireAnimation();
		if (this.reduced || !Number.isFinite(animation.effect?.getTiming().iterations)) {
			throw new Error('Reduced or looping motion cannot be reversed');
		}
		animation.reverse();
		this.reversed = !this.reversed;
		return this.observe(animation);
	}

	finish(): void {
		const animation = this.requireAnimation();
		if (!Number.isFinite(animation.effect?.getTiming().iterations)) {
			throw new Error('Looping motion must be cancelled, not finished');
		}
		animation.finish();
	}

	cancel(): void {
		this.generation++;
		this.active.clear();
		this.animation = undefined;
		this.recipe = undefined;
	}

	setReducedMotion(reduced: boolean): void {
		this.reduced = reduced;
		if (!reduced || !this.animation || !this.recipe || this.animation.playState === 'finished') {
			return;
		}
		const effect = this.animation.effect;
		if (!(effect instanceof getWindow(this.element).KeyframeEffect)) {
			throw new Error('Motion controller requires a keyframe effect');
		}
		const reverseDirection = this.recipe.effect.direction === 'reverse' || this.recipe.effect.direction === 'alternate-reverse';
		const reducedEffect = this.reversed
			? {
				...this.recipe.reducedEffect,
				frames: [{
					...this.recipe.effect.frames[reverseDirection ? this.recipe.effect.frames.length - 1 : 0],
					...(this.recipe.effect.frames.some(frame => frame.transform !== undefined) ? { transform: 'none' } : {}),
				}],
				duration: 0,
			}
			: this.recipe.reducedEffect;
		effect.setKeyframes(this.keyframes(reducedEffect));
		effect.updateTiming(this.timing(reducedEffect));
		this.animation.playbackRate = 1;
		this.animation.currentTime = 0;
		this.animation.play();
	}

	private start(recipe: IMotionRecipe, signal?: AbortSignal): Promise<MotionResult> {
		if (this.disposed) {
			throw new Error('Motion controller is disposed');
		}
		if (signal?.aborted) {
			this.cancel();
			return Promise.resolve('cancelled');
		}
		const effect = this.reduced ? recipe.reducedEffect : recipe.effect;
		if ([recipe.effect, recipe.reducedEffect].some(candidate => !candidate.frames.length || !Number.isFinite(candidate.duration) || candidate.duration < 0 || !Number.isFinite(candidate.delay)
			|| candidate.iterations <= 0 || Number.isNaN(candidate.iterations))
			|| recipe.reducedEffect.iterations !== 1) {
			throw new Error(`Invalid resolved motion recipe: ${recipe.id}`);
		}
		const frames = this.keyframes(effect);
		if (!this.reduced && (this.animation?.playState === 'running' || this.animation?.playState === 'paused')) {
			// Snapshot only the properties owned by this controller before replacing its active effect.
			const current = getWindow(this.element).getComputedStyle(this.element);
			const first = effect.direction === 'reverse' || effect.direction === 'alternate-reverse' ? frames.length - 1 : 0;
			frames[first] = {
				...frames[first],
				...(frames.some(frame => frame.opacity !== undefined) ? { opacity: current.opacity } : {}),
				...(frames.some(frame => frame.transform !== undefined) ? { transform: current.transform } : {}),
			};
		}
		this.active.clear();
		this.animation = undefined;
		this.recipe = undefined;
		const animation = this.element.animate(frames, this.timing(effect));
		const lifetime = new DisposableStore();
		this.active.value = lifetime;
		lifetime.add(toDisposable(() => animation.cancel()));
		this.animation = animation;
		this.recipe = recipe;
		this.reversed = false;
		const onAbort = () => {
			if (this.animation === animation) {
				this.cancel();
			}
		};
		const abortListener = signal ? lifetime.add(addDisposableListener(signal, 'abort', onAbort, { once: true })) : undefined;
		return this.observe(animation).finally(() => abortListener?.dispose());
	}

	private keyframes(effect: IMotionEffect): Keyframe[] {
		return effect.frames.map(frame => ({ ...frame }));
	}

	private timing(effect: IMotionEffect): OptionalEffectTiming {
		return { duration: effect.duration, delay: effect.delay, easing: effect.easing, iterations: effect.iterations, direction: effect.direction, fill: 'both' };
	}

	private requireAnimation(): Animation {
		if (this.disposed || !this.animation) {
			throw new Error('No owned motion animation');
		}
		return this.animation;
	}

	private async observe(animation: Animation): Promise<MotionResult> {
		try {
			await animation.finished;
			return 'finished';
		} catch (error) {
			if (error instanceof getWindow(this.element).DOMException && error.name === 'AbortError') {
				return 'cancelled';
			}
			throw error;
		}
	}

	override dispose(): void {
		this.disposed = true;
		this.cancel();
		super.dispose();
	}
}
