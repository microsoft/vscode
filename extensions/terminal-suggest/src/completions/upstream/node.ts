import { filepaths } from '../../helpers/filepaths';

const completionSpec: Fig.Subcommand = {
	name: "node",
	description: "Run the node interpreter",
	args: {
		name: "node script",
		isScript: true,
		generators: filepaths({
			extensions: ["mjs", "js", "cjs"],
			editFileSuggestions: { priority: 76 },
		}),
	},
	options: [
		{
			name: ["-e", "--eval=..."],
			insertValue: "-e '{cursor}'",
			description: "Evaluate script",
			args: {},
		},
		{
			name: "--watch",
			description: "Watch input files",
		},
		{
			name: "--watch-path",
			description: "Specify a watch directory or file",
			args: {
				name: "path",
				template: "filepaths",
			},
			isRepeatable: true,
		},
		{
			name: "--watch-preserve-output",
			description:
				"Disable the clearing of the console when watch mode restarts the process",
			dependsOn: ["--watch", "--watch-path"],
		},
		{
			name: "--env-file",
			description: "Specify a file containing environment variables",
			args: {
				name: "path",
				template: "filepaths",
			},
			isRepeatable: true,
		},
		{
			name: ["-p", "--print"],
			description: "Evaluate script and print result",
		},
		{
			name: ["-c", "--check"],
			description: "Syntax check script without executing",
		},
		{
			name: ["-v", "--version"],
			description: "Print Node.js version",
		},
		{
			name: ["-i", "--interactive"],
			description:
				"Always enter the REPL even if stdin does not appear to be a terminal",
		},
		{
			name: ["-h", "--help"],
			description: "Print node command line options (currently set)",
		},
		{
			name: "--inspect",
			requiresSeparator: true,
			args: {
				name: "[host:]port",
				isOptional: true,
			},
			description: "Activate inspector on host:port (default: 127.0.0.1:9229)",
		},
		{
			name: "--preserve-symlinks",
			description:
				"Follows symlinks to directories when examining source code and templates for translation strings",
		},
	],
	// generateSpec: async (tokens, executeShellCommand) => {
	//   const isAdonisJsonPresentCommand = "test -f .adonisrc.json";
	//   if (
	//     (
	//       await executeShellCommand({
	//         command: "bash",
	//         args: ["-c", "isAdonisJsonPresentCommand"],
	//       })
	//     ).status === 0
	//   ) {
	//     return {
	//       name: "node",
	//       subcommands: [
	//         {
	//           name: "ace",
	//           description: "Run AdonisJS command-line",
	//           options: [
	//             {
	//               name: ["-h", "--help"],
	//               description: "Display AdonisJS Ace help",
	//             },
	//             {
	//               name: ["-v", "--version"],
	//               description: "Display AdonisJS version",
	//             },
	//           ],
	//           subcommands: [
	//             {
	//               name: "build",
	//               description:
	//                 "Compile project from Typescript to Javascript. Also compiles the frontend assets if using webpack encore",
	//               options: [
	//                 {
	//                   name: ["-prod", "--production"],
	//                   description: "Build for production",
	//                 },
	//                 {
	//                   name: "--assets",
	//                   description:
	//                     "Build frontend assets when webpack encore is installed",
	//                 },
	//                 {
	//                   name: "--no-assets",
	//                   description: "Disable building assets",
	//                 },
	//                 {
	//                   name: "--ignore-ts-errors",
	//                   description:
	//                     "Ignore typescript errors and complete the build process",
	//                 },
	//                 {
	//                   name: "--tsconfig",
	//                   description:
	//                     "Path to the TypeScript project configuration file",
	//                   args: {
	//                     name: "path",
	//                     description: "Path to tsconfig.json",
	//                   },
	//                 },
	//                 {
	//                   name: "--encore-args",
	//                   requiresSeparator: true,
	//                   insertValue: "--encore-args='{cursor}'",
	//                   description:
	//                     "CLI options to pass to the encore command line",
	//                 },
	//                 {
	//                   name: "--client",
	//                   args: {
	//                     name: "name",
	//                   },
	//                   description:
	//                     "Select the package manager to decide which lock file to copy to the build folder",
	//                 },
	//               ],
	//             },
	//             {
	//               name: ["configure", "invoke"],
	//               description: "Configure a given AdonisJS package",
	//               args: {
	//                 name: "name",
	//                 description: "Name of the package you want to configure",
	//               },
	//               subcommands: [
	//                 {
	//                   name: "@adonisjs/auth",
	//                   description: "Trigger auto configuring auth package",
	//                 },
	//                 {
	//                   name: "@adonisjs/shield",
	//                   description: "Trigger auto configuring shield package",
	//                 },
	//                 {
	//                   name: "@adonisjs/redis",
	//                   description: "Trigger auto configuring redis package",
	//                 },
	//                 {
	//                   name: "@adonisjs/mail",
	//                   description: "Trigger auto configuring mail package",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "repl",
	//               description: "Start a new REPL session",
	//             },
	//             {
	//               name: "serve",
	//               description:
	//                 "Start the AdonisJS HTTP server, along with the file watcher. Also starts the webpack dev server when webpack encore is installed",
	//               options: [
	//                 {
	//                   name: "--assets",
	//                   description:
	//                     "Start webpack dev server when encore is installed",
	//                 },
	//                 {
	//                   name: "--no-assets",
	//                   description: "Disable webpack dev server",
	//                 },
	//                 {
	//                   name: ["-w", "--watch"],
	//                   description:
	//                     "Watch for file changes and re-start the HTTP server on change",
	//                 },
	//                 {
	//                   name: ["-p", "--poll"],
	//                   description:
	//                     "Detect file changes by polling files instead of listening to filesystem events",
	//                 },
	//                 {
	//                   name: "--node-args",
	//                   requiresSeparator: true,
	//                   insertValue: "--node-args='{cursor}'",
	//                   description: "CLI options to pass to the node command line",
	//                 },
	//                 {
	//                   name: "--encore-args",
	//                   requiresSeparator: true,
	//                   insertValue: "--encore-args='{cursor}'",
	//                   description:
	//                     "CLI options to pass to the encore command line",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "db:seed",
	//               description: "Execute database seeder files",
	//               options: [
	//                 {
	//                   name: ["-c", "--connection"],
	//                   description:
	//                     "Define a custom database connection for the seeders",
	//                   args: {
	//                     name: "name",
	//                   },
	//                 },
	//                 {
	//                   name: ["-i", "--interactive"],
	//                   description: "Run seeders in interactive mode",
	//                 },
	//                 {
	//                   name: ["-f", "--files"],
	//                   args: {
	//                     name: "file",
	//                     isVariadic: true,
	//                     template: "filepaths",
	//                   },
	//                   description:
	//                     "Define a custom set of seeders files names to run",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "dump:rcfile",
	//               description:
	//                 "Dump contents of .adonisrc.json file along with defaults",
	//             },
	//             {
	//               name: "generate:key",
	//               description: "Generate a new APP_KEY secret",
	//             },
	//             {
	//               name: "generate:manifest",
	//               description:
	//                 "Generate ace commands manifest file. Manifest file speeds up commands lookup",
	//             },
	//             {
	//               name: "list:routes",
	//               description: "List application routes",
	//             },
	//             {
	//               name: "make:command",
	//               description: "Make a new ace command",
	//             },
	//             {
	//               name: "make:controller",
	//               description: "Make a new HTTP controller",
	//               args: {
	//                 name: "name",
	//                 description: "Name of the controller class",
	//               },
	//               options: [
	//                 {
	//                   name: ["-r", "--resource"],
	//                   description:
	//                     "Add resourceful methods to the controller class",
	//                 },
	//                 {
	//                   name: ["-e", "--exact"],
	//                   description:
	//                     "Create the controller with the exact name as provided",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "make:exception",
	//               description: "Make a new custom exception class",
	//             },
	//             {
	//               name: "make:listener",
	//               description: "Make a new event listener class",
	//             },
	//             {
	//               name: "make:mailer",
	//               description: "Make a new mailer class",
	//               args: {
	//                 name: "name",
	//                 description: "Mailer class name",
	//               },
	//             },
	//             {
	//               name: "make:middleware",
	//               description: "Make a new middleware",
	//               args: {
	//                 name: "name",
	//                 description: "Middleware class name",
	//               },
	//             },
	//             {
	//               name: "make:migration",
	//               description: "Make a new migration file",
	//               args: {
	//                 name: "name",
	//                 description: "Name of the migration file",
	//               },
	//               options: [
	//                 {
	//                   name: "--connection",
	//                   description:
	//                     "The connection flag is used to lookup the directory for the migration file",
	//                   args: {
	//                     name: "name",
	//                   },
	//                 },
	//                 {
	//                   name: "--folder",
	//                   description: "Pre-select a migration directory",
	//                   args: {
	//                     name: "name",
	//                     template: "filepaths",
	//                   },
	//                 },
	//                 {
	//                   name: "--create",
	//                   description:
	//                     "Define the table name for creating a new table",
	//                   args: {
	//                     name: "name",
	//                   },
	//                 },
	//                 {
	//                   name: "--table",
	//                   description:
	//                     "Define the table name for altering an existing table",
	//                   args: {
	//                     name: "name",
	//                   },
	//                 },
	//               ],
	//             },
	//             {
	//               name: "make:model",
	//               description: "Make a new Lucid model",
	//               args: {
	//                 name: "name",
	//                 description: "Name of the model class",
	//               },
	//               options: [
	//                 {
	//                   name: ["-m", "--migration"],
	//                   description: "Generate the migration for the model",
	//                 },
	//                 {
	//                   name: ["-c", "--controller"],
	//                   description: "Generate the controller for the model",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "make:prldfile",
	//               description: "Make a new preload file",
	//               subcommands: [
	//                 {
	//                   name: "events",
	//                   description: "Make events preload file",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "make:provider",
	//               description: "Make a new provider class",
	//             },
	//             {
	//               name: "make:seeder",
	//               description: "Make a new Seeder file",
	//               args: {
	//                 name: "name",
	//                 description: "Name of the seeder class",
	//               },
	//             },
	//             {
	//               name: "make:validator",
	//               description: "Make a new validator",
	//               args: {
	//                 name: "name",
	//                 description: "Name of the validator class",
	//               },
	//               options: [
	//                 {
	//                   name: ["-e", "--exact"],
	//                   description:
	//                     "Create the validator with the exact name as provided",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "make:view",
	//               description: "Make a new view template",
	//               args: {
	//                 name: "name",
	//                 description: "Name of the view",
	//               },
	//               options: [
	//                 {
	//                   name: ["-e", "--exact"],
	//                   description:
	//                     "Create the template file with the exact name as provided",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "migration:rollback",
	//               description: "Rollback migrations to a given batch number",
	//               options: [
	//                 {
	//                   name: ["-c", "--connection"],
	//                   description: "Define a custom database connection",
	//                   args: {
	//                     name: "name",
	//                   },
	//                 },
	//                 {
	//                   name: "--force",
	//                   description:
	//                     "Explicitly force to run migrations in production",
	//                   isDangerous: true,
	//                 },
	//                 {
	//                   name: "--dry-run",
	//                   description:
	//                     "Print SQL queries, instead of running the migrations",
	//                 },
	//                 {
	//                   name: "--batch",
	//                   args: {
	//                     name: "number",
	//                     description: "Use 0 to rollback to initial state",
	//                   },
	//                   description: "Define custom batch number for rollback",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "migration:run",
	//               description: "Run pending migrations",
	//               options: [
	//                 {
	//                   name: ["-c", "--connection"],
	//                   description: "Define a custom database connection",
	//                   args: {
	//                     name: "name",
	//                   },
	//                 },
	//                 {
	//                   name: "--force",
	//                   description:
	//                     "Explicitly force to run migrations in production",
	//                   isDangerous: true,
	//                 },
	//                 {
	//                   name: "--dry-run",
	//                   description:
	//                     "Print SQL queries, instead of running the migrations",
	//                 },
	//               ],
	//             },
	//             {
	//               name: "migration:status",
	//               description: "Check migrations current status",
	//             },
	//           ],
	//         },
	//       ],
	//     };
	//   }
	// },
};

export default completionSpec;
