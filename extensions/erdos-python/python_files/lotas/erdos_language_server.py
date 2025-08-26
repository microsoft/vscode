"""Entry point for launching Erdos's extensions to Jedi and IPyKernel in the same environment."""  # noqa: INP001

import argparse
import asyncio
import asyncio.events
import logging
import os
import sys

# Add the parent directory to sys.path so we can import erdos modules
script_dir = os.path.dirname(os.path.abspath(__file__))
python_files_dir = os.path.dirname(script_dir)  # Go up one level to python_files
if python_files_dir not in sys.path:
    sys.path.insert(0, python_files_dir)

from erdos.erdos_ipkernel import (
    ErdosIPKernelApp,
    ErdosIPyKernel,
    ErdosShell,
)
from erdos.erdos_jedilsp import ERDOS
from erdos.session_mode import SessionMode

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    # Given we're using TCP, support a subset of the Jedi LSP configuration
    parser = argparse.ArgumentParser(
        prog="erdos-language-server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="Erdos Jedi language server: an LSP wrapper for jedi.",
    )

    parser.add_argument(
        "--debugport",
        help="port for debugpy debugger",
        type=int,
        default=None,
    )
    parser.add_argument(
        "--logfile",
        help="redirect logs to file specified",
        type=str,
    )
    parser.add_argument(
        "--loglevel",
        help="logging level",
        type=str,
        default="error",
        choices=["critical", "error", "warn", "info", "debug"],
    )
    parser.add_argument(
        "-f",
        "--connection-file",
        help="location of the IPyKernel connection file",
        type=str,
    )
    parser.add_argument(
        "-q",
        "--quiet",
        help="Suppress console startup banner information",
        action="store_true",
    )
    parser.add_argument(
        "--session-mode",
        help="session mode in which the kernel is to be started",
        type=SessionMode,
        default=SessionMode.DEFAULT,
        choices=sorted(SessionMode),
    )
    args = parser.parse_args()
    args.loglevel = args.loglevel.upper()

    return args


if __name__ == "__main__":
    exit_status = 0

    # Parse command-line arguments
    args = parse_args()

    # Start the debugpy debugger if a port was specified
    if args.debugport is not None:
        try:
            import debugpy

            debugpy.listen(args.debugport)
        except Exception as error:
            logger.warning(f"Unable to start debugpy: {error}", exc_info=True)

    # Configure logging by passing the IPKernelApp traitlets application by passing a logging config
    # dict. See: https://docs.python.org/3/library/logging.config.html#logging-config-dictschema for
    # more info about this schema.
    handlers = ["console"] if args.logfile is None else ["file"]
    logging_config = {
        "loggers": {
            "ErdosIPKernelApp": {
                "level": args.loglevel,
                "handlers": handlers,
            },
            "Comm": {
                "level": args.loglevel,
                "handlers": handlers,
            },
            "erdos": {
                "level": args.loglevel,
                "handlers": handlers,
            },
            "asyncio": {
                "level": args.loglevel,
                "handlers": handlers,
            },
        }
    }
    if args.logfile is not None:
        logging_config["handlers"] = {
            "file": {
                "class": "logging.FileHandler",
                "formatter": "console",
                "level": args.loglevel,
                "filename": args.logfile,
            }
        }

    # IPKernelApp expects an empty string if no connection_file is provided.
    if args.connection_file is None:
        args.connection_file = ""

    # Start Erdos's IPyKernel as the interpreter for our console.
    app: ErdosIPKernelApp = ErdosIPKernelApp.instance(
        connection_file=args.connection_file,
        log_level=args.loglevel,
        logging_config=logging_config,
        session_mode=args.session_mode,
    )
    # Initialize with empty argv, otherwise BaseIPythonApplication.initialize reuses our
    # command-line arguments in unexpected ways (e.g. logfile instructs it to log executed code).
    app.initialize(argv=[])
    assert app.kernel is not None, "Kernel was not initialized"
    # Disable the banner if running in quiet mode.
    if args.quiet:
        app.kernel.shell.banner1 = ""

    app.kernel.start()

    logger.info(f"Process ID {os.getpid()}")

    # IPyKernel uses Tornado which (as of version 5.0) shares the same event
    # loop as asyncio.
    loop: asyncio.events.AbstractEventLoop = asyncio.get_event_loop_policy().get_event_loop()

    # Enable asyncio debug mode.
    if args.loglevel == "DEBUG":
        loop.set_debug(True)
        ERDOS.set_debug(True)

        # Log all callbacks that take longer than 0.5 seconds (the current default is too noisy).
        loop.slow_callback_duration = 0.5

    try:
        loop.run_forever()
    except (KeyboardInterrupt, SystemExit):
        logger.exception("Unexpected exception in event loop")
        exit_status = 1
    finally:
        loop.close()

    # When the app is gone, it should be safe to clear singleton instances.
    # This allows re-starting the ipykernel in the same process, using different
    # connection strings, etc.
    ErdosShell.clear_instance()
    ErdosIPyKernel.clear_instance()
    ErdosIPKernelApp.clear_instance()
    app.close()

    logger.info(f"Exiting process with status {exit_status}")
    sys.exit(exit_status)