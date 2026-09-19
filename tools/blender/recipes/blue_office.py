"""Five-storey small office with a lobby instead of a shop."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seoul_nonretail import build_office
from patchwork_pocha import parse_argv

if __name__ == '__main__':
    build_office(*parse_argv())
