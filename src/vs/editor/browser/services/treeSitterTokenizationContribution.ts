import { registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { TreeSitterController } from 'vs/editor/browser/services/treeSitterTokenizationController';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';

registerEditorContribution(TreeSitterController.ID, TreeSitterController);
// registerSingleton(ITreeSitterTokenizationService, TreeSitterTokenizationService, true);

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'toggleTreeSitterTokenization', title: 'Toggle Tree-Sitter Tokenization', f1: true });
	}
	run(accessor: ServicesAccessor) {
		/*
		const treeSitterTokenizationService = accessor.get(ITreeSitterTokenizationService);
		treeSitterTokenizationService.registerTreeSittersForColorization();
		treeSitterTokenizationService.registerTreeSittersForFolding();
		*/
	}
});
