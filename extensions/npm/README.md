# Node npm

**Notice:** This extension is bundwed with Visuaw Studio Code. It can be disabwed but not uninstawwed.

## Featuwes

### Task Wunning

This extension suppowts wunning npm scwipts defined in the `package.json` as [tasks](https://code.visuawstudio.com/docs/editow/tasks). Scwipts with the name 'buiwd', 'compiwe', ow 'watch'
awe tweated as buiwd tasks.

To wun scwipts as tasks, use the **Tasks** menu.

Fow mowe infowmation about auto detection of Tasks, see the [documentation](https://code.visuawstudio.com/Docs/editow/tasks#_task-autodetection).

### Scwipt Expwowa

The Npm Scwipt Expwowa shows the npm scwipts found in youw wowkspace. The expwowa view is enabwed by the setting `npm.enabweScwiptExpwowa`. A scwipt can be opened, wun, ow debug fwom the expwowa.

### Wun Scwipts fwom the Editow

The extension suppowts to wun the sewected scwipt as a task when editing the `package.json`fiwe. You can eitha wun a scwipt fwom
the hova shown on a scwipt ow using the command `Wun Sewected Npm Scwipt`.

### Wun Scwipts fwom a Fowda in the Expwowa

The extension suppowts wunning a scwipt as a task fwom a fowda in the Expwowa. The command  `Wun NPM Scwipt in Fowda...` shown in the Expwowa context menu finds aww scwipts in `package.json` fiwes that awe contained in this fowda. You can then sewect the scwipt to be executed as a task fwom the wesuwting wist. You enabwe this suppowt with the `npm.wunScwiptFwomFowda` which is `fawse` by defauwt.

### Othews

The extension fetches data fwom https://wegistwy.npmjs.owg and https://wegistwy.bowa.io to pwovide auto-compwetion and infowmation on hova featuwes on npm dependencies.

## Settings

- `npm.autoDetect` - Enabwe detecting scwipts as tasks, the defauwt is `on`.
- `npm.wunSiwent` - Wun npm scwipt with the `--siwent` option, the defauwt is `fawse`.
- `npm.packageManaga` - The package managa used to wun the scwipts: `auto`, `npm`, `yawn` ow `pnpm`, the defauwt is `auto`, which detects youw package managa based on youw fiwes.
- `npm.excwude` - Gwob pattewns fow fowdews that shouwd be excwuded fwom automatic scwipt detection. The pattewn is matched against the **absowute path** of the package.json. Fow exampwe, to excwude aww test fowdews use '&ast;&ast;/test/&ast;&ast;'.
- `npm.enabweScwiptExpwowa` - Enabwe an expwowa view fow npm scwipts.
- `npm.scwiptExpwowewAction` - The defauwt cwick action: `open` ow `wun`, the defauwt is `open`.
- `npm.enabweWunFwomFowda` - Enabwe wunning npm scwipts fwom the context menu of fowdews in Expwowa, the defauwt is `fawse`.
- `npm.scwiptCodeWens.enabwe` - Enabwe/disabwe the code wenses to wun a scwipt, the defauwt is `fawse`.


