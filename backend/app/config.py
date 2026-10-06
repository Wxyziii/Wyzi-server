"""Static configuration. Every path can be overridden with an environment variable
so the backend can be exercised against a fixture tree during development/tests."""
from __future__ import annotations

import os
import re
from pathlib import Path


def _p(name: str, default: str) -> Path:
    return Path(os.environ.get(name, default))


INSTANCE_ENV_DIR = _p("WYZI_INSTANCE_ENV_DIR", "/etc/wyzi-server/instances")
INSTANCES_DIR = _p("WYZI_INSTANCES_DIR", "/srv/minecraft/instances")
MINECRAFT_ROOT = _p("WYZI_MINECRAFT_ROOT", "/srv/minecraft")
RUNTIME_DIR = _p("WYZI_RUNTIME_DIR", "/srv/minecraft/runtime")
STORAGE_ROOT = _p("WYZI_STORAGE_ROOT", "/srv/storage")
BACKUP_DIR = _p("WYZI_BACKUP_DIR", "/srv/storage/backups/minecraft")
PLAYIT_STATUS_FILE = _p("WYZI_PLAYIT_STATUS", "/run/wyzi-playit/status.json")
SMART_STATUS_FILE = _p("WYZI_SMART_STATUS", "/run/wyzi-smart/status.json")
DATA_DIR = _p("WYZI_PORTAL_DATA", "/opt/wyzi-server/portal/data")
FRONTEND_DIST = _p("WYZI_PORTAL_FRONTEND", "/opt/wyzi-server/portal/frontend/dist")
JVM_DIR = _p("WYZI_JVM_DIR", "/usr/lib/jvm")

HELPER = os.environ.get("WYZI_HELPER", "/usr/local/sbin/wyzi-helper")
# When the backend is run by an account without the sudo rule (development as marcel),
# privileged actions are reported as unavailable instead of prompting for a password.
HELPER_ENABLED = os.environ.get("WYZI_HELPER_ENABLED", "1") == "1"

# Mounts shown on the Storage page; label / role describe the real hardware.
VOLUMES = [
    {"id": "system", "mount": "/", "role": "Operating system + active Minecraft instances"},
    {"id": "bulk", "mount": "/mnt/storage", "role": "Backups · archives · bulk storage"},
]

SAMPLE_INTERVAL = 1.5  # seconds, matches the frontend chart cadence
HISTORY = 60  # samples kept for charts (90 s)
RCON_INTERVAL = 3.0  # seconds between RCON polls of a running instance

INSTANCE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
ARCHIVE_RE_TMPL = r"^{id}-(\d{{8}}T\d{{6}}Z)-([a-z0-9][a-z0-9-]{{0,31}})\.tar\.zst$"

PORTAL_VERSION = "0.2.0"
