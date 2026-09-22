const fs = require('fs');
const path = require('path');

// 5-Star Characters
const fiveStarChars = [
  { name: "Zhongli", element: "Geo", weapon: "Polearm", region: "Liyue", title: "Vago Mundo" },
  { name: "Raiden Shogun", element: "Electro", weapon: "Polearm", region: "Inazuma", title: "Plane of Euthymia" },
  { name: "Nahida", element: "Dendro", weapon: "Catalyst", region: "Sumeru", title: "Physic of Purity" },
  { name: "Furina", element: "Hydro", weapon: "Sword", region: "Fontaine", title: "Endless Solo of Solitude" },
  { name: "Venti", element: "Anemo", weapon: "Bow", region: "Mondstadt", title: "Windborne Bard" },
  { name: "Mavuika", element: "Pyro", weapon: "Claymore", region: "Natlan", title: "Habitation of Flame" },
  { name: "Neuvillette", element: "Hydro", weapon: "Catalyst", region: "Fontaine", title: "Ordained Singularity" },
  { name: "Arlecchino", element: "Pyro", weapon: "Polearm", region: "Snezhnaya", title: "Dire Balemoon" },
  { name: "Hu Tao", element: "Pyro", weapon: "Polearm", region: "Liyue", title: "Fragrance in Thaw" },
  { name: "Kaedehara Kazuha", element: "Anemo", weapon: "Sword", region: "Inazuma", title: "Scarlet Leaves Pursue Wild Waves" },
  { name: "Kamisato Ayaka", element: "Cryo", weapon: "Sword", region: "Inazuma", title: "Frostflake Heron" },
  { name: "Yelan", element: "Hydro", weapon: "Bow", region: "Liyue", title: "Valley Orchid" },
  { name: "Xiao", element: "Anemo", weapon: "Polearm", region: "Liyue", title: "Vigilant Yaksha" },
  { name: "Ganyu", element: "Cryo", weapon: "Bow", region: "Liyue", title: "Plenilune Gaze" },
  { name: "Alhaitham", element: "Dendro", weapon: "Sword", region: "Sumeru", title: "Admonishing Instruction" },
  { name: "Navia", element: "Geo", weapon: "Claymore", region: "Fontaine", title: "Helm of the Radiant Rose" },
  { name: "Clorinde", element: "Electro", weapon: "Sword", region: "Fontaine", title: "Candleflame Shadowhunter" },
  { name: "Wanderer", element: "Anemo", weapon: "Catalyst", region: "Sumeru", title: "Eons Adrift" },
  { name: "Mualani", element: "Hydro", weapon: "Catalyst", region: "Natlan", title: "Splish-Splash Wavechaser" },
  { name: "Kinich", element: "Dendro", weapon: "Claymore", region: "Natlan", title: "Huitztlan Saurian Hunter" },
  { name: "Xilonen", element: "Geo", weapon: "Sword", region: "Natlan", title: "Name Weaver of Children of Echoes" },
  { name: "Chasca", element: "Anemo", weapon: "Bow", region: "Natlan", title: "Sky-Roving Feather" },
  { name: "Chiori", element: "Geo", weapon: "Sword", region: "Inazuma", title: "Thousand Threads of Genial Strife" },
  { name: "Emilie", element: "Dendro", weapon: "Polearm", region: "Fontaine", title: "Aroma of Traces" },
  { name: "Sigewinne", element: "Hydro", weapon: "Bow", region: "Fontaine", title: "Wondrous Dragoness" },
  { name: "Wriothesley", element: "Cryo", weapon: "Catalyst", region: "Fontaine", title: "Emissary of Solitary Iniquity" },
  { name: "Xianyun", element: "Anemo", weapon: "Catalyst", region: "Liyue", title: "Passerine Herald" },
  { name: "Lyney", element: "Pyro", weapon: "Bow", region: "Fontaine", title: "Spectacle of Phantasmagoria" },
  { name: "Baizhu", element: "Dendro", weapon: "Catalyst", region: "Liyue", title: "Beyond Mortality" },
  { name: "Cyno", element: "Electro", weapon: "Polearm", region: "Sumeru", title: "Judicator of Secrets" },
  { name: "Nilou", element: "Hydro", weapon: "Sword", region: "Sumeru", title: "Dance of Lotuslight" },
  { name: "Tighnari", element: "Dendro", weapon: "Bow", region: "Sumeru", title: "Verdant Strider" },
  { name: "Yae Miko", element: "Electro", weapon: "Catalyst", region: "Inazuma", title: "Astute Amusement" },
  { name: "Kamisato Ayato", element: "Hydro", weapon: "Sword", region: "Inazuma", title: "Pillar of Fortitude" },
  { name: "Shenhe", element: "Cryo", weapon: "Polearm", region: "Liyue", title: "Lonesome Transcendence" },
  { name: "Arataki Itto", element: "Geo", weapon: "Claymore", region: "Inazuma", title: "Hanamizaka Heroics" },
  { name: "Sangonomiya Kokomi", element: "Hydro", weapon: "Catalyst", region: "Inazuma", title: "Pearl of Wisdom" },
  { name: "Yoimiya", element: "Pyro", weapon: "Bow", region: "Inazuma", title: "Frolicking Flames" },
  { name: "Eula", element: "Cryo", weapon: "Claymore", region: "Mondstadt", title: "Dance of the Shimmering Wave" },
  { name: "Tartaglia", element: "Hydro", weapon: "Bow", region: "Snezhnaya", title: "Childe" },
  { name: "Klee", element: "Pyro", weapon: "Catalyst", region: "Mondstadt", title: "Fleeing Sunlight" },
  { name: "Albedo", element: "Geo", weapon: "Sword", region: "Mondstadt", title: "Kreideprinz" },
  { name: "Diluc", element: "Pyro", weapon: "Claymore", region: "Mondstadt", title: "The Darknight Hero" },
  { name: "Jean", element: "Anemo", weapon: "Sword", region: "Mondstadt", title: "Dandelion Knight" },
  { name: "Mona", element: "Hydro", weapon: "Catalyst", region: "Mondstadt", title: "Astral Reflection" },
  { name: "Keqing", element: "Electro", weapon: "Sword", region: "Liyue", title: "Driving Thunder" },
  { name: "Qiqi", element: "Cryo", weapon: "Sword", region: "Liyue", title: "Icy Resurrection" },
  { name: "Dehya", element: "Pyro", weapon: "Claymore", region: "Sumeru", title: "Flame-Mane" }
];

