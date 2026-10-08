"""Configure VeinMiner + FallingTree for Cobbleverse.
   python3 harvest-mods-config.py <instance dir> [maxChain, default 1024]

Tool rule: breaking a vein or a tree costs the tool the same as breaking ONE block.
  VeinMiner:   decreaseDurability=false  -> only the block you mine takes normal durability
  FallingTree: damageMultiplicand=0      -> whole tree = 1 durability (the normal hit)
Activation:
  VeinMiner:   sneak while mining an ore
  FallingTree: fells by default; sneak to break a single log (sneakMode SNEAK_DISABLE)
"""
import json, sys, os

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
groups = [g for g in load(g_path) if g['name'] != 'Wood']  # trees belong to FallingTree
cobblemon_ores = [f'cobblemon:{n}' for n in (
    'dawn_stone_ore deepslate_dawn_stone_ore dusk_stone_ore deepslate_dusk_stone_ore fire_stone_ore deepslate_fire_stone_ore '
    'nether_fire_stone_ore ice_stone_ore deepslate_ice_stone_ore leaf_stone_ore deepslate_leaf_stone_ore moon_stone_ore '
    'deepslate_moon_stone_ore dripstone_moon_stone_ore shiny_stone_ore deepslate_shiny_stone_ore sun_stone_ore '
    'deepslate_sun_stone_ore terracotta_sun_stone_ore thunder_stone_ore deepslate_thunder_stone_ore water_stone_ore '
    'deepslate_water_stone_ore').split()]
# natural stone and earth; cobblestone, planks, polished/brick variants stay out so builds are never vein-mined
pickaxes = ['minecraft:wooden_pickaxe', 'minecraft:stone_pickaxe', 'minecraft:golden_pickaxe', 'minecraft:iron_pickaxe', 'minecraft:diamond_pickaxe', 'minecraft:netherite_pickaxe']
shovels = [t.replace('pickaxe', 'shovel') for t in pickaxes]
extra = {
    'Stone': (['minecraft:stone', 'minecraft:deepslate', 'minecraft:granite', 'minecraft:diorite', 'minecraft:andesite', 'minecraft:tuff',
               'minecraft:calcite', 'minecraft:dripstone_block', 'minecraft:netherrack', 'minecraft:basalt', 'minecraft:blackstone',
               'minecraft:end_stone', 'minecraft:smooth_basalt'], pickaxes),
    'Earth': (['minecraft:dirt', 'minecraft:coarse_dirt', 'minecraft:rooted_dirt', 'minecraft:gravel', 'minecraft:sand', 'minecraft:red_sand',
               'minecraft:clay', 'minecraft:mud', 'minecraft:soul_sand', 'minecraft:soul_soil'], shovels),
}
groups = [g for g in groups if g['name'] not in extra]
for name, (blocks, tools) in extra.items():
    groups.append({'name': name, 'blocks': blocks, 'tools': tools})
for g in groups:
    if g['name'] == 'Ores':
        g['blocks'] = g['blocks'] + [b for b in cobblemon_ores if b not in g['blocks']]
save(g_path, groups)

# ---- FallingTree ----
f_path = os.path.join(cfg, 'fallingtree.json')
f = load(f_path)
f['tools']['damageMultiplicand'] = 0.0      # one normal hit for the whole tree
f['tools']['durabilityMode'] = 'NORMAL'
f['trees']['maxSize'] = 300                 # big Cobbleverse trees
f['trees']['maxSizeAction'] = 'CUT'         # fell what fits instead of refusing
f['trees']['minimumLeavesAroundRequired'] = 1  # log builds without leaves are never felled
f['sneakMode'] = 'SNEAK_DISABLE'
save(f_path, f)

print('VeinMiner groups:', [(g['name'], len(g['blocks'])) for g in groups], '| maxChain', s['maxChain'], '| delay', s['delay'], '| mergeItemDrops', s['mergeItemDrops'], '| mustSneak', s['mustSneak'], '| decreaseDurability', s['decreaseDurability'])
print('FallingTree: damageMultiplicand', f['tools']['damageMultiplicand'], '| maxSize', f['trees']['maxSize'], f['trees']['maxSizeAction'], '| sneakMode', f['sneakMode'])
