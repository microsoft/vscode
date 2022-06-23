<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import {
		provideVSCodeDesignSystem,
		vsCodeButton,
	} from "@vscode/webview-ui-toolkit";
	import type { HoverOption } from "../protocol/components";

	provideVSCodeDesignSystem().register(vsCodeButton());

	export let alwaysShow = false;
	export let options: HoverOption[] = [
		{ icon: "copy", command: "copy", title: "Copy Url" },
	];

	const dispatch = createEventDispatcher<{ command: string }>();
	function clickOption(command: string) {
		dispatch("command", command);
	}
</script>

<main>
	<div class="container">
		<div class="slot">
			<slot />
		</div>
		<span class="opts" class:hide={!alwaysShow}>
			{#each options as opt}
				{#if opt.icon != null}
					<span
						title={opt.title}
						class="svg-container"
						on:click={(e) => clickOption(opt.command)}
					>
						<vscode-button appearance="icon" aria-label={opt.title}>
							<span class={"codicon codicon-" + opt.icon} />
						</vscode-button>
					</span>
				{/if}
			{/each}
		</span>
	</div>
</main>

<style>
	.opts {
		display: inline-flex;
		flex: none;
		padding-left: 4px;
		box-sizing: border-box;
		align-content: center;
	}
	.hide {
		display: none;
	}

	.slot {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: inline-flex;
		align-content: center;
	}

	.container {
		display: flex;
		justify-content: space-between;
	}

	.hide:hover,
	.container:hover > .hide {
		display: inline-flex;
	}
	.svg-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 16px;
	}
</style>