// 4-Star Characters
const fourStarChars = [
  { name: "Bennett", element: "Pyro", weapon: "Sword", region: "Mondstadt", title: "Trial by Fire" },
  { name: "Xiangling", element: "Pyro", weapon: "Polearm", region: "Liyue", title: "Exquisite Delicacy" },
  { name: "Xingqiu", element: "Hydro", weapon: "Sword", region: "Liyue", title: "Juvenile Galant" },
  { name: "Fischl", element: "Electro", weapon: "Bow", region: "Mondstadt", title: "Prinzessin der Verurteilung" },
  { name: "Kuki Shinobu", element: "Electro", weapon: "Sword", region: "Inazuma", title: "Mender of Tribulations" },
  { name: "Faruzan", element: "Anemo", weapon: "Bow", region: "Sumeru", title: "Enigmatic Machinist" },
  { name: "Chevreuse", element: "Pyro", weapon: "Polearm", region: "Fontaine", title: "Guarantor of Law" },
  { name: "Kachina", element: "Geo", weapon: "Polearm", region: "Natlan", title: "Echoing Stone" },
  { name: "Ororon", element: "Electro", weapon: "Bow", region: "Natlan", title: "Shadow of the Night-Wind" },
  { name: "Gaming", element: "Pyro", weapon: "Claymore", region: "Liyue", title: "Leonine Vanguard" },
  { name: "Lynette", element: "Anemo", weapon: "Sword", region: "Fontaine", title: "Multi-Function Magic Assistant" },
  { name: "Freminet", element: "Cryo", weapon: "Claymore", region: "Fontaine", title: "Yearning for Unseen Depths" },
  { name: "Charlotte", element: "Cryo", weapon: "Catalyst", region: "Fontaine", title: "Lens of Verity" },
  { name: "Sethos", element: "Electro", weapon: "Bow", region: "Sumeru", title: "Wisdom of the Sands" },
  { name: "Kirara", element: "Dendro", weapon: "Sword", region: "Inazuma", title: "Cat Upon the Eaves" },
  { name: "Kaveh", element: "Dendro", weapon: "Claymore", region: "Sumeru", title: "Empyrean Reflection" },
  { name: "Layla", element: "Cryo", weapon: "Sword", region: "Sumeru", title: "Fantastical Evening Star" },
  { name: "Yaoyao", element: "Dendro", weapon: "Polearm", region: "Liyue", title: "Burgeoning Grace" },
  { name: "Collei", element: "Dendro", weapon: "Bow", region: "Sumeru", title: "Sprout of Rebirth" },
  { name: "Dori", element: "Electro", weapon: "Claymore", region: "Sumeru", title: "Treasure of Dream Garden" },
  { name: "Candace", element: "Hydro", weapon: "Polearm", region: "Sumeru", title: "Golden Vow" },
  { name: "Shikanoin Heizou", element: "Anemo", weapon: "Catalyst", region: "Inazuma", title: "Analytical Harmony" },
  { name: "Gorou", element: "Geo", weapon: "Bow", region: "Inazuma", title: "Canine Warrior" },
  { name: "Thoma", element: "Pyro", weapon: "Polearm", region: "Inazuma", title: "Protector From Afar" },
  { name: "Sayu", element: "Anemo", weapon: "Claymore", region: "Inazuma", title: "Mujina Ninja" },
  { name: "Kujou Sara", element: "Electro", weapon: "Bow", region: "Inazuma", title: "Crowfeather Kaburaya" },
  { name: "Yun Jin", element: "Geo", weapon: "Polearm", region: "Liyue", title: "Stage Lucida" },
  { name: "Yanfei", element: "Pyro", weapon: "Catalyst", region: "Liyue", title: "Wise Innocence" },
  { name: "Rosaria", element: "Cryo", weapon: "Polearm", region: "Mondstadt", title: "Thorny Benevolence" },
  { name: "Diona", element: "Cryo", weapon: "Bow", region: "Mondstadt", title: "Kätzlein Cocktail" },
  { name: "Sucrose", element: "Anemo", weapon: "Catalyst", region: "Mondstadt", title: "Harmless Sweetie" },
  { name: "Chongyun", element: "Cryo", weapon: "Claymore", region: "Liyue", title: "Frozen Ardor" },
  { name: "Ningguang", element: "Geo", weapon: "Catalyst", region: "Liyue", title: "Eclipsing Star" },
  { name: "Beidou", element: "Electro", weapon: "Claymore", region: "Liyue", title: "Uncrowned Lord of the Ocean" },
  { name: "Razor", element: "Electro", weapon: "Claymore", region: "Mondstadt", title: "Wolf Boy" },
  { name: "Barbara", element: "Hydro", weapon: "Catalyst", region: "Mondstadt", title: "Shining Idol" },
  { name: "Noelle", element: "Geo", weapon: "Claymore", region: "Mondstadt", title: "Chivalric Blossom" },
  { name: "Amber", element: "Pyro", weapon: "Bow", region: "Mondstadt", title: "Outrider" },
  { name: "Kaeya", element: "Cryo", weapon: "Sword", region: "Mondstadt", title: "Frostwind Swordsman" },
  { name: "Lisa", element: "Electro", weapon: "Catalyst", region: "Mondstadt", title: "Witch of Purple Rose" }
];

