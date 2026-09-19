"""Low service workshop with a loading shutter and pedestrian entry."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seoul_nonretail import build_workshop
from patchwork_pocha import parse_argv

if __name__ == '__main__':
    build_workshop(*parse_argv())
