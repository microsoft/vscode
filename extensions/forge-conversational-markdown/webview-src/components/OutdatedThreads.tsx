import type { FromWebviewMessage, ThreadForBlock } from '../../src/protocol/types';
import { ThreadView } from './ThreadView';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface OutdatedThreadsProps {
	readonly threads: readonly ThreadForBlock[];
	readonly vscode: VsApi;
}

export function OutdatedThreads(props: OutdatedThreadsProps): preact.JSX.Element {
	const { threads, vscode } = props;
	return (
		<section class="forge-cmd-outdated">
			<h2 class="forge-cmd-outdated-title">Unanchored threads</h2>
			<p class="forge-cmd-outdated-desc">These threads could not be matched to the current document structure.</p>
			{threads.map(t => (
				<ThreadView key={t.thread.id} thread={t.thread} vscode={vscode} variant="outdated" />
			))}
		</section>
	);
}
