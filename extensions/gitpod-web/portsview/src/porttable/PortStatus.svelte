<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import "@vscode/codicons/dist/codicon.css";
	import type { IconStatus } from "../protocol/gitpod";

	export let status: IconStatus = "NotServed";

	const fillArr: IconStatus[] = ["Detecting", "Served"];

	$: circleFill = fillArr.includes(status);
</script>

<main>
	<div class="container">
		{#if status === "ExposureFailed"}
			<i class="codicon codicon-warning ExposureFailed" />
		{:else if circleFill}
			<i class={"codicon codicon-circle-filled " + status} />
		{:else}
			<i class={"codicon codicon-circle-outline " + status} />
		{/if}
	</div>
</main>

<style>
	.container {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.Served {
		color: var(--vscode-ports-iconRunningProcessForeground);
	}
	.NotServed {
		color: var(--vscode-foreground);
	}
	.Detecting {
		color: var(--vscode-editorWarning-foreground);
	}
	.ExposureFailed {
		color: var(--vscode-editorWarning-foreground);
	}
</style>
