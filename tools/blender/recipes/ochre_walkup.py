"""Four-storey residential walk-up with no retail frontage."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seoul_nonretail import build_walkup
from patchwork_pocha import parse_argv

if __name__ == '__main__':
    build_walkup(*parse_argv())
