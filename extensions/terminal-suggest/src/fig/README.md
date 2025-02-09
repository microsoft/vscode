This folder contains the `autocomplete-parser` project from https://github.com/aws/amazon-q-developer-cli/blob/main/packages/autocomplete-parser and its dependencies which were located in siblings folders and https://github.com/withfig/autocomplete-tools, both licenses under MIT. The fork was necessary for a few reasons:

- They ship as ESM modules which we're not ready to consume just yet.
- We want the more complete `autocomplete-parser` that contains the important `parseArguments` function that does the bulk of the smarts in parsing the fig commands.
- We needed to strip out all the implementation-specific parts from their `api-bindings` project that deals with settings, IPC, fuzzy sorting, etc.