// Verified Genshin Internal Names for Enka Network UI assets
const internalMap = {
  'Raiden Shogun': 'Shougun',
  'Hu Tao': 'Hutao',
  'Kamisato Ayaka': 'Ayaka',
  'Kamisato Ayato': 'Ayato',
  'Kaedehara Kazuha': 'Kazuha',
  'Sangonomiya Kokomi': 'Kokomi',
  'Kujou Sara': 'Sara',
  'Shikanoin Heizou': 'Heizo',
  'Yae Miko': 'Yae',
  'Arataki Itto': 'Itto',
  'Baizhu': 'Baizhuer',
  'Yanfei': 'Feiyan',
  'Noelle': 'Noel',
  'Jean': 'Qin',
  'Ororon': 'Olorun',
  'Alhaitham': 'Alhatham',
  'Lyney': 'Liney',
  'Lynette': 'Linette',
  'Kirara': 'Momoka',
  'Xianyun': 'Liuyun',
  'Kuki Shinobu': 'Shinobu',
  'Thoma': 'Tohma',
  'Yun Jin': 'Yunjin',
  'Amber': 'Ambor'
};

// Verified Slugs for Genshin.jmp.blue
const slugMap = {
  'Raiden Shogun': 'raiden',
  'Kamisato Ayaka': 'ayaka',
  'Kamisato Ayato': 'ayato',
  'Kaedehara Kazuha': 'kazuha',
  'Sangonomiya Kokomi': 'kokomi',
  'Kujou Sara': 'sara',
  'Shikanoin Heizou': 'shikanoin-heizou',
  'Arataki Itto': 'arataki-itto'
};

