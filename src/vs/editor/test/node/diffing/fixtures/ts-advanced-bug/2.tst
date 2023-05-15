function compileProgram(): ExitStatus {
    let diagnostics: Diagnostic[];
    
    // First get and report any syntactic errors.
    diagnostics = program.getSyntacticDiagnostics();

    // If we didn't have any syntactic errors, then also try getting the global and
    // semantic errors.
    if (diagnostics.length === 0) {