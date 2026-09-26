# .NET Run and Debug

Detects .NET projects and solutions in the workspace and runs or debugs ASP.NET Core (and console) applications through their launch profiles — the Rider/Visual Studio flow, built into JustRide.

## What it does

- **Detects** Web Projects (`Microsoft.NET.Sdk.Web`), Console Projects, and Library Projects from `*.csproj` files, directly or through `.sln` files.
- **Startup Project**: picked automatically when unambiguous, otherwise via `.NET: Select Startup Project`; remembered per workspace.
- **Launch profiles** come from `Properties/launchSettings.json` (`commandName: "Project"` profiles only; IIS Express profiles are ignored). Projects without Launch Settings get an implicit in-memory **Default Profile**.
- **Run**: `dotnet build` (errors matched into the Problems panel via `$msCompile`), then `dotnet run --no-build --launch-profile …` in an integrated terminal; the browser opens when the server listens (`dotnet.autoOpenBrowser`).
- **Debug**: the same pipeline with [netcoredbg](https://github.com/Samsung/netcoredbg) (MIT) attached — breakpoints, variables, call stacks. F5 works with no `launch.json` at all.

## Debug adapter

Per ADR 0001 the debugger is `netcoredbg`, not Microsoft's `vsdbg` (whose license only covers Visual Studio Code, Visual Studio, and Xamarin). The `netcoredbg` debug adapter binaries are committed under `netcoredbg/<platform>/` for the platforms upstream publishes: win-x64, linux-x64, linux-arm64, and osx-arm64 (no osx-x64 asset exists upstream; osx-x64 users can point `dotnet.netcoredbgPath` at a self-built binary, or run the fetch script which errors clearly for missing platforms). If they are missing, run `.NET: Download Debug Adapter (netcoredbg)` or:

```
node scripts/fetch-netcoredbg.mjs [--platform win-x64|linux-x64|linux-arm64|osx-x64|osx-arm64]
```

## Commands

| Command | Purpose |
|---|---|
| `.NET: Select Startup Project` | Pick which runnable project to start (remembered) |
| `.NET: Select Launch Profile` | Re-pick the launch profile for the Startup Project |
| `.NET: Run Startup Project` | Build + run without the debugger |
| `.NET: Debug Startup Project` | Build + run under netcoredbg |
| `.NET: Download Debug Adapter (netcoredbg)` | Fetch the platform's netcoredbg binary |
