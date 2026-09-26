# netcoredbg instead of vsdbg

JustRide needs a .NET debugger for its "run like Rider" experience, but Microsoft's `vsdbg` license permits use only with Visual Studio Code, Visual Studio, and Xamarin — a fork is not covered. We decided to standardize on Samsung's MIT-licensed `netcoredbg` as the .NET debug adapter, wired through the standard Debug Adapter Protocol just like any other debugger.

## Considered Options

- **vsdbg (Microsoft)** — the quality bar Rider/VS users expect, but its license names only Visual Studio Code, Visual Studio, and Xamarin Studio as permitted hosts. A fork shipping it is an unbounded licensing risk.
- **netcoredbg (MIT, Samsung)** — implements the Debug Adapter Protocol, debugs .NET Core/Framework, and is already battle-tested by Unity and fork ecosystems.
- **No debugger in v1** — rejected: breakpoints are the core of the "run like Rider" expectation; shipping run-only would undersell the feature.

## Consequences

- We own the adapter wiring, per-platform binary updates, and version tracking against netcoredbg upstream.
- Debug features that vsdbg has and netcoredbg lacks (if any become load-bearing) may lag or need upstream contribution.
- If Microsoft ever widens the vsdbg license to derivatives, this decision can be revisited without changes outside the debug adapter layer.
