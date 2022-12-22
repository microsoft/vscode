function compileProgram(): ExitStatus {
    // First get any syntactic errors. 
    var diagnostics = program.getSyntacticDiagnostics();
    reportDiagnostics(diagnostics);

    // If we didn't have any syntactic errors, then also try getting the global and
    // semantic errors.
    if (diagnostics.length === 0) 