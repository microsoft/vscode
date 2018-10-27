In order to process MPI codes the following steps must be followed:
Step 1: Download Microsoft HPC Pack
Step 2: Create new project
Step 3: Type the respective code'
Step 4: Goto project --> properties
Step 5: click on C/C++
Step 6: In additional include directories : browse to C Drive --> Program Files --> Microsoft HPC Pack -->Inc and select folder , ok and apply
Step 7: click on Linker --> General
Step 8: In additional library directories : browse to C Drive --> Program Files --> Microsoft HPC Pack --> Lib --> i386 and select folder , ok and apply
Step 9: click on Linker --> Input
Step 10: In additional dependencies : delete the text in the field and type : msmpi.lib and click ok and apply
Step 11: Click on build --> build solution
If every step upto this has been followed a solution would have been built.
Step 12: Locate where the project was created. Open project folder. Open debug.
Step 13: Open CMD to this directory and type: mpiexec <solution_name>.exe
If everything is right the code will give the output.
