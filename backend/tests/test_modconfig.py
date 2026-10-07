import json

import pytest

from app import modconfig


class Inst:
    def __init__(self, d):
        self.dir = d
        self.status = "offline"
        self.rcon_target = None


@pytest.fixture()
def inst(tmp_path):
    (tmp_path / "config" / "wyzi-poke-portal").mkdir(parents=True)
    return Inst(tmp_path)


QUESTS = {"enabled": True, "dailyCount": 1, "dailyBonus": "15000", "definitions": [
    {"id": "grass_hunter", "title": "Grass hunter", "description": "x", "type": "defeat_pokemon",
     "filters": {"pokemon_type": "grass"}, "target": 20, "reward": "12500", "repeat": "daily", "category": "combat"}]}


def test_write_read_roundtrip_and_previous_copy(inst):
    modconfig.write_file(inst, "quests.json", QUESTS)
    assert modconfig.read_file(inst, "quests.json") == QUESTS
    changed = json.loads(json.dumps(QUESTS))
    changed["definitions"][0]["reward"] = "20000"
    modconfig.write_file(inst, "quests.json", changed)
    prev = json.loads((inst.dir / "config/wyzi-poke-portal/quests.json.portal-prev").read_text())
    assert prev["definitions"][0]["reward"] == "12500"
    assert modconfig.read_file(inst, "quests.json")["definitions"][0]["reward"] == "20000"


@pytest.mark.parametrize("name", ["../../server.properties", "ops.json", "_status.json", "quests.json.portal-prev"])
def test_only_allow_listed_files(inst, name):
    with pytest.raises(modconfig.ModConfigError) as e:
        modconfig.write_file(inst, name, {})
    assert e.value.status == 404


def test_shape_checks(inst):
    with pytest.raises(modconfig.ModConfigError):
        modconfig.write_file(inst, "legendary_shop.json", {"not": "a list"})
    with pytest.raises(modconfig.ModConfigError):
        modconfig.write_file(inst, "quests.json", {"enabled": True})  # missing keys
    bad = json.loads(json.dumps(QUESTS))
    bad["definitions"].append(dict(bad["definitions"][0]))
    with pytest.raises(modconfig.ModConfigError, match="duplicate"):
        modconfig.write_file(inst, "quests.json", bad)
    bad["definitions"] = [dict(QUESTS["definitions"][0], reward="1e9")]
    with pytest.raises(modconfig.ModConfigError, match="whole number"):
        modconfig.write_file(inst, "quests.json", bad)


def test_missing_folder_is_reported(tmp_path):
    with pytest.raises(modconfig.ModConfigError) as e:
        modconfig.write_file(Inst(tmp_path), "quests.json", QUESTS)
    assert e.value.status == 409


def test_list_reports_mod_status(inst):
    modconfig.write_file(inst, "quests.json", QUESTS)
    (inst.dir / "config/wyzi-poke-portal/_status.json").write_text(json.dumps({"updatedAt": 1, "files": {"quests.json": "ok", "starter.json": "error: bad"}}))
    files = {f["name"]: f for f in modconfig.list_files(inst)["files"]}
    assert files["quests.json"]["exists"] and files["quests.json"]["status"] == "ok"
    assert files["starter.json"]["status"] == "error: bad" and not files["starter.json"]["exists"]
