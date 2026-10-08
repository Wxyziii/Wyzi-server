"""Configure VeinMiner + FallingTree for Cobbleverse.
   python3 harvest-mods-config.py <instance dir> [maxChain, default 1024]

Tool rule: breaking a vein or a tree costs the tool the same as breaking ONE block.
  VeinMiner:   decreaseDurability=false  -> only the block you mine takes normal durability
  FallingTree: damageMultiplicand=0      -> whole tree = 1 durability (the normal hit)
Activation:
  VeinMiner:   sneak while mining an ore
  FallingTree: always fells (sneakMode IGNORE); log builds without leaves are never felled
"""
import json, sys, os, re

root = sys.argv[1]
cfg = os.path.join(root, 'config')

def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)

def save(p, data):
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
        f.write('\n')
    os.replace(tmp, p)

# ---- VeinMiner ----
s_path = os.path.join(cfg, 'Veinminer', 'settings.json')
s = load(s_path)
MAX_CHAIN = int(sys.argv[2]) if len(sys.argv) > 2 else 1024   # blocks per vein; configurable
s.update({'mustSneak': True, 'decreaseDurability': False, 'maxChain': MAX_CHAIN, 'needCorrectTool': True, 'cooldown': 20,
          'delay': 1,              # ripple outward one block-distance per tick instead of 1024 breaks in one tick
          'mergeItemDrops': True,  # all drops at the broken block
          'autoUpdate': False})
save(s_path, s)

g_path = os.path.join(cfg, 'Veinminer', 'groups.json')
b_path = os.path.join(cfg, 'Veinminer', 'blocks.json')
pickaxes = ['minecraft:wooden_pickaxe', 'minecraft:stone_pickaxe', 'minecraft:golden_pickaxe', 'minecraft:iron_pickaxe', 'minecraft:diamond_pickaxe', 'minecraft:netherite_pickaxe']
vanilla_ores = ['minecraft:' + n for n in (
    'coal_ore deepslate_coal_ore copper_ore deepslate_copper_ore diamond_ore deepslate_diamond_ore emerald_ore deepslate_emerald_ore '
    'gold_ore deepslate_gold_ore nether_gold_ore iron_ore deepslate_iron_ore lapis_ore deepslate_lapis_ore redstone_ore '
    'deepslate_redstone_ore nether_quartz_ore ancient_debris').split()]
cobblemon_ores = ['cobblemon:' + n for n in (
    'dawn_stone_ore deepslate_dawn_stone_ore dusk_stone_ore deepslate_dusk_stone_ore fire_stone_ore deepslate_fire_stone_ore '
    'nether_fire_stone_ore ice_stone_ore deepslate_ice_stone_ore leaf_stone_ore deepslate_leaf_stone_ore moon_stone_ore '
    'deepslate_moon_stone_ore dripstone_moon_stone_ore shiny_stone_ore deepslate_shiny_stone_ore sun_stone_ore '
    'deepslate_sun_stone_ore terracotta_sun_stone_ore thunder_stone_ore deepslate_thunder_stone_ore water_stone_ore '
    'deepslate_water_stone_ore').split()]

# One group per ore TYPE: the stone and deepslate variants of the same ore are one vein, different ores never mix.
def ore_type(block_id):
    ns, path = block_id.split(':')
    return ns + ':' + re.sub(r'^(deepslate|nether|dripstone|terracotta)_', '', path)
ore_groups = {}
for b in vanilla_ores + cobblemon_ores:
    ore_groups.setdefault(ore_type(b), []).append(b)
groups = [{'name': 'Ore ' + key.split(':')[1].replace('_', ' '), 'blocks': blocks, 'tools': pickaxes} for key, blocks in ore_groups.items()]

# Natural stone and earth: single-block list, so a vein is only the exact block you hit (tuff never takes deepslate).
# Cobblestone, planks, polished and brick variants stay out so builds are never vein-mined.
single = ['minecraft:' + n for n in (
    'stone deepslate granite diorite andesite tuff calcite dripstone_block netherrack basalt smooth_basalt blackstone end_stone '
    'dirt coarse_dirt rooted_dirt gravel sand red_sand clay mud soul_sand soul_soil').split()]
save(g_path, groups)
save(b_path, single)

# ---- FallingTree ----
f_path = os.path.join(cfg, 'fallingtree.json')
f = load(f_path)
f['tools']['damageMultiplicand'] = 0.0      # one normal hit for the whole tree
f['tools']['durabilityMode'] = 'NORMAL'
f['trees']['maxSize'] = 300                 # big Cobbleverse trees
f['trees']['maxSizeAction'] = 'CUT'         # fell what fits instead of refusing
f['trees']['minimumLeavesAroundRequired'] = 1  # log builds without leaves are never felled
f['sneakMode'] = 'IGNORE'  # trees fall whether or not you sneak (sneaking is for vein mining)
save(f_path, f)

print('VeinMiner ore groups:', len(groups), '| single blocks:', len(single), '| maxChain', s['maxChain'], '| delay', s['delay'], '| mergeItemDrops', s['mergeItemDrops'], '| mustSneak', s['mustSneak'], '| decreaseDurability', s['decreaseDurability'])
print('FallingTree: damageMultiplicand', f['tools']['damageMultiplicand'], '| maxSize', f['trees']['maxSize'], f['trees']['maxSizeAction'], '| sneakMode', f['sneakMode'])
