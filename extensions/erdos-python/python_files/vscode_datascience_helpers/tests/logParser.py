import argparse  # noqa: N999
import os
import re
from io import TextIOWrapper
from pathlib import Path

os.system("color")


parser = argparse.ArgumentParser(description="Parse a test log into its parts")
parser.add_argument("testlog", type=str, nargs=1, help="Log to parse")
parser.add_argument("--testoutput", action="store_true", help="Show all failures and passes")
parser.add_argument(
    "--split",
    action="store_true",
    help="Split into per process files. Each file will have the pid appended",
)
ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
pid_regex = re.compile(r"(\d+).*")
timestamp_regex = re.compile(r"\d{4}-\d{2}-\d{2}T.*\dZ")


def strip_timestamp(line: str):
    match = timestamp_regex.match(line)
    if match:
        return line[match.end() :]
    return line


def read_strip_lines(f: TextIOWrapper):
    return map(strip_timestamp, f.readlines())


def print_test_output(testlog):
    # Find all the lines that don't have a PID in them. These are the test output
    p = Path(testlog[0])
    with p.open() as f:
        for line in read_strip_lines(f):
            stripped = line.strip()
            if len(stripped) > 2 and stripped[0] == "\x1b" and stripped[1] == "[":
                print(line.rstrip())  # Should be a test line as it has color encoding


def split_by_pid(testlog):
    # Split testlog into prefixed logs based on pid
    p = Path(testlog[0])
    pids = set()
    logs = {}
    pid = None
    try:
        with p.open() as f:
            for line in read_strip_lines(f):
                stripped = ansi_escape.sub("", line.strip())
                if len(stripped) > 0:
                    # Pull out the pid
                    match = pid_regex.match(stripped)

                    # Pids are at least two digits
                    if match and len(match.group(1)) > 2:
                        # Pid is found
                        pid = int(match.group(1))

                        # See if we've created a log for this pid or not
                        if pid not in pids:
                            pids.add(pid)
                            log_file = p.with_name(f"{p.stem}_{pid}.log")
                            print("Writing to new log:", os.fsdecode(log_file))
                            logs[pid] = log_file.open(mode="w")

                    # Add this line to the log
                    if pid is not None:
                        logs[pid].write(line)
    finally:
        # Close all of the open logs
        for key in logs:
            logs[key].close()


def do_work(args):
    if not args.testlog:
        print("Test log should be passed")
    elif args.testoutput:
        print_test_output(args.testlog)
    elif args.split:
        split_by_pid(args.testlog)
    else:
        parser.print_usage()


def main():
    do_work(parser.parse_args())


if __name__ == "__main__":
    main()
