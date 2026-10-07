"""Admin CLI, run on the server as marcel (member of wyziportal):

    cd /opt/wyzi-server/portal/backend
    .venv/bin/python -m app.admin set-password     # prompts twice; signs out all sessions
    .venv/bin/python -m app.admin status
"""
from __future__ import annotations

import getpass
import sys

from . import auth, config


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "status"
    if cmd == "set-password":
        pw = getpass.getpass("New portal password: ")
        if pw != getpass.getpass("Repeat password: "):
            print("passwords do not match", file=sys.stderr)
            return 1
        try:
            auth.write_admin(pw)
        except ValueError as e:
            print(e, file=sys.stderr)
            return 1
        print(f"password set in {auth.hash_path()} — all existing portal sessions are signed out")
        return 0
    if cmd == "status":
        print(f"data dir: {config.DATA_DIR}")
        print(f"admin password configured: {auth.configured()}")
        return 0
    print(__doc__)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))
