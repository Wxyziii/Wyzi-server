import pytest

from app.memory import breakdown, check_start, footprint_gb
from app.parsing import (
    parse_env,
    parse_list,
    parse_log_line,
    parse_properties,
    parse_tick_query,
    size_to_gb,
    validate_command,
)


def test_parse_env_quotes_comments_and_bad_keys():
    env = parse_env('# c\nJAVA=/usr/lib/jvm/x/bin/java\nXMX="6G"\nFLAGS=\'-a -b\'\n bad key=1\nEMPTY=\n')
    assert env == {"JAVA": "/usr/lib/jvm/x/bin/java", "XMX": "6G", "FLAGS": "-a -b", "EMPTY": ""}


def test_parse_properties():
    props = parse_properties("#x\nserver-port=25565\nmotd=a=b\nserver-ip=\n")
    assert props["server-port"] == "25565" and props["motd"] == "a=b" and props["server-ip"] == ""


@pytest.mark.parametrize("v,gb", [("6G", 6.0), ("4096M", 4.0), ("512M", 0.5), ("6g", None), ("", None), (None, None)])
def test_size_to_gb(v, gb):
    assert size_to_gb(v) == gb


def test_log_line_levels_and_chat():
    assert parse_log_line("[22:39:26] [Server thread/INFO]: Done (0.410s)! For help, type \"help\"")["level"] == "info"
    assert parse_log_line("[22:39:26] [Server thread/WARN]: Can't keep up!")["level"] == "warn"
    chat = parse_log_line("[22:40:01] [Server thread/INFO]: <Wyzi> hello")
    assert chat["level"] == "chat" and chat["thread"] == "Server thread"
    assert parse_log_line("\tat net.minecraft.Foo(Foo.java:1)") is None


def test_parse_list_variants():
    assert parse_list("There are 0 of a max of 20 players online: ") == (0, 20, [])
    assert parse_list("There are 2 of a max of 10 players online: Wyzi, mossbyte") == (2, 10, ["Wyzi", "mossbyte"])
    assert parse_list("Unknown command") is None


def test_parse_tick_query():
    resp = "The game is running normally\nTarget tick rate: 20.0 per second.\nAverage time per tick: 3.4ms (Target: 50.0ms)"
    assert parse_tick_query(resp) == 3.4
    assert parse_tick_query("Unknown or incomplete command") is None


@pytest.mark.parametrize("raw,ok", [("/say hi", "say hi"), ("list", "list"), ("  time set day ", "time set day")])
def test_validate_command_ok(raw, ok):
    assert validate_command(raw) == ok


@pytest.mark.parametrize("raw", ["", "   ", "/", "say a\nop me", "say \x1b[31m", "x" * 300])
def test_validate_command_rejects(raw):
    with pytest.raises(ValueError):
        validate_command(raw)


class Inst:
    def __init__(self, iid, xmx, rss=0.0, active=False):
        self.id, self.xmx, self.rss_gb, self.is_active = iid, xmx, rss, active
        self.pid = 1 if active else 0


MEM = {"total": 15.6, "available": 12.0, "free": 8.0, "cache": 3.0}


def test_footprint_has_native_overhead():
    assert footprint_gb(8) == 9.6
    assert footprint_gb(2) == 2.5


def test_breakdown_uses_mem_available_and_reserves_growth():
    running = Inst("a", 8, rss=4.0, active=True)
    b = breakdown(MEM, [running], headroom=2.5, ark_gb=0)
    # 12 available - 2.5 headroom - (9.6 - 4.0) growth = 3.9
    assert b["safeForNew"] == 3.9
    assert b["minecraft"] == 4.0


def test_check_start_blocks_and_stop_first_resolves():
    running = Inst("big", 8, rss=7.0, active=True)
    target = Inst("next", 6)
    blocked = check_start(target, [running, target], MEM, 2.5, 0, set())
    assert not blocked["ok"] and blocked["blockers"] == ["big"]
    resolved = check_start(target, [running, target], MEM, 2.5, 0, {"big"})
    # 12 + 7 freed - 2.5 = 16.5 >= 7.2
    assert resolved["ok"]
