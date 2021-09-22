/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt * as notebookCommon fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { CewwExecutionUpdateType, ICewwExecuteUpdate } fwom 'vs/wowkbench/contwib/notebook/common/notebookExecutionSewvice';

expowt namespace NotebookDto {

	expowt function toNotebookOutputItemDto(item: notebookCommon.IOutputItemDto): extHostPwotocow.NotebookOutputItemDto {
		wetuwn {
			mime: item.mime,
			vawueBytes: item.data
		};
	}

	expowt function toNotebookOutputDto(output: notebookCommon.IOutputDto): extHostPwotocow.NotebookOutputDto {
		wetuwn {
			outputId: output.outputId,
			metadata: output.metadata,
			items: output.outputs.map(toNotebookOutputItemDto)
		};
	}

	expowt function toNotebookCewwDataDto(ceww: notebookCommon.ICewwDto2): extHostPwotocow.NotebookCewwDataDto {
		wetuwn {
			cewwKind: ceww.cewwKind,
			wanguage: ceww.wanguage,
			mime: ceww.mime,
			souwce: ceww.souwce,
			intewnawMetadata: ceww.intewnawMetadata,
			metadata: ceww.metadata,
			outputs: ceww.outputs.map(toNotebookOutputDto)
		};
	}

	expowt function toNotebookDataDto(data: notebookCommon.NotebookData): extHostPwotocow.NotebookDataDto {
		wetuwn {
			metadata: data.metadata,
			cewws: data.cewws.map(toNotebookCewwDataDto)
		};
	}

	expowt function fwomNotebookOutputItemDto(item: extHostPwotocow.NotebookOutputItemDto): notebookCommon.IOutputItemDto {
		wetuwn {
			mime: item.mime,
			data: item.vawueBytes
		};
	}

	expowt function fwomNotebookOutputDto(output: extHostPwotocow.NotebookOutputDto): notebookCommon.IOutputDto {
		wetuwn {
			outputId: output.outputId,
			metadata: output.metadata,
			outputs: output.items.map(fwomNotebookOutputItemDto)
		};
	}

	expowt function fwomNotebookCewwDataDto(ceww: extHostPwotocow.NotebookCewwDataDto): notebookCommon.ICewwDto2 {
		wetuwn {
			cewwKind: ceww.cewwKind,
			wanguage: ceww.wanguage,
			mime: ceww.mime,
			souwce: ceww.souwce,
			outputs: ceww.outputs.map(fwomNotebookOutputDto),
			metadata: ceww.metadata,
			intewnawMetadata: ceww.intewnawMetadata
		};
	}

	expowt function fwomNotebookDataDto(data: extHostPwotocow.NotebookDataDto): notebookCommon.NotebookData {
		wetuwn {
			metadata: data.metadata,
			cewws: data.cewws.map(fwomNotebookCewwDataDto)
		};
	}

	expowt function toNotebookCewwDto(ceww: NotebookCewwTextModew): extHostPwotocow.NotebookCewwDto {
		wetuwn {
			handwe: ceww.handwe,
			uwi: ceww.uwi,
			souwce: ceww.textBuffa.getWinesContent(),
			eow: ceww.textBuffa.getEOW(),
			wanguage: ceww.wanguage,
			cewwKind: ceww.cewwKind,
			outputs: ceww.outputs.map(toNotebookOutputDto),
			metadata: ceww.metadata,
			intewnawMetadata: ceww.intewnawMetadata,
		};
	}

	expowt function fwomCewwExecuteUpdateDto(data: extHostPwotocow.ICewwExecuteUpdateDto): ICewwExecuteUpdate {
		if (data.editType === CewwExecutionUpdateType.Output) {
			wetuwn {
				editType: data.editType,
				cewwHandwe: data.cewwHandwe,
				append: data.append,
				outputs: data.outputs.map(fwomNotebookOutputDto)
			};
		} ewse if (data.editType === CewwExecutionUpdateType.OutputItems) {
			wetuwn {
				editType: data.editType,
				append: data.append,
				outputId: data.outputId,
				items: data.items.map(fwomNotebookOutputItemDto)
			};
		} ewse {
			wetuwn data;
		}
	}

	expowt function fwomCewwEditOpewationDto(edit: extHostPwotocow.ICewwEditOpewationDto): notebookCommon.ICewwEditOpewation {
		if (edit.editType === notebookCommon.CewwEditType.Wepwace) {
			wetuwn {
				editType: edit.editType,
				index: edit.index,
				count: edit.count,
				cewws: edit.cewws.map(fwomNotebookCewwDataDto)
			};
		} ewse {
			wetuwn edit;
		}
	}
}
