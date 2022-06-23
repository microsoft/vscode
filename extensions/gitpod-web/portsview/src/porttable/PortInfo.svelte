<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import type { GitpodPortObject } from "../protocol/gitpod";

	export let port: GitpodPortObject;

	$: title = port.status.name || port.status.localPort.toString();

	$: showPortDetail =
		port.status.remotePort != null &&
		port.status.localPort !== port.status.remotePort;

	function getPortDetail(port: GitpodPortObject) {
		if (showPortDetail) {
			return title === port.status.name
				? ` (${port.status.localPort}:${port.status.remotePort})`
				: ` :${port.status.remotePort}`;
		} else {
			return title === port.status.name ? `(${port.status.localPort})` : "";
		}
	}
	$: portDetail = getPortDetail(port);
</script>

<main>
	<div class="container" title={port.info.tooltip}>
		<span class="title">{title}</span>
		<span class="port-detail">{portDetail}</span>
	</div>
</main>

<style>
	.container {
		display: flex;
		width: 100%;
	}
	span {
		display: inline-block;
	}
	.title {
		flex: none;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.port-detail {
		display: inline-block;
	}
</style>
