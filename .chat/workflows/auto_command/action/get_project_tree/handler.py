"""
get project files by "git ls-files" command
如果项目文件数超出100，那么结束执行，退出码为1，并且输出英文：”文件数太多，需要通过ls命令逐层查看各个目录中的文件、目录结构信息“
"""

import subprocess
import sys

def get_project_tree():
    """
    Get project files by "git ls-files" command
    """
    try:
        output = subprocess.check_output(["git", "ls-files"]).decode("utf-8").split("\n")
        if len(output) > 100:
            sys.stderr.write("Error: Too many files, you need to view the files and directory structure in each directory through the 'ls' command.\n")
            sys.exit(1)
        return output
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    print(get_project_tree())
    sys.exit(0)