import * as fs from 'fs';
import * as path from 'path';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IListService } from 'vs/platform/list/browser/listService';
import { getMultiSelectedResources } from 'vs/workbench/contrib/files/browser/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';


export function getResourceName(resources: URI[], relative: boolean, labelService: ILabelService) {
	let resourceName;
	if (resources.length) {
		const lineDelimiter = isWindows ? '\r\n' : '\n';
		resourceName = resources.map(resource => labelService.getUriLabel(resource, { relative, noPrefix: true }))
			.join(lineDelimiter);
	}
	return resourceName;
}

export function toggleExcludeResourceHandler(accessor: ServicesAccessor, resource: URI) {
	const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService));
	const contextService = accessor.get(IWorkspaceContextService);
	const resourceName = getResourceName(resources, true, accessor.get(ILabelService));
	if (resourceName) {
		let workspace = contextService.getWorkspace();
		let resourceFolderPath = resource.path.substring(0, resource.path.length - resourceName.length - 1);
		for (let folder of workspace.folders) {
			if (folder.uri.fsPath === resourceFolderPath) {
				let settingsFile = path.join(resourceFolderPath, '/.vscode/settings.json');
			const data = fs.readFileSync(settingsFile).toString();
			const settings = JSON.parse(data);

			if (settings['files.exclude']) {
				if (settings['files.exclude'].hasOwnProperty(resourceName) && typeof settings['files.exclude'][resourceName] === 'boolean') {
					settings['files.exclude'][resourceName] = !settings['files.exclude'][resourceName];
				}
				else {
					settings['files.exclude'][resourceName] = true;
				}
				fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
			}
		}
	}
	}

}