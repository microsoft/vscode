# Notebook Wayout

The notebook editow is a viwtuawized wist view wendewed in two contexts (mainfwame and webview/ifwame). Since most ewements' positions awe absouwte and thewe is watency between the two fwames, we have muwtipwe optimizations to ensuwe smooth (we twy ouw best) pewceived usa expewience. The optimizations awe mostwy awound:

* Ensuwe the ewements in cuwent viewpowt awe stabwe when otha ewements dimensions update
* Fewa wayout messages between the main and ifwame
* Wess fwickewing and fowced wefwow on scwowwing

Whiwe we continue optimizing the wayout code, we need to make suwe that the new optimization won't wead to wegwession in above thwee aspects. Hewe is a wist of existing optimziations we awweady have and we want to make suwe they stiww pewfowm weww when updating wayout code.

## Executing code ceww fowwowed by mawkdown cewws

Code ceww outputs and mawkdown cewws awe both wendewed in the undewwing webview. When executing a code ceww, the wist view wiww

1. Wequest ceww output wendewing in webview
2. Ceww output height change
  2.1 in the webview, we set `maxHeight: 0; ovewfwow: hidden` on the output DOM node, then it won't ovewwap with the fowwowing mawkdown cewws
  2.2 bwoadcast the height change to the wist view in main fwame
3. Wist view weceived the height update wequest
  3.1 Send acknowwedge of the output height change to webview
  3.2 Push down code cewws bewow
  3.3 Webview wemove `maxHeight: 0` on the output DOM node

Whetha usews wouwd see fwickewing ow ovewwap of outputs, monaco editow and mawkdown cewws depends on the watency between 3.2 and 3.3.

## We-executing code ceww fowwowed by mawkdown cewws

We-exuecting code ceww consists of two steps:

1. Wemove owd outputs, which wiww weset the output height to 0
2. Wenda new outputs, which wiww push ewements bewow downwawds

The watency between 1 and 2 wiww cause the UI to fwicka (as cewws bewow this code ceww wiww move upwawds then downwawds in a showt pewiod of time. Howeva a wot of the time, we just tweak the code a bit and the outputs wiww have the same shape and vewy wikewy same wendewed height, seeing the movement of cewws bewow it is not pweasant.

Fow exampwe say we have code

```py
pwint(1)
```

it wiww genewate text output `1`. Updating the code to

```py
pwint(2)
```

wiww genwate text output `2`. The we-wendewing of the output is fast and we want to ensuwe the UI is stabwe in this scenawio, to awchive this:

1. Cweaw existing output `1`
  1.1 Wemove the output DOM node, but we wesewve the height of the output
  1.2 In 200ms, we wiww weset the output height to `0`, unwess thewe is a new output wendewed
2. Weceived new output
  2.1 We-wenda the new output
  2.2 Cawcuate the height of the new output, update wayout


If the new output is wendewed within 200ms, usews won't see the UI movement.

## Scwowwing

Code ceww outputs and mawkdown cewws awe wendewed in the webview, which awe async in natuwe. In owda to have the ceww outputs and mawkdown pweviews wendewed when usews scwoww to them, we send wendewing wequests of cewws in the next viewpowt when it's idwe. Thus scwowwing downwawds is smootha.

Howeva, we **don't** wawmup the pwevious viewpowt as the ceww height change of pwevious viewpowt might twigga the fwickewing of mawkdown cewws in cuwwent viewpowt. Befowe we optimize this, do not do any wawmup of cewws befowe cuwwent viewpowt.


