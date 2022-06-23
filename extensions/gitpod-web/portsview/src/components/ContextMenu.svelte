<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import type { MenuOption } from "../protocol/components";

	export let x = 0;
	export let y = 0;
	export let show = false;

	export let options: Array<MenuOption | null> = [];

	let menuEl: HTMLDivElement;

	$: ((x: number, y: number) => {
		if (!show || !menuEl) return;
		const rect = menuEl.getBoundingClientRect();
		x = Math.min(window.innerWidth - rect.width, x);
		if (y > window.innerHeight - rect.height) y -= rect.height;
	})(x, y);

	const dispatch = createEventDispatcher<{
		command: string;
		clickoutside: string;
	}>();

	function onPageClick(e: MouseEvent) {
		if (!show) return;
		// @ts-ignore
		if (e.target === menuEl || menuEl.contains(e.target)) return;
		dispatch("clickoutside");
	}
</script>

<main>
	{#if show}
		<div class="menu" bind:this={menuEl} style="top: {y}px; left: {x}px;">
			{#each options as menu}
				{#if menu == null}
					<div class="divider" />
				{:else}
					<div class="opt" on:click={() => dispatch("command", menu.command)}>
						{menu.label}
						{#if menu.desc?.length > 0}
							<span>{menu.desc}</span>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</main>

<svelte:window on:click={onPageClick} />

<style>
	.menu {
		padding: 4px 0;
		position: fixed;
		display: grid;
		width: 230px;
		border: 1px solid var(--vscode-menu-selectionBorder);
		background-color: var(--vscode-menu-background);
		z-index: 1000;
		box-shadow: 0 10px 15px -3px var(--vscode-widget-shadow),
			0 4px 6px -4px var(--vscode-widget-shadow);
		border-radius: 4px;
	}
	.opt {
		cursor: pointer;
		padding: 6px 16px;
		position: relative;
	}
	.opt > span {
		float: right;
	}
	.divider {
		margin: 4px 8px;
		border-bottom: 1px solid var(--vscode-textSeparator-foreground);
	}
	.opt:hover {
		background-color: var(--vscode-focusBorder);
	}
</style>
