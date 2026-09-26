# JustRide

JustRide is a fork of Code OSS rebranded as a standalone code editor. This context covers the .NET project running experience (the "run like Rider" feature) contributed by the built-in `dotnet` extension.

## Language

### .NET Projects

**Web Project**:
A `.csproj` whose SDK is `Microsoft.NET.Sdk.Web` — an ASP.NET Core application that can be run and serves HTTP.
_Avoid_: ASP project, web app, "asp core project"

**Library Project**:
A `.csproj` that is not a Web Project and exposes no entry point — it can be built but never run.
_Avoid_: class project, dependency

**Console Project**:
A `.csproj` with an entry point that is not a Web Project — buildable and runnable, but serves no HTTP.
_Avoid_: exe project

**Solution**:
A `.sln` or `.slnx` file listing one or more projects; the solution-centric view is how multi-project workspaces are navigated.
_Avoid_: workspace (that's a JustRide concept)

**Startup Project**:
The single project the user chose to run in the current workspace; remembered per workspace. Every workspace has at most one.
_Avoid_: main project, active project

### Running

**Launch Settings**:
A project's `Properties/launchSettings.json` — the per-project file describing how the project can be launched.
_Avoid_: launch config (that's a JustRide debug/launch configuration)

**Launch Profile**:
A `commandName: "Project"` entry inside Launch Settings: environment variables, application URLs, and command-line arguments for one way of running the project. IIS Express profiles are ignored.
_Avoid_: run profile, launch configuration

**Default Profile**:
An implicit in-memory Launch Profile synthesized for a project whose Launch Settings are absent (or, in future, as a fallback entry) — plain `dotnet run` with no environment overrides. Never written to disk.
_Avoid_: generated profile

**Run**:
Starting a Startup Project's selected Launch Profile as a plain process (build, then launch, no debugger).
_Avoid_: launch, execute, play

**Debug**:
Running as above with a debugger attached, enabling breakpoints and inspection. JustRide uses the MIT-licensed netcoredbg adapter; `vsdbg` is legally restricted to Visual Studio Code/Visual Studio and must not be used.
