# Agent Host URI projection

The Agent Host Protocol (AHP) represents every URI as a JSON string. VS Code
application code must instead receive native `URI` objects whose resources are
routable through the connection that produced them.

URI projection keeps the wire protocol unchanged while enforcing that boundary:

```text
AHP URI strings
    -> generated native projection
    -> connection-scoped routing policy
    -> VS Code URI objects
```

The reverse path converts native application values back to AHP strings before
they enter optimistic reducers or cross the wire.

## Two separate decisions

Projection deliberately separates these questions:

1. **Which values are URIs?** The generator answers this from protocol types.
2. **Which URIs require connection routing?** The runtime policy answers this
   from URI structure and connection state.

The protocol does not need separate `ChannelUri` and `ResourceUri` wire types.
Generated codecs pass every URI-typed value through the same runtime policy.

## Discovering URI values

[`scripts/generate-agent-host-uri-projections.ts`](../../../../../../../scripts/generate-agent-host-uri-projections.ts)
contains an explicit manifest of application-facing roots. Starting at each
root, it uses the TypeScript type checker to recursively traverse interfaces and
arrays.

A property is a URI only when its type resolves to the canonical AHP declaration:

```ts
export type URI = string;
```

Property names such as `resource`, `uri`, or `path` have no special meaning.

For example, starting from `AnnotationsState` discovers:

```text
AnnotationsState.annotations
  -> Annotation[]
    -> Annotation.origin
      -> AnnotationOrigin.session: URI
      -> AnnotationOrigin.chat?: URI
    -> Annotation.resource: URI
```

The generator emits native overlay types and recursive codecs for this graph.
Adding another URI-bearing field below an enrolled root updates the generated
types and codecs without a generator change.

Roots may select individual properties when only part of a protocol result
crosses the native boundary. `InitializeResult`, for example, currently projects
`defaultDirectory` while leaving snapshots wire-shaped for reducers, replay, and
reconnect.

## Classifying URI values at runtime

`AgentHostUriProjectionContext` owns one policy per `IAgentConnection`.
Decoding first parses the wire string into a `URI`, then applies these rules in
order:

1. Preserve known protocol channels.
2. Preserve external or self-contained URIs.
3. Preserve resources that already carry Agent Host or Agent Client routing.
4. Treat every remaining URI as a resource owned by the Agent Host endpoint.

The default is intentionally resource mapping. Resource schemes are open-ended:
`file`, `git-blob`, notebook schemes, and provider-defined virtual files can all
name endpoint-owned content.

### Protocol channels

Standard channels are recognized by their structural parsers or reserved
schemes, including root, chat, annotations, changeset, resource-watch, MCP, and
OTLP channels.

Provider-defined session schemes cannot be classified by scheme alone. The
connection therefore registers exact channel identities whenever it subscribes
or dispatches. An annotations subscription also registers its parsed parent
session channel.

### Values preserved without resource mapping

These values remain in their existing namespace:

- external and self-contained `http`, `https`, and `data` URIs;
- `vscode-agent-client` resources already routed toward a client;
- `vscode-agent-host` resources already routed through an Agent Host connection
  when decoding.

### Endpoint-owned resources

All other values decode through:

```ts
connection.resourceUris.fromAgentHost(uri)
```

For a remote connection:

```text
file:///Q:/repo/file.ts
    -> vscode-agent-host://<connection>/Q:/repo/file.ts?...metadata...
```

The wrapper retains the original scheme, authority, query, and fragment. Opening
the native URI uses the existing Agent Host filesystem provider and therefore
reaches the correct endpoint regardless of the client's operating system.

For an ambient connection the mapper is the identity function.

## Encoding values back to AHP

Encoding applies the inverse policy:

- channels serialize in their protocol namespace;
- external and client-routed URIs serialize unchanged;
- host-routed resources pass through
  `connection.resourceUris.toAgentHost(uri)` and recover the endpoint-native
  URI.

Thus an application can dispatch a native annotation resource such as
`vscode-agent-host://...`, while the wire action still contains
`file:///Q:/repo/file.ts`.

## Boundary ownership

Raw protocol values remain string-based in:

- transport messages;
- reducers and optimistic state;
- replay and reconnect;
- persistence;
- wire logging.

Application-facing projections expose native `URI` values. Feature code should
not parse protocol URI strings, stringify native URIs for mapping, or call
`resourceUris` directly. `IAgentConnection.dispatch` accepts native projected
actions and performs encoding before optimistic reduction and transport, so
feature code must not invoke projection-specific dispatch helpers.

Opaque `_meta` fields and VS Code-owned sidecars are outside the protocol type
graph. They require an explicit boundary adapter, such as the plan-review
projection, until their URI-bearing shape becomes a typed protocol declaration.

## Updating the boundary

When syncing an AHP change:

1. Run `npx tsx scripts/sync-agent-host-protocol.ts`.
2. If an enrolled root gained nested URI fields, inspect the regenerated output;
   no manifest change should be necessary.
3. If a new protocol result or state surface will be consumed by application
   code, add it to the projection root manifest.
4. Add explicit union or envelope configuration only where the boundary narrows
   a broad protocol union.
5. Run the generator with `--check` and the relevant projection tests.

The sync script invokes generation automatically. Generated-output checks ensure
the checked-in projection cannot silently drift from the synchronized protocol.
