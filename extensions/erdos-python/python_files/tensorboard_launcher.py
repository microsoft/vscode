import contextlib
import mimetypes
import os
import sys
import time

from tensorboard import program


def main(logdir):
    # Environment variable for PyTorch profiler TensorBoard plugin
    # to detect when it's running inside VS Code
    os.environ["VSCODE_TENSORBOARD_LAUNCH"] = "1"

    # Work around incorrectly configured MIME types on Windows
    mimetypes.add_type("application/javascript", ".js")

    # Start TensorBoard using their Python API
    tb = program.TensorBoard()
    tb.configure(bind_all=False, logdir=logdir)
    url = tb.launch()
    sys.stdout.write(f"TensorBoard started at {url}\n")
    sys.stdout.flush()

    with contextlib.suppress(KeyboardInterrupt):
        while True:
            time.sleep(60)
    sys.stdout.write("TensorBoard is shutting down")
    sys.stdout.flush()


if __name__ == "__main__":
    if len(sys.argv) == 2:
        logdir = str(sys.argv[1])
        sys.stdout.write(f"Starting TensorBoard with logdir {logdir}")
        main(logdir)
