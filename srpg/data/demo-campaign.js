/* 內建示範劇本（由編輯器格式產生，可直接用編輯器開啟修改）
   以 JS 包裝是為了讓 file:// 雙擊開啟時也能載入 */
window.SRPG_DEFAULT_CAMPAIGN = {
 "format": "srpg-campaign",
 "version": 1,
 "meta": {
  "title": "邊境的晨星（示範劇本）",
  "author": "SRPG Demo",
  "start": "ch1",
  "permadeath": true,
  "rules": {
   "morale": true,
   "spirits": true
  },
  "desc": "內建示範：3 章、劇情分歧、說服、拜訪村莊、增援；杖、道具、交換、精神指令、氣力。"
 },
 "weapons": {
  "iron_sword": {
   "name": "鐵劍",
   "type": "sword",
   "dmg": "phys",
   "mt": 5,
   "hit": 90,
   "crit": 0,
   "range": [
    1,
    1
   ],
   "icon": 296
  },
  "slim_sword": {
   "name": "細劍",
   "type": "sword",
   "dmg": "phys",
   "mt": 3,
   "hit": 100,
   "crit": 5,
   "range": [
    1,
    1
   ],
   "icon": 287
  },
  "killing_edge": {
   "name": "殺劍",
   "type": "sword",
   "dmg": "phys",
   "mt": 9,
   "hit": 75,
   "crit": 30,
   "range": [
    1,
    1
   ],
   "icon": 294
  },
  "brave_sword": {
   "name": "勇者之劍",
   "type": "sword",
   "dmg": "phys",
   "mt": 8,
   "hit": 75,
   "crit": 0,
   "range": [
    1,
    1
   ],
   "brave": true,
   "icon": 298
  },
  "meteor": {
   "name": "流星斬",
   "type": "sword",
   "dmg": "phys",
   "mt": 14,
   "hit": 85,
   "crit": 10,
   "range": [
    1,
    1
   ],
   "morale": 115,
   "icon": 299,
   "desc": "氣力 115 以上才能使用的必殺技"
  },
  "iron_lance": {
   "name": "鐵槍",
   "type": "lance",
   "dmg": "phys",
   "mt": 7,
   "hit": 80,
   "crit": 0,
   "range": [
    1,
    1
   ],
   "icon": 270
  },
  "javelin": {
   "name": "標槍",
   "type": "lance",
   "dmg": "phys",
   "mt": 6,
   "hit": 65,
   "crit": 0,
   "range": [
    1,
    2
   ],
   "icon": 271
  },
  "iron_axe": {
   "name": "鐵斧",
   "type": "axe",
   "dmg": "phys",
   "mt": 8,
   "hit": 75,
   "crit": 0,
   "range": [
    1,
    1
   ],
   "icon": 290
  },
  "hand_axe": {
   "name": "手斧",
   "type": "axe",
   "dmg": "phys",
   "mt": 7,
   "hit": 60,
   "crit": 0,
   "range": [
    1,
    2
   ],
   "icon": 285
  },
  "iron_bow": {
   "name": "鐵弓",
   "type": "bow",
   "dmg": "phys",
   "mt": 6,
   "hit": 85,
   "crit": 0,
   "range": [
    2,
    2
   ],
   "effective": [
    "fly"
   ],
   "icon": 57
  },
  "fire": {
   "name": "火焰",
   "type": "anima",
   "dmg": "mag",
   "mt": 5,
   "hit": 90,
   "crit": 0,
   "range": [
    1,
    2
   ],
   "icon": 263
  },
  "thunder": {
   "name": "雷擊",
   "type": "anima",
   "dmg": "mag",
   "mt": 8,
   "hit": 75,
   "crit": 5,
   "range": [
    1,
    2
   ],
   "icon": 256
  },
  "heal_staff": {
   "name": "治療杖",
   "type": "staff",
   "dmg": "mag",
   "heal": 10,
   "range": [
    1,
    1
   ],
   "icon": 278
  },
  "physic": {
   "name": "遠距治療杖",
   "type": "staff",
   "dmg": "mag",
   "heal": 8,
   "range": [
    1,
    3
   ],
   "icon": 281
  }
 },
 "items": {
  "vulnerary": {
   "name": "傷藥",
   "kind": "heal",
   "power": 10,
   "uses": 3,
   "icon": 217,
   "price": 300,
   "desc": "回復 10 HP"
  },
  "elixir": {
   "name": "萬靈藥",
   "kind": "heal",
   "power": 99,
   "uses": 1,
   "icon": 225,
   "price": 1200,
   "desc": "HP 全回復"
  },
  "power_ring": {
   "name": "力量戒指",
   "kind": "boost",
   "stat": "str",
   "power": 2,
   "uses": 1,
   "icon": 233,
   "price": 3000,
   "desc": "力量永久 +2"
  },
  "sp_potion": {
   "name": "SP 回復藥",
   "kind": "sp",
   "power": 20,
   "uses": 1,
   "icon": 229,
   "price": 800,
   "desc": "SP +20"
  }
 },
 "classes": {
  "lord": {
   "name": "領主",
   "move": 5,
   "moveType": "foot",
   "sprite": "swordsman"
  },
  "cavalier": {
   "name": "騎士",
   "move": 7,
   "moveType": "horse",
   "sprite": "cavalier",
   "tags": [
    "horse"
   ]
  },
  "archer": {
   "name": "弓兵",
   "move": 5,
   "moveType": "foot",
   "sprite": "archer"
  },
  "mage": {
   "name": "魔道士",
   "move": 5,
   "moveType": "foot",
   "sprite": "mage"
  },
  "fighter": {
   "name": "戰士",
   "move": 5,
   "moveType": "foot",
   "sprite": "fighter"
  },
  "brigand": {
   "name": "山賊",
   "move": 5,
   "moveType": "foot",
   "sprite": "fighter"
  },
  "knight": {
   "name": "重甲兵",
   "move": 4,
   "moveType": "armor",
   "sprite": "knight",
   "tags": [
    "armor"
   ]
  },
  "thief": {
   "name": "盜賊",
   "move": 6,
   "moveType": "foot",
   "sprite": "swordsman"
  },
  "pegasus": {
   "name": "天馬騎士",
   "move": 7,
   "moveType": "fly",
   "sprite": "pegasus",
   "tags": [
    "fly"
   ]
  },
  "soldier": {
   "name": "士兵",
   "move": 5,
   "moveType": "foot",
   "sprite": "lancer"
  },
  "cleric": {
   "name": "僧侶",
   "move": 5,
   "moveType": "foot",
   "sprite": "mage"
  }
 },
 "units": {
  "alan": {
   "name": "艾倫",
   "class": "lord",
   "level": 1,
   "stats": {
    "hp": 20,
    "str": 6,
    "mag": 1,
    "skl": 7,
    "spd": 8,
    "lck": 6,
    "def": 5,
    "res": 2
   },
   "weapons": [
    "iron_sword",
    "meteor"
   ],
   "growth": {
    "hp": 80,
    "str": 45,
    "mag": 5,
    "skl": 50,
    "spd": 55,
    "lck": 50,
    "def": 30,
    "res": 25
   },
   "lord": true,
   "sprite": "chara_5",
   "items": [
    "vulnerary"
   ],
   "sp": 40,
   "spirits": [
    "strike",
    "valor",
    "guts"
   ]
  },
  "mira": {
   "name": "米菈",
   "class": "cavalier",
   "level": 2,
   "stats": {
    "hp": 22,
    "str": 7,
    "mag": 0,
    "skl": 5,
    "spd": 6,
    "lck": 4,
    "def": 6,
    "res": 1
   },
   "weapons": [
    "iron_lance",
    "javelin"
   ],
   "growth": {
    "hp": 85,
    "str": 45,
    "mag": 0,
    "skl": 40,
    "spd": 40,
    "lck": 35,
    "def": 30,
    "res": 15
   },
   "sprite": "chara_6",
   "items": [
    "vulnerary"
   ],
   "sp": 35,
   "spirits": [
    "accel",
    "iron_wall",
    "strike"
   ]
  },
  "rook": {
   "name": "魯克",
   "class": "archer",
   "level": 2,
   "stats": {
    "hp": 18,
    "str": 6,
    "mag": 0,
    "skl": 8,
    "spd": 6,
    "lck": 3,
    "def": 4,
    "res": 1
   },
   "weapons": [
    "iron_bow"
   ],
   "growth": {
    "hp": 70,
    "str": 40,
    "mag": 0,
    "skl": 55,
    "spd": 45,
    "lck": 30,
    "def": 20,
    "res": 15
   },
   "sprite": "chara_3",
   "sp": 30,
   "spirits": [
    "focus",
    "strike",
    "effort"
   ]
  },
  "elle": {
   "name": "艾兒",
   "class": "mage",
   "level": 1,
   "stats": {
    "hp": 16,
    "str": 0,
    "mag": 7,
    "skl": 6,
    "spd": 7,
    "lck": 5,
    "def": 2,
    "res": 6
   },
   "weapons": [
    "fire"
   ],
   "growth": {
    "hp": 55,
    "str": 0,
    "mag": 60,
    "skl": 45,
    "spd": 50,
    "lck": 40,
    "def": 15,
    "res": 40
   },
   "sprite": "chara_4",
   "items": [
    "sp_potion"
   ],
   "sp": 35,
   "spirits": [
    "valor",
    "alert",
    "effort"
   ]
  },
  "lina": {
   "name": "莉娜",
   "class": "cleric",
   "level": 1,
   "stats": {
    "hp": 16,
    "str": 0,
    "mag": 5,
    "skl": 4,
    "spd": 6,
    "lck": 8,
    "def": 1,
    "res": 7
   },
   "weapons": [
    "heal_staff"
   ],
   "growth": {
    "hp": 50,
    "str": 0,
    "mag": 50,
    "skl": 35,
    "spd": 45,
    "lck": 60,
    "def": 10,
    "res": 50
   },
   "sprite": "chara_0",
   "items": [
    "vulnerary",
    "elixir"
   ],
   "sp": 50,
   "spirits": [
    "trust",
    "cheer",
    "alert"
   ]
  },
  "kit": {
   "name": "基特",
   "class": "thief",
   "level": 3,
   "stats": {
    "hp": 17,
    "str": 4,
    "mag": 0,
    "skl": 9,
    "spd": 12,
    "lck": 7,
    "def": 3,
    "res": 1
   },
   "weapons": [
    "slim_sword"
   ],
   "growth": {
    "hp": 60,
    "str": 30,
    "mag": 5,
    "skl": 45,
    "spd": 65,
    "lck": 50,
    "def": 15,
    "res": 15
   },
   "sprite": "chara_1",
   "items": [
    "vulnerary"
   ],
   "sp": 30,
   "spirits": [
    "alert",
    "accel",
    "focus"
   ]
  },
  "sera": {
   "name": "瑟拉",
   "class": "pegasus",
   "level": 4,
   "stats": {
    "hp": 19,
    "str": 6,
    "mag": 2,
    "skl": 9,
    "spd": 12,
    "lck": 8,
    "def": 5,
    "res": 7
   },
   "weapons": [
    "iron_lance",
    "javelin"
   ],
   "growth": {
    "hp": 60,
    "str": 40,
    "mag": 15,
    "skl": 50,
    "spd": 60,
    "lck": 45,
    "def": 20,
    "res": 40
   },
   "sprite": "chara_7",
   "sp": 40,
   "spirits": [
    "accel",
    "alert",
    "strike"
   ]
  },
  "bandit": {
   "name": "山賊",
   "class": "brigand",
   "level": 2,
   "stats": {
    "hp": 22,
    "str": 6,
    "mag": 0,
    "skl": 2,
    "spd": 4,
    "lck": 0,
    "def": 3,
    "res": 0
   },
   "weapons": [
    "iron_axe"
   ]
  },
  "bandit_axe": {
   "name": "山賊",
   "class": "brigand",
   "level": 3,
   "stats": {
    "hp": 23,
    "str": 6,
    "mag": 0,
    "skl": 2,
    "spd": 4,
    "lck": 0,
    "def": 3,
    "res": 0
   },
   "weapons": [
    "hand_axe"
   ]
  },
  "garr": {
   "name": "加爾",
   "class": "brigand",
   "level": 6,
   "stats": {
    "hp": 32,
    "str": 10,
    "mag": 0,
    "skl": 6,
    "spd": 6,
    "lck": 2,
    "def": 6,
    "res": 1
   },
   "weapons": [
    "iron_axe",
    "hand_axe"
   ],
   "items": [
    "vulnerary"
   ]
  },
  "soldier": {
   "name": "帝國兵",
   "class": "soldier",
   "level": 4,
   "stats": {
    "hp": 21,
    "str": 6,
    "mag": 0,
    "skl": 5,
    "spd": 5,
    "lck": 2,
    "def": 6,
    "res": 1
   },
   "weapons": [
    "iron_lance"
   ]
  },
  "imp_archer": {
   "name": "帝國弓兵",
   "class": "archer",
   "level": 4,
   "stats": {
    "hp": 19,
    "str": 6,
    "mag": 0,
    "skl": 7,
    "spd": 5,
    "lck": 2,
    "def": 4,
    "res": 1
   },
   "weapons": [
    "iron_bow"
   ]
  },
  "imp_knight": {
   "name": "帝國重甲",
   "class": "knight",
   "level": 5,
   "stats": {
    "hp": 26,
    "str": 8,
    "mag": 0,
    "skl": 4,
    "spd": 2,
    "lck": 1,
    "def": 11,
    "res": 0
   },
   "weapons": [
    "iron_lance"
   ]
  },
  "imp_mage": {
   "name": "帝國魔道士",
   "class": "mage",
   "level": 4,
   "stats": {
    "hp": 17,
    "str": 0,
    "mag": 6,
    "skl": 5,
    "spd": 6,
    "lck": 2,
    "def": 2,
    "res": 5
   },
   "weapons": [
    "fire"
   ]
  },
  "imp_cleric": {
   "name": "帝國僧侶",
   "class": "cleric",
   "level": 4,
   "stats": {
    "hp": 17,
    "str": 0,
    "mag": 5,
    "skl": 4,
    "spd": 5,
    "lck": 3,
    "def": 2,
    "res": 6
   },
   "weapons": [
    "heal_staff"
   ]
  },
  "voss": {
   "name": "沃斯將軍",
   "class": "knight",
   "level": 9,
   "stats": {
    "hp": 34,
    "str": 12,
    "mag": 0,
    "skl": 8,
    "spd": 4,
    "lck": 4,
    "def": 14,
    "res": 3
   },
   "weapons": [
    "iron_lance",
    "javelin"
   ],
   "items": [
    "elixir"
   ],
   "sprite": "chara_2"
  }
 },
 "sprites": {
  "swordsman": {
   "name": "swordsman",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "................",
     ".....oooooo.....",
     "....ohhhhhho....",
     "...ohhhhhhhho...",
     "...ohhsssshho...",
     "...ohseesseho...",
     "....ossssso.....",
     "...oTTTTTTTo.w..",
     "..osTtTTTtTsow..",
     "..os.TTTTT.sow..",
     "...o.TTTTT.oo...",
     "....obbbbbo.....",
     "....otttttto....",
     "....oto..oto....",
     "....oo....oo....",
     "................"
    ]
   ]
  },
  "lancer": {
   "name": "lancer",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "................",
     ".....oooooo.....",
     "....ohhhhhho....",
     "...ohhhhhhhho...",
     "...ohhsssshho...",
     "...ohseesseho...",
     "....ossssso..w..",
     "..wwTTTTTTTwwww.",
     "..owTwwwwwTwow..",
     "..owTTTTTTTwo...",
     "...owTTTTTwo....",
     "....obbbbbo.....",
     "....owwwwwo.....",
     "....owo.owo.....",
     "....oo...oo.....",
     "................"
    ]
   ]
  },
  "archer": {
   "name": "archer",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "................",
     ".....oooooo.....",
     "....ohhhhhho....",
     "...ohhhhhhhho...",
     "...ohhsssshho...",
     "...ohseesseho...",
     "....ossssso.b...",
     "...oTTTTTTTob...",
     "..osTtTTTtTsob..",
     "..os.TTTTTsoob..",
     "...o.TTTTT.ob...",
     "....obbbbbob....",
     "....otttttto....",
     "....oto..oto....",
     "....oo....oo....",
     "................"
    ]
   ]
  },
  "mage": {
   "name": "mage",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "......oo........",
     ".....oTTo.......",
     "....oTTTTo......",
     "...oTTTTTTo.....",
     "..ooooooooooo...",
     "...ohseesseho...",
     "....ossssso..y..",
     "...oTTTTTTTo.b..",
     "..oTtTTTTTtTob..",
     "..osTTTTTTTsob..",
     "..oTTTTTTTTTob..",
     "..oTTTTTTTTTTb..",
     "..otTTTTTTTTtb..",
     "...ottttttto.b..",
     "....oo...oo.....",
     "................"
    ]
   ]
  },
  "fighter": {
   "name": "fighter",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "................",
     ".....oooooo.....",
     "....ohhhhhho....",
     "...ohhhhhhhho...",
     "...ohhsssshho...",
     "...ohseesseho...",
     "....ossssso.ww..",
     "..ooTTTTTTToww..",
     ".ossTtTTTtssobw.",
     ".oss.TTTTTsso.b.",
     "..oo.TTTTT.oo.b.",
     "....obbbbbo...b.",
     "....otttttto....",
     "....oto..oto....",
     "....oo....oo....",
     "................"
    ]
   ]
  },
  "knight": {
   "name": "knight",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "................",
     ".....wwwwww.....",
     "....wwwwwwww....",
     "...owwTTTTwwo...",
     "...owwoeeowwo...",
     "...owwwwwwwwo...",
     "....owwwwwo.w...",
     "..wwTTTTTTTwww..",
     ".owwTwwwwwTwwow.",
     ".owwTTTTTTTwwo..",
     "..owwTTTTTwwo...",
     "...owwwwwwwo....",
     "...owwwwwwwwo...",
     "...owwo..owwo...",
     "...ooo....ooo...",
     "................"
    ]
   ]
  },
  "cavalier": {
   "name": "cavalier",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "......oooo......",
     ".....ohhhho.w...",
     ".....ohseso.w...",
     "......osso..w...",
     ".....oTTTTo.w...",
     "....oTtTTtTow...",
     ".bbbbbTTTTbbbb..",
     "bnnnnnnnnnnnnnb.",
     "bnnnnnnnnnnnnnnb",
     ".bnnnnnnnnnnnnb.",
     "..bnnnnnnnnnnb..",
     "..bn.bn..bn.nb..",
     "..bn.bn..bn.nb..",
     "..bb.bb..bb.bb..",
     "................",
     "................"
    ]
   ]
  },
  "pegasus": {
   "name": "pegasus",
   "w": 16,
   "h": 16,
   "palette": {
    "o": "#1c1c28",
    "h": "#7a4a22",
    "s": "#f2c79a",
    "e": "#1c1c28",
    "T": "team",
    "t": "teamDark",
    "w": "#d6dbe4",
    "b": "#7a5230",
    "y": "#ffe25a",
    "n": "#c8b49a"
   },
   "frames": [
    [
     "..www...........",
     ".wwwww...oooo...",
     ".wwwwww.ohhhho..",
     "..wwwwwwohseso..",
     "...wwwwwwossow..",
     "....wwwwoTTTow..",
     ".....wwoTtTTtow.",
     "..wwwwwwwwwwww..",
     ".wwwwwwwwwwwwwww",
     "..wwwwwwwwwwww..",
     "...ww.ww..ww.w..",
     "...ww.ww..ww.w..",
     "................",
     "................",
     "................",
     "................"
    ]
   ]
  },
  "chara_0": {
   "name": "藍衣少女",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 0,
   "frameW": 36,
   "frameH": 36
  },
  "chara_1": {
   "name": "銀髮少女",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 1,
   "frameW": 36,
   "frameH": 36
  },
  "chara_2": {
   "name": "狐耳少女",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 2,
   "frameW": 36,
   "frameH": 36
  },
  "chara_3": {
   "name": "綠帽少女",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 3,
   "frameW": 36,
   "frameH": 36
  },
  "chara_4": {
   "name": "魔女",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 4,
   "frameW": 36,
   "frameH": 36
  },
  "chara_5": {
   "name": "紅白巫女",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 5,
   "frameW": 36,
   "frameH": 36
  },
  "chara_6": {
   "name": "紅髮武人",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 6,
   "frameW": 36,
   "frameH": 36
  },
  "chara_7": {
   "name": "金髮少女",
   "image": "assets/characters.png",
   "sheet": "rpgmaker",
   "index": 7,
   "frameW": 36,
   "frameH": 36
  }
 },
 "portraits": {},
 "chapters": {
  "ch1": {
   "name": "第一章 邊境之村",
   "map": {
    "rows": [
     "MMMM....FF....MM",
     "MM...F.......FMM",
     "M..==========..M",
     "...=..V.....=...",
     ".F.=....FF..=..F",
     "...=..FFFF..=...",
     "..T=........=.T.",
     "...=..~~~...=...",
     ".F.=..~~~..V=...",
     "...==========...",
     "FF......FF....MM"
    ]
   },
   "units": [
    {
     "unit": "alan",
     "team": "player",
     "x": 1,
     "y": 8
    },
    {
     "unit": "mira",
     "team": "player",
     "x": 2,
     "y": 9
    },
    {
     "unit": "rook",
     "team": "player",
     "x": 0,
     "y": 7
    },
    {
     "unit": "elle",
     "team": "player",
     "x": 1,
     "y": 9
    },
    {
     "unit": "lina",
     "team": "player",
     "x": 0,
     "y": 8
    },
    {
     "unit": "bandit",
     "team": "enemy",
     "x": 8,
     "y": 4,
     "ai": "aggressive"
    },
    {
     "unit": "bandit",
     "team": "enemy",
     "x": 11,
     "y": 6,
     "ai": "aggressive"
    },
    {
     "unit": "bandit_axe",
     "team": "enemy",
     "x": 12,
     "y": 3,
     "ai": "guard"
    },
    {
     "unit": "kit",
     "team": "enemy",
     "x": 6,
     "y": 4,
     "ai": "guard"
    },
    {
     "unit": "garr",
     "team": "enemy",
     "x": 14,
     "y": 6,
     "ai": "hold",
     "boss": true
    }
   ],
   "victory": {
    "type": "boss"
   },
   "defeat": {
    "type": "lordDies"
   },
   "events": [
    {
     "on": "start",
     "script": "ch1_intro"
    },
    {
     "on": "talk",
     "a": "alan",
     "b": "kit",
     "script": "ch1_kit"
    },
    {
     "on": "visit",
     "x": 6,
     "y": 3,
     "script": "ch1_village"
    },
    {
     "on": "visit",
     "x": 11,
     "y": 8,
     "script": "ch1_village2"
    },
    {
     "on": "turn",
     "turn": 3,
     "phase": "enemy",
     "script": "ch1_reinf"
    },
    {
     "on": "death",
     "unit": "garr",
     "script": "ch1_garr"
    },
    {
     "on": "victory",
     "script": "ch1_end"
    }
   ],
   "next": [
    {
     "if": "route_forest",
     "chapter": "ch2a"
    },
    {
     "chapter": "ch2b"
    }
   ]
  },
  "ch2a": {
   "name": "第二章 迷霧森林",
   "map": {
    "rows": [
     "FFFF..FFFFF..FFF",
     "F..FF...F...FF.F",
     "F...F.FFF.F....F",
     "..F....F....FF..",
     ".FFF.T...F...F..",
     "..F...FF...FF...",
     "F...F....F...F.F",
     "FF....FF...F....",
     "F..F.F...FF..F.F",
     "FFF...FF....FFFF"
    ]
   },
   "units": [
    {
     "unit": "alan",
     "team": "player",
     "x": 7,
     "y": 5
    },
    {
     "unit": "mira",
     "team": "player",
     "x": 6,
     "y": 4
    },
    {
     "unit": "rook",
     "team": "player",
     "x": 8,
     "y": 4
    },
    {
     "unit": "elle",
     "team": "player",
     "x": 7,
     "y": 4
    },
    {
     "unit": "lina",
     "team": "player",
     "x": 8,
     "y": 5
    },
    {
     "unit": "kit",
     "team": "player",
     "x": 5,
     "y": 4,
     "if": "kit_joined"
    },
    {
     "unit": "sera",
     "team": "ally",
     "x": 1,
     "y": 3,
     "ai": "aggressive"
    },
    {
     "unit": "soldier",
     "team": "enemy",
     "x": 0,
     "y": 0
    },
    {
     "unit": "soldier",
     "team": "enemy",
     "x": 15,
     "y": 0
    },
    {
     "unit": "imp_archer",
     "team": "enemy",
     "x": 14,
     "y": 3
    },
    {
     "unit": "imp_mage",
     "team": "enemy",
     "x": 15,
     "y": 8
    },
    {
     "unit": "soldier",
     "team": "enemy",
     "x": 1,
     "y": 9
    }
   ],
   "victory": {
    "type": "survive",
    "turns": 5
   },
   "defeat": {
    "type": "lordDies"
   },
   "events": [
    {
     "on": "start",
     "script": "ch2a_intro"
    },
    {
     "on": "talk",
     "a": "alan",
     "b": "sera",
     "script": "ch2_sera"
    },
    {
     "on": "turn",
     "turn": 2,
     "phase": "enemy",
     "script": "ch2a_reinf"
    },
    {
     "on": "victory",
     "script": "ch2_end"
    }
   ],
   "next": [
    "ch3"
   ]
  },
  "ch2b": {
   "name": "第二章 王道關所",
   "map": {
    "rows": [
     "####..######..##",
     "#..#..#....#..#.",
     "....==========..",
     "..T.=........=..",
     "....=..FF....=K.",
     "....=..FF....=..",
     "..T.=........=..",
     "....==========..",
     "#..#..#....#..#.",
     "####..######..##"
    ]
   },
   "units": [
    {
     "unit": "alan",
     "team": "player",
     "x": 0,
     "y": 4
    },
    {
     "unit": "mira",
     "team": "player",
     "x": 0,
     "y": 5
    },
    {
     "unit": "rook",
     "team": "player",
     "x": 1,
     "y": 3
    },
    {
     "unit": "elle",
     "team": "player",
     "x": 1,
     "y": 6
    },
    {
     "unit": "lina",
     "team": "player",
     "x": 0,
     "y": 6
    },
    {
     "unit": "kit",
     "team": "player",
     "x": 1,
     "y": 4,
     "if": "kit_joined"
    },
    {
     "unit": "sera",
     "team": "enemy",
     "x": 9,
     "y": 1,
     "ai": "guard"
    },
    {
     "unit": "soldier",
     "team": "enemy",
     "x": 7,
     "y": 3
    },
    {
     "unit": "soldier",
     "team": "enemy",
     "x": 8,
     "y": 6
    },
    {
     "unit": "imp_archer",
     "team": "enemy",
     "x": 11,
     "y": 3
    },
    {
     "unit": "imp_knight",
     "team": "enemy",
     "x": 12,
     "y": 5,
     "ai": "hold"
    },
    {
     "unit": "imp_mage",
     "team": "enemy",
     "x": 12,
     "y": 7
    },
    {
     "unit": "imp_cleric",
     "team": "enemy",
     "x": 13,
     "y": 4,
     "ai": "guard"
    }
   ],
   "victory": {
    "type": "seize",
    "x": 14,
    "y": 4
   },
   "defeat": {
    "type": "lordDies"
   },
   "events": [
    {
     "on": "start",
     "script": "ch2b_intro"
    },
    {
     "on": "talk",
     "a": "alan",
     "b": "sera",
     "script": "ch2_sera"
    },
    {
     "on": "victory",
     "script": "ch2_end"
    }
   ],
   "next": [
    "ch3"
   ]
  },
  "ch3": {
   "name": "終章 晨星之誓",
   "map": {
    "rows": [
     "MMM..FF....FFMMM",
     "M....F..==....MM",
     "..==========...M",
     "..=..T....=....M",
     "..=.......=.K...",
     "..=..FF...=.....",
     "..==========...M",
     "M......FF......M",
     "MM..~~~....~~~MM"
    ]
   },
   "units": [
    {
     "unit": "alan",
     "team": "player",
     "x": 0,
     "y": 3
    },
    {
     "unit": "mira",
     "team": "player",
     "x": 0,
     "y": 4
    },
    {
     "unit": "rook",
     "team": "player",
     "x": 1,
     "y": 2
    },
    {
     "unit": "elle",
     "team": "player",
     "x": 1,
     "y": 5
    },
    {
     "unit": "lina",
     "team": "player",
     "x": 0,
     "y": 5
    },
    {
     "unit": "kit",
     "team": "player",
     "x": 1,
     "y": 4,
     "if": "kit_joined"
    },
    {
     "unit": "sera",
     "team": "player",
     "x": 0,
     "y": 2,
     "if": "sera_joined"
    },
    {
     "unit": "soldier",
     "team": "enemy",
     "x": 7,
     "y": 2
    },
    {
     "unit": "soldier",
     "team": "enemy",
     "x": 8,
     "y": 6
    },
    {
     "unit": "imp_archer",
     "team": "enemy",
     "x": 10,
     "y": 3
    },
    {
     "unit": "imp_mage",
     "team": "enemy",
     "x": 10,
     "y": 5
    },
    {
     "unit": "imp_knight",
     "team": "enemy",
     "x": 11,
     "y": 4,
     "ai": "hold"
    },
    {
     "unit": "imp_cleric",
     "team": "enemy",
     "x": 13,
     "y": 5,
     "ai": "guard"
    },
    {
     "unit": "voss",
     "team": "enemy",
     "x": 12,
     "y": 4,
     "ai": "hold",
     "boss": true
    }
   ],
   "victory": {
    "type": "boss"
   },
   "defeat": {
    "type": "lordDies"
   },
   "events": [
    {
     "on": "start",
     "script": "ch3_intro"
    },
    {
     "on": "death",
     "unit": "voss",
     "script": "ch3_voss"
    },
    {
     "on": "victory",
     "script": "ch3_end"
    }
   ],
   "next": []
  }
 },
 "scripts": {
  "ch1_intro": [
   {
    "cmd": "narrate",
    "text": "大陸歷 812 年。帝國的鐵蹄逼近邊境，山賊也趁亂四起……"
   },
   {
    "cmd": "say",
    "who": "mira",
    "text": "艾倫大人！山賊佔據了村子東邊的砦，村民們很危險。"
   },
   {
    "cmd": "say",
    "who": "alan",
    "side": "right",
    "text": "我知道。大家，跟我來——先擊倒山賊頭目加爾！"
   },
   {
    "cmd": "say",
    "who": "elle",
    "text": "我的火焰魔法對付重甲很有效喔。"
   },
   {
    "cmd": "say",
    "who": "rook",
    "text": "弓箭只能射兩格外的敵人，別讓他們貼近我。"
   },
   {
    "cmd": "say",
    "who": "lina",
    "text": "受傷了就到我身邊來，我用治療杖幫大家回復。"
   },
   {
    "cmd": "narrate",
    "text": "【提示】點選我方單位→點藍色格移動→選擇行動：攻擊／杖／精神／道具／交換／待機。村莊(V)可以拜訪；艾倫可以和盜賊基特「交談」。"
   },
   {
    "cmd": "narrate",
    "text": "【精神指令】消耗 SP 發動「必中」「熱血」「加速」等效果。【氣力】戰鬥與擊破敵人會提升，氣力越高傷害越大；艾倫的「流星斬」需要氣力 115。"
   }
  ],
  "ch1_kit": [
   {
    "cmd": "say",
    "who": "kit",
    "text": "……你們不是帝國的人？"
   },
   {
    "cmd": "say",
    "who": "alan",
    "side": "right",
    "text": "我們是來保護村子的。你不像山賊，為什麼跟他們在一起？"
   },
   {
    "cmd": "say",
    "who": "kit",
    "text": "為了錢啦。不過……加爾那傢伙連村民都搶，我也看不下去了。"
   },
   {
    "cmd": "choice",
    "prompt": "要怎麼回應基特？",
    "options": [
     {
      "text": "「跟我們走吧，我需要你的身手。」",
      "set": "kit_trust",
      "goto": "join"
     },
     {
      "text": "「把偷來的東西還回去，就放你走。」",
      "goto": "join_reluctant"
     }
    ]
   },
   {
    "cmd": "label",
    "name": "join"
   },
   {
    "cmd": "say",
    "who": "kit",
    "text": "嘿，有意思。好，算我一份！"
   },
   {
    "cmd": "goto",
    "label": "done"
   },
   {
    "cmd": "label",
    "name": "join_reluctant"
   },
   {
    "cmd": "say",
    "who": "kit",
    "text": "……嘖，被看穿了。那我就跟著你們，順便還債吧。"
   },
   {
    "cmd": "label",
    "name": "done"
   },
   {
    "cmd": "recruit",
    "unit": "kit"
   },
   {
    "cmd": "set",
    "flag": "kit_joined"
   }
  ],
  "ch1_village": [
   {
    "cmd": "say",
    "name": "村長",
    "text": "謝謝您來救我們！這把殺劍請收下，是過去騎士留下的。"
   },
   {
    "cmd": "give",
    "unit": "alan",
    "weapon": "killing_edge"
   },
   {
    "cmd": "narrate",
    "text": "艾倫獲得了殺劍！村長還透露：森林小徑可以繞過帝國的關所。"
   },
   {
    "cmd": "set",
    "flag": "knows_forest"
   }
  ],
  "ch1_village2": [
   {
    "cmd": "say",
    "name": "老婆婆",
    "text": "年輕人，小心帝國的天馬騎士。她們……其實並不想打仗。這枚戒指送你，會讓你更有力氣。"
   },
   {
    "cmd": "give",
    "unit": "alan",
    "item": "power_ring"
   },
   {
    "cmd": "set",
    "flag": "knows_sera"
   }
  ],
  "ch1_reinf": [
   {
    "cmd": "say",
    "who": "garr",
    "text": "哈！我的手下從山裡來啦！"
   },
   {
    "cmd": "spawn",
    "units": [
     {
      "unit": "bandit",
      "team": "enemy",
      "x": 15,
      "y": 0,
      "ai": "aggressive"
     },
     {
      "unit": "bandit_axe",
      "team": "enemy",
      "x": 14,
      "y": 10,
      "ai": "aggressive"
     }
    ]
   }
  ],
  "ch1_garr": [
   {
    "cmd": "say",
    "who": "garr",
    "text": "可、可惡……我加爾竟然……"
   }
  ],
  "ch1_end": [
   {
    "cmd": "say",
    "who": "mira",
    "text": "村子保住了。不過帝國軍主力就在前方。"
   },
   {
    "cmd": "if",
    "flag": "knows_forest",
    "goto": "forest_known"
   },
   {
    "cmd": "say",
    "who": "rook",
    "text": "走大路的話會碰上關所……還有其他路嗎？"
   },
   {
    "cmd": "label",
    "name": "forest_known"
   },
   {
    "cmd": "choice",
    "prompt": "前往王都的路線",
    "options": [
     {
      "text": "穿越迷霧森林（防守戰：撐過 5 回合）",
      "set": "route_forest"
     },
     {
      "text": "正面突破王道關所（壓制戰）"
     }
    ]
   },
   {
    "cmd": "say",
    "who": "alan",
    "side": "right",
    "text": "決定了，出發！"
   }
  ],
  "ch2a_intro": [
   {
    "cmd": "narrate",
    "text": "迷霧森林。濃霧中傳來帝國兵的腳步聲……"
   },
   {
    "cmd": "say",
    "who": "sera",
    "text": "（天馬騎士瑟拉離開了帝國部隊，正獨自在森林中徘徊。）"
   },
   {
    "cmd": "say",
    "who": "alan",
    "side": "right",
    "text": "被包圍了！守住陣形，撐到霧散！"
   }
  ],
  "ch2a_reinf": [
   {
    "cmd": "spawn",
    "units": [
     {
      "unit": "soldier",
      "team": "enemy",
      "x": 15,
      "y": 5
     },
     {
      "unit": "imp_archer",
      "team": "enemy",
      "x": 0,
      "y": 5
     }
    ]
   }
  ],
  "ch2b_intro": [
   {
    "cmd": "say",
    "who": "alan",
    "side": "right",
    "text": "突破關所，壓制右側的王座(K)！"
   },
   {
    "cmd": "if",
    "flag": "knows_sera",
    "goto": "hint"
   },
   {
    "cmd": "end"
   },
   {
    "cmd": "label",
    "name": "hint"
   },
   {
    "cmd": "say",
    "who": "elle",
    "text": "那位天馬騎士……老婆婆說她不想打仗，也許可以跟她談談？"
   }
  ],
  "ch2_sera": [
   {
    "cmd": "say",
    "who": "sera",
    "text": "你就是邊境的艾倫？……帝國的做法，我已經受夠了。"
   },
   {
    "cmd": "say",
    "who": "alan",
    "side": "right",
    "text": "那就和我們一起，終結這場戰爭吧。"
   },
   {
    "cmd": "recruit",
    "unit": "sera"
   },
   {
    "cmd": "set",
    "flag": "sera_joined"
   }
  ],
  "ch2_end": [
   {
    "cmd": "say",
    "who": "mira",
    "text": "前方就是沃斯將軍的本陣了。這把在敵營找到的勇者之劍，給艾倫大人用吧。"
   },
   {
    "cmd": "give",
    "unit": "alan",
    "weapon": "brave_sword"
   },
   {
    "cmd": "if",
    "flag": "sera_joined",
    "goto": "sera"
   },
   {
    "cmd": "end"
   },
   {
    "cmd": "label",
    "name": "sera"
   },
   {
    "cmd": "say",
    "who": "sera",
    "text": "沃斯將軍很堅固，用魔法攻擊比較有效。"
   }
  ],
  "ch3_intro": [
   {
    "cmd": "say",
    "who": "voss",
    "text": "邊境的小鬼，就到此為止了。"
   },
   {
    "cmd": "say",
    "who": "alan",
    "side": "right",
    "text": "不，這裡才是開始！"
   }
  ],
  "ch3_voss": [
   {
    "cmd": "say",
    "who": "voss",
    "text": "這股力量……就是所謂的「晨星」嗎……"
   }
  ],
  "ch3_end": [
   {
    "cmd": "narrate",
    "text": "沃斯將軍倒下，帝國軍撤退了。"
   },
   {
    "cmd": "if",
    "flag": "kit_trust",
    "goto": "kit"
   },
   {
    "cmd": "goto",
    "label": "fin"
   },
   {
    "cmd": "label",
    "name": "kit"
   },
   {
    "cmd": "say",
    "who": "kit",
    "text": "老大，下次去哪裡？我都跟定你了。"
   },
   {
    "cmd": "label",
    "name": "fin"
   },
   {
    "cmd": "narrate",
    "text": "── 示範劇本 完 ── 用編輯器來寫你自己的故事吧！"
   }
  ]
 }
};