function mapCharacter(c, i, rarity) {
  const internal = internalMap[c.name] || c.name.replace(/[\s'-]+/g, '');
  const slug = slugMap[c.name] || c.name.toLowerCase().replace(/[\s'-]+/g, '-');

  return {
    id: `char_${rarity}star_${i + 1}`,
    name: c.name,
    rarity: rarity,
    element: c.element,
    weaponType: c.weapon,
    region: c.region,
    title: c.title,
    internalName: internal,
    slug: slug,
    // High-resolution official Genshin Wish Splash Art (Enka)
    splashArt: `https://enka.network/ui/UI_Gacha_AvatarImg_${internal}.png`,
    // Secondary Splash Art (Genshin.dev)
    splashArtDev: `https://genshin.jmp.blue/characters/${slug}/gacha-splash`,
    // Character Portrait cutout
    portrait: `https://genshin.jmp.blue/characters/${slug}/portrait`,
    // Character Avatar Icon (Enka)
    remoteIcon: `https://enka.network/ui/UI_AvatarIcon_${internal}.png`,
    // Secondary Icon (Genshin.dev)
    remoteIconDev: `https://genshin.jmp.blue/characters/${slug}/icon`,
    icon: `assets/characters/${c.name.toLowerCase().replace(/[\s'-]+/g, '_')}.png`
  };
}

const characters = [
  ...fiveStarChars.map((c, i) => mapCharacter(c, i, 5)),
  ...fourStarChars.map((c, i) => mapCharacter(c, i, 4))
];

// Weapons dataset
const weaponSlugMap = {
  'Tome of the Eternal Flow': 'tome-of-the-eternal'
};

const rawWeapons = [
  // 5-Star Weapons
  { id: "w_5_1", name: "Mistsplitter Reforged", rarity: 5, type: "Sword" },
  { id: "w_5_2", name: "Staff of Homa", rarity: 5, type: "Polearm" },
  { id: "w_5_3", name: "Thundering Pulse", rarity: 5, type: "Bow" },
  { id: "w_5_4", name: "Wolf's Gravestone", rarity: 5, type: "Claymore" },
  { id: "w_5_5", name: "Kagura's Verity", rarity: 5, type: "Catalyst" },
  { id: "w_5_6", name: "Aqua Simulacra", rarity: 5, type: "Bow" },
  { id: "w_5_7", name: "Primordial Jade Winged-Spear", rarity: 5, type: "Polearm" },
  { id: "w_5_8", name: "Light of Foliar Incision", rarity: 5, type: "Sword" },
  { id: "w_5_9", name: "Tome of the Eternal Flow", rarity: 5, type: "Catalyst" },
  { id: "w_5_10", name: "Redhorn Stonethresher", rarity: 5, type: "Claymore" },

  // 4-Star Weapons
  { id: "w_4_1", name: "The Widsith", rarity: 4, type: "Catalyst" },
  { id: "w_4_2", name: "Favonius Sword", rarity: 4, type: "Sword" },
  { id: "w_4_3", name: "Favonius Lance", rarity: 4, type: "Polearm" },
  { id: "w_4_4", name: "Sacrificial Bow", rarity: 4, type: "Bow" },
  { id: "w_4_5", name: "Sacrificial Fragments", rarity: 4, type: "Catalyst" },
  { id: "w_4_6", name: "The Catch", rarity: 4, type: "Polearm" },
  { id: "w_4_7", name: "Rust", rarity: 4, type: "Bow" },
  { id: "w_4_8", name: "The Bell", rarity: 4, type: "Claymore" },
  { id: "w_4_9", name: "Favonius Greatsword", rarity: 4, type: "Claymore" },
  { id: "w_4_10", name: "Dragon's Bane", rarity: 4, type: "Polearm" },
  { id: "w_4_11", name: "Lion's Roar", rarity: 4, type: "Sword" },
  { id: "w_4_12", name: "The Stringless", rarity: 4, type: "Bow" },

  // 3-Star Weapons (Fodder)
  { id: "w_3_1", name: "Debate Club", rarity: 3, type: "Claymore" },
  { id: "w_3_2", name: "Harbinger of Dawn", rarity: 3, type: "Sword" },
  { id: "w_3_3", name: "Slingshot", rarity: 3, type: "Bow" },
  { id: "w_3_4", name: "Magic Guide", rarity: 3, type: "Catalyst" },
  { id: "w_3_5", name: "Black Tassel", rarity: 3, type: "Polearm" },
  { id: "w_3_6", name: "Cool Steel", rarity: 3, type: "Sword" },
  { id: "w_3_7", name: "Sharpshooter's Oath", rarity: 3, type: "Bow" },
  { id: "w_3_8", name: "Thrilling Tales of Dragon Slayers", rarity: 3, type: "Catalyst" },
  { id: "w_3_9", name: "Raven Bow", rarity: 3, type: "Bow" },
  { id: "w_3_10", name: "Bloodtainted Greatsword", rarity: 3, type: "Claymore" }
];

const weapons = rawWeapons.map(w => {
  const slug = weaponSlugMap[w.name] || w.name.toLowerCase().replace(/['\s]+/g, '-');
  return {
    ...w,
    slug: slug,
    remoteIcon: `https://genshin.jmp.blue/weapons/${slug}/icon`,
    splashArt: `https://genshin.jmp.blue/weapons/${slug}/icon`
  };
});

const dataDir = path.join(__dirname, '..', 'src', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

fs.writeFileSync(path.join(dataDir, 'characters.json'), JSON.stringify(characters, null, 2), 'utf8');
fs.writeFileSync(path.join(dataDir, 'weapons.json'), JSON.stringify(weapons, null, 2), 'utf8');

console.log(`Generated ${characters.length} characters (5-star: ${fiveStarChars.length}, 4-star: ${fourStarChars.length})`);
console.log(`Generated ${weapons.length} weapons`);
