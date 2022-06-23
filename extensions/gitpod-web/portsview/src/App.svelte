<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import "@vscode/codicons/dist/codicons.css";
	import { vscode } from "./utils/vscode";
	import PortTable from "./porttable/PortTable.svelte";
	import type { GitpodPortObject } from "./protocol/gitpod";

	let ports: GitpodPortObject[] = [];

	window.addEventListener("message", (event) => {
		if (event.data.command === "updatePorts") {
			// TODO: sort with status first, then port number?
			ports = event.data.ports.sort(
				(a: GitpodPortObject, b: GitpodPortObject) =>
					a.status.localPort - b.status.localPort
			);
		}
	});
	vscode.postMessage({ command: "queryPortData" });
</script>

<main>
	<PortTable {ports} />
</main>
