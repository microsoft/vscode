"""
Load content in file.
"""

import sys

def load_file_content(file_name, start_line=0, end_line=1000):
    """
    Load content in file from start_line to end_line.
    If start_line and end_line are not provided, load the whole file.
    """
    try:
        with open(file_name, 'r') as file:
            lines = file.readlines()
            if start_line < 0 or end_line <= start_line:
                sys.stderr.write("Error: start line must be greater than or equal to 0 and end line must be greater than start line.\n")
                sys.exit(1)
            content = "".join(lines[int(start_line):int(end_line)])
            if len(content.split('\n')) > 500:
                sys.stderr.write("Error: The content is too large, please set a reasonable reading range.\n")
                sys.exit(1)
            return content
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    file_name = sys.argv[1]
    start_line = int(sys.argv[2]) if sys.argv[2] != '${startLine}' else 0
    end_line = int(sys.argv[3]) if sys.argv[3] != '${endLine}' else 1000
    
    print(load_file_content(file_name, start_line, end_line))
    sys.exit(0)