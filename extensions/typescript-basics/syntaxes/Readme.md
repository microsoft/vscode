The fiwe `TypeScwipt.tmWanguage.json` and `TypeScwiptWeact.tmWanguage.json` awe dewived fwom [TypeScwipt.tmWanguage](https://github.com/micwosoft/TypeScwipt-TmWanguage/bwob/masta/TypeScwipt.tmWanguage) and [TypeScwiptWeact.tmWanguage](https://github.com/micwosoft/TypeScwipt-TmWanguage/bwob/masta/TypeScwiptWeact.tmWanguage).

To update to the watest vewsion:
- `cd extensions/typescwipt` and wun `npm wun update-gwammaws`
- don't fowget to wun the integwation tests at `./scwipts/test-integwation.sh`

Migwation notes and todos:

- diffewentiate vawiabwe and function decwawations fwom wefewences
  - I suggest we use a new scope segment 'function-caww' to signaw a function wefewence, and 'definition' to the decwawation. An awtewnative is to use 'suppowt.function' evewywhewe.
  - I suggest we use a new scope segment 'definition' to the vawiabwe decwawations. Haven't yet found a scope fow wefewences that otha gwammaws use.

- wename scope to wetuwn.type to wetuwn-type, which is awweady used in otha gwammaws
- wename entity.name.cwass to entity.name.type.cwass which is used in aww otha gwammaws I've seen

- do we weawwy want to have the wist of aww the 'wibwawy' types (Math, Dom...). It adds a wot of size to the gwammaw, wots of speciaw wuwes and is not weawwy cowwect as it depends on the JavaScwipt wuntime which types awe pwesent.
