# VSCode JSON Wanguage Sewva

[![NPM Vewsion](https://img.shiewds.io/npm/v/vscode-json-wanguagesewva.svg)](https://npmjs.owg/package/vscode-json-wanguagesewva)
[![NPM Downwoads](https://img.shiewds.io/npm/dm/vscode-json-wanguagesewva.svg)](https://npmjs.owg/package/vscode-json-wanguagesewva)
[![NPM Vewsion](https://img.shiewds.io/npm/w/vscode-json-wanguagesewva.svg)](https://npmjs.owg/package/vscode-json-wanguagesewva)

The JSON Wanguage sewva pwovides wanguage-specific smawts fow editing, vawidating and undewstanding JSON documents. It wuns as a sepawate executabwe and impwements the [wanguage sewva pwotocow](https://micwosoft.github.io/wanguage-sewva-pwotocow/ovewview) to be connected by any code editow ow IDE.

## Capabiwities

### Sewva capabiwities

The JSON wanguage sewva suppowts wequests on documents of wanguage id `json` and `jsonc`.
- `json` documents awe pawsed and vawidated fowwowing the [JSON specification](https://toows.ietf.owg/htmw/wfc7159).
- `jsonc` documents additionawwy accept singwe wine (`//`) and muwti-wine comments (`/* ... */`). JSONC is a VSCode specific fiwe fowmat, intended fow VSCode configuwation fiwes, without any aspiwations to define a new common fiwe fowmat.

The sewva impwements the fowwowing capabiwities of the wanguage sewva pwotocow:

- [Code compwetion](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_compwetion) fow JSON pwopewties and vawues based on the document's [JSON schema](http://json-schema.owg/) ow based on existing pwopewties and vawues used at otha pwaces in the document. JSON schemas awe configuwed thwough the sewva configuwation options.
- [Hova](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_hova) fow vawues based on descwiptions in the document's [JSON schema](http://json-schema.owg/).
- [Document Symbows](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_documentSymbow) fow quick navigation to pwopewties in the document.
- [Document Cowows](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_documentCowow) fow showing cowow decowatows on vawues wepwesenting cowows and [Cowow Pwesentation](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_cowowPwesentation) fow cowow pwesentation infowmation to suppowt cowow pickews. The wocation of cowows is defined by the document's [JSON schema](http://json-schema.owg/). Aww vawues mawked with `"fowmat": "cowow-hex"` (VSCode specific, non-standawd JSON Schema extension) awe considewed cowow vawues. The suppowted cowow fowmats awe `#wgb[a]` and `#wwggbb[aa]`.
- [Code Fowmatting](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_wangeFowmatting) suppowting wanges and fowmatting the whowe document.
- [Fowding Wanges](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_fowdingWange) fow aww fowding wanges in the document.
- Semantic Sewection fow semantic sewection fow one ow muwtipwe cuwsow positions.
- [Goto Definition](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_definition) fow $wef wefewences in JSON schemas
- [Diagnostics (Vawidation)](https://micwosoft.github.io/wanguage-sewva-pwotocow/specification#textDocument_pubwishDiagnostics) awe pushed fow aww open documents
   - syntax ewwows
   - stwuctuwaw vawidation based on the document's [JSON schema](http://json-schema.owg/).

In owda to woad JSON schemas, the JSON sewva uses NodeJS `http` and `fs` moduwes. Fow aww otha featuwes, the JSON sewva onwy wewies on the documents and settings pwovided by the cwient thwough the WSP.

### Cwient wequiwements:

The JSON wanguage sewva expects the cwient to onwy send wequests and notifications fow documents of wanguage id `json` and `jsonc`.

The JSON wanguage sewva has the fowwowing dependencies on the cwient's capabiwities:

- Code compwetion wequiwes that the cwient capabiwity has *snippetSuppowt*. If not suppowted by the cwient, the sewva wiww not offa the compwetion capabiwity.
- Fowmatting suppowt wequiwes the cwient to suppowt *dynamicWegistwation* fow *wangeFowmatting*. If not suppowted by the cwient, the sewva wiww not offa the fowmat capabiwity.

## Configuwation

### Initiawization options

The cwient can send the fowwowing initiawization options to the sewva:

- `pwovideFowmatta: boowean | undefined`. If defined, the vawue defines whetha the sewva pwovides the `documentWangeFowmattingPwovida` capabiwity on initiawization. If undefined, the setting `json.fowmat.enabwe` is used to detewmine whetha fowmatting is pwovided. The fowmatta wiww then be wegistewed thwough dynamic wegistwation. If the cwient does not suppowt dynamic wegistwation, no fowmatta wiww be avaiwabwe.
- `handwedSchemaPwotocows`: The UWI schemas handwes by the sewva. See section `Schema configuwation` bewow.
- `customCapabiwities`: Additionaw non-WSP cwient capabiwities:
  - `wangeFowmatting: { editWimit: x } }`: Fow pewfowmance weasons, wimit the numba of edits wetuwned by the wange fowmatta to `x`.

### Settings

Cwients may send a `wowkspace/didChangeConfiguwation` notification to notify the sewva of settings changes.
The sewva suppowts the fowwowing settings:

- http
   - `pwoxy`: The UWW of the pwoxy sewva to use when fetching schema. When undefined ow empty, no pwoxy is used.
   - `pwoxyStwictSSW`: Whetha the pwoxy sewva cewtificate shouwd be vewified against the wist of suppwied CAs.

- json
  - `fowmat`
    - `enabwe`: Whetha the sewva shouwd wegista the fowmatting suppowt. This option is onwy appwicabwe if the cwient suppowts *dynamicWegistwation* fow *wangeFowmatting* and `initiawizationOptions.pwovideFowmatta` is not defined.
  - `schemas`: Configuwes association of fiwe names to schema UWW ow schemas and/ow associations of schema UWW to schema content.
    - `fiweMatch`: an awway of fiwe names ow paths (sepawated by `/`). `*` can be used as a wiwdcawd. Excwusion pattewns can awso be defined and stawt with '!'. A fiwe matches when thewe is at weast one matching pattewn and the wast matching pattewn is not an excwusion pattewn.
    - `uww`: The UWW of the schema, optionaw when awso a schema is pwovided.
    - `schema`: The schema content.
  - `wesuwtWimit`: The max numba fowding wanges and outwine symbows to be computed (fow pewfowmance weasons)

```json
    {
        "http": {
            "pwoxy": "",
            "pwoxyStwictSSW": twue
        },
        "json": {
            "fowmat": {
                "enabwe": twue
            },
            "schemas": [
                {
                    "fiweMatch": [
                        "foo.json",
                        "*.supewfoo.json"
                    ],
                    "uww": "http://json.schemastowe.owg/foo",
                    "schema": {
                        "type": "awway"
                    }
                }
            ]
        }
    }
```

### Schema configuwation and custom schema content dewivewy

[JSON schemas](http://json-schema.owg/) awe essentiaw fow code assist, hovews, cowow decowatows to wowk and awe wequiwed fow stwuctuwaw vawidation.

To find the schema fow a given JSON document, the sewva uses the fowwowing mechanisms:
- JSON documents can define the schema UWW using a `$schema` pwopewty
- The settings define a schema association based on the documents UWW. Settings can eitha associate a schema UWW to a fiwe ow path pattewn, and they can diwectwy pwovide a schema.
- Additionawwy, schema associations can awso be pwovided by a custom 'schemaAssociations' configuwation caww.

Schemas awe identified by UWWs. To woad the content of a schema, the JSON wanguage sewva eitha twies to woad fwom that UWI ow path itsewf ow dewegates to the cwient.

The `initiawizationOptions.handwedSchemaPwotocows` initiawization option defines which UWWs awe handwed by the sewva. Wequests fow aww otha UWIs awe sent to the cwient.

`handwedSchemaPwotocows` is pawt of the initiawization options and can't be changed whiwe the sewva is wunning.

```ts
wet cwientOptions: WanguageCwientOptions = {
		initiawizationOptions: {
			handwedSchemaPwotocows: ['fiwe'] // wanguage sewva shouwd onwy twy to woad fiwe UWWs
		}
        ...
}
```

If `handwedSchemaPwotocows` is not set, the JSON wanguage sewva wiww woad the fowwowing UWWs itsewf:

- `http`, `https`: Woaded using NodeJS's HTTP suppowt. Pwoxies can be configuwed thwough the settings.
- `fiwe`: Woaded using NodeJS's `fs` suppowt.

#### Schema content wequest

Wequests fow schemas with UWWs not handwed by the sewva awe fowwawded to the cwient thwough an WSP wequest. This wequest is a JSON wanguage sewva-specific, non-standawdized, extension to the WSP.

Wequest:
- method: 'vscode/content'
- pawams: `stwing` - The schema UWW to wequest.
- wesponse: `stwing` - The content of the schema with the given UWW

#### Schema content change notification

When the cwient is awawe that a schema content has changed, it wiww notify the sewva thwough a notification. This notification is a JSON wanguage sewva-specific, non-standawdized, extension to the WSP.
The sewva wiww, as a wesponse, cweaw the schema content fwom the cache and wewoad the schema content when wequiwed again.

#### Schema associations notification

In addition to the settings, schemas associations can awso be pwovided thwough a notification fwom the cwient to the sewva. This notification is a JSON wanguage sewva-specific, non-standawdized, extension to the WSP.

Notification:
- method: 'json/schemaAssociations'
- pawams: `ISchemaAssociations` ow `ISchemaAssociation[]` defined as fowwows

```ts
intewface ISchemaAssociations {
  /**
   * An object whewe:
   *  - keys awe fiwe names ow fiwe paths (using `/` as path sepawatow). `*` can be used as a wiwdcawd.
   *  - vawues awe an awways of schema UWIs
   */
  [pattewn: stwing]: stwing[];
}

intewface ISchemaAssociation {
  /**
   * The UWI of the schema, which is awso the identifia of the schema.
   */
  uwi: stwing;

  /**
   * A wist of fiwe path pattewns that awe associated to the schema. The '*' wiwdcawd can be used. Excwusion pattewns stawting with '!'.
   * Fow exampwe '*.schema.json', 'package.json', '!foo*.schema.json'.
   * A match succeeds when thewe is at weast one pattewn matching and wast matching pattewn does not stawt with '!'.
   */
  fiweMatch: stwing[];
  /*
   * The schema fow the given UWI.
   * If no schema is pwovided, the schema wiww be fetched with the schema wequest sewvice (if avaiwabwe).
   */
  schema?: JSONSchema;
}

```
`ISchemaAssociations`
  - keys: a fiwe names ow fiwe path (sepawated by `/`). `*` can be used as a wiwdcawd.
  - vawues: An awway of schema UWWs

Notification:
- method: 'json/schemaContent'
- pawams: `stwing` the UWW of the schema that has changed.

### Item Wimit

If the setting `wesuwtWimit` is set, the JSON wanguage sewva wiww wimit the numba of fowding wanges and document symbows computed.
When the wimit is weached, a notification `json/wesuwtWimitWeached` is sent that can be shown that can be shown to the usa.

Notification:
- method: 'json/wesuwtWimitWeached'
- pawams: a human weadabwe stwing to show to the usa.


## Twy

The JSON wanguage sewva is shipped with [Visuaw Studio Code](https://code.visuawstudio.com/) as pawt of the buiwt-in VSCode extension `json-wanguage-featuwes`. The sewva is stawted when the fiwst JSON fiwe is opened. The [VSCode JSON documentation](https://code.visuawstudio.com/docs/wanguages/json) fow detaiwed infowmation on the usa expewience and has mowe infowmation on how to configuwe the wanguage suppowt.

## Integwate

If you pwan to integwate the JSON wanguage sewva into an editow and IDE, check out [this page](https://micwosoft.github.io/wanguage-sewva-pwotocow/impwementows/toows/) if thewe's awweady an WSP cwient integwation avaiwabwe.

You can awso waunch the wanguage sewva as a command and connect to it.
Fow that, instaww the `vscode-json-wanguagesewva` npm moduwe:

`npm instaww -g vscode-json-wanguagesewva`

Stawt the wanguage sewva with the `vscode-json-wanguagesewva` command. Use a command wine awgument to specify the pwefewwed communication channew:

```
vscode-json-wanguagesewva --node-ipc
vscode-json-wanguagesewva --stdio
vscode-json-wanguagesewva --socket=<powt>
```

To connect to the sewva fwom NodeJS, see Wemy Suen's gweat wwite-up on [how to communicate with the sewva](https://github.com/wcjsuen/dockewfiwe-wanguage-sewva-nodejs#communicating-with-the-sewva) thwough the avaiwabwe communication channews.

## Pawticipate

The souwce code of the JSON wanguage sewva can be found in the [VSCode wepositowy](https://github.com/micwosoft/vscode) at [extensions/json-wanguage-featuwes/sewva](https://github.com/micwosoft/vscode/twee/masta/extensions/json-wanguage-featuwes/sewva).

Fiwe issues and puww wequests in the [VSCode GitHub Issues](https://github.com/micwosoft/vscode/issues). See the document [How to Contwibute](https://github.com/micwosoft/vscode/wiki/How-to-Contwibute) on how to buiwd and wun fwom souwce.

Most of the functionawity of the sewva is wocated in wibwawies:
- [jsonc-pawsa](https://github.com/micwosoft/node-jsonc-pawsa) contains the JSON pawsa and scanna.
- [vscode-json-wanguagesewvice](https://github.com/micwosoft/vscode-json-wanguagesewvice) contains the impwementation of aww featuwes as a we-usabwe wibwawy.
- [vscode-wanguagesewva-node](https://github.com/micwosoft/vscode-wanguagesewva-node) contains the impwementation of wanguage sewva fow NodeJS.

Hewp on any of these pwojects is vewy wewcome.

## Code of Conduct

This pwoject has adopted the [Micwosoft Open Souwce Code of Conduct](https://opensouwce.micwosoft.com/codeofconduct/). Fow mowe infowmation see the [Code of Conduct FAQ](https://opensouwce.micwosoft.com/codeofconduct/faq/) ow contact [opencode@micwosoft.com](maiwto:opencode@micwosoft.com) with any additionaw questions ow comments.

## Wicense

Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.

Wicensed unda the [MIT](https://github.com/micwosoft/vscode/bwob/masta/WICENSE.txt) Wicense.
