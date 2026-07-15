export interface DWClassTemplate {
  name: string
  hpBase: number
  damageDie: string
  loadBase: string
  alignments: string[]
  races: { name: string; move: string }[]
  startingMoves: string
  bonds: string
  startingEquipment: string[]
  notes: string
}

export const DW_CLASSES: DWClassTemplate[] = [
  {
    name: 'Barbarian',
    hpBase: 8,
    damageDie: 'd10',
    loadBase: '8+STR',
    alignments: ['Chaotic', 'Neutral', 'Evil'],
    races: [
      { name: 'Human', move: 'When you return from the dungeon with treasure, you may hold 1 instead of using the standard Carouse move.' },
      { name: 'Outsider', move: 'You may be of any non-human race. When you use your Herculean Appetites move, you have +1d4 hold.' },
    ],
    startingMoves: `HERCULEAN APPETITES
You have a d8 hold over your Appetites (hunger, lust, wanderlust). When you indulge an Appetite, hold fades as the GM dictates.

UNENCUMBERED, UNARMORED
When you are not wearing armor and not encumbered, take +1 armor.

APPETITE FOR DESTRUCTION (choose one at character creation)
- SMASH! When you use your to defy danger, any harm you take is reduced by 1d6.
- DESTROY! When you hack and slash an enemy into oblivion, you deal +1d6 damage.
- BEND BARS, LIFT GATES. When you use pure strength, treat 7-9 as a 10+.`,
    bonds: `Fill in the blanks for each bond that applies:
• ___ is puny and foolish, but I will protect them nonetheless.
• I have bested ___ in a contest of strength or endurance.
• ___ wants me to be more civilized — that is not how I was meant to live.
• ___ has seen me at my most savage and still accepts me.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Hide armor (1 armor, 1 weight)',
      'Choose a weapon: Battle axe (close, 1 weight) OR Flail (close, 2 weight) OR War axe (close, 1 weight)',
      'Choose: 3 antitoxins (0 weight) OR Adventuring gear (1 weight)',
    ],
    notes: 'Damage: d10 | HP: 8+CON | Load: 8+STR\nAlignments — Chaotic: Drive yourself to the limits and try something that terrifies you. | Neutral: Help someone survive a challenge that would break a lesser person. | Evil: Destroy something that cannot fight back.',
  },
  {
    name: 'Bard',
    hpBase: 6,
    damageDie: 'd6',
    loadBase: '9+STR',
    alignments: ['Good', 'Neutral', 'Chaotic'],
    races: [
      { name: 'Elf', move: 'When you enter an important location (city, tower, dungeon) you can ask the GM for one piece of lore about the history of that place.' },
      { name: 'Human', move: "When you first enter a civilized settlement, someone recognizes your work and is Helpful or Hostile (GM's choice)." },
    ],
    startingMoves: `ARCANE ART
When you weave a performance into a basic spell, choose an ally and an effect:
• Heal 1d8 damage
• +1d4 forward to their damage
• Their mind is shaken clear of one enchantment
• The next time someone successfully assists them, add +2 instead of +1
Roll +CHA. On a 10+, the ally gets the effect. On a 7-9, the ally gets the effect, but you also draw unwanted attention or your magic reverberates unpleasantly.

BARDIC LORE
Choose an area of expertise: Spells & Magic / The Dead & Undead / Grand Histories / A Particular Monster Type / Lands & Geography / Rumors & Gossip / Combat & Tactics
When you first encounter an important creature, location, or item covered by your Bardic Lore, you can ask the GM any one question about it; the GM will answer truthfully.

CHARMING AND OPEN
When you speak frankly with someone, you can ask their player or the GM: What are you really feeling? What do you most want? Who do you rely on most? What do you wish I knew? They must answer honestly, then they may ask you one of those questions in return.

A PORT IN THE STORM
When you return to a civilized settlement you've visited before, tell the GM when you were last here. They'll tell you how it's changed since then.`,
    bonds: `Fill in the blanks for each bond that applies:
• This is not my first adventure with ___.
• I sang songs of ___ long before I ever met them in person.
• ___ is often the butt of my jokes. I hope they don't take it personally.
• ___ has my back when things go wrong.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Leather armor (1 armor, 1 weight)',
      'Choose a weapon: Dueling rapier (close, precise, 1 weight) OR Worn bow and 3 arrows (near, 2 weight)',
      'Choose: Adventuring gear (1 weight) OR Bandages (0 weight)',
      'Your choice of instrument (0 weight)',
    ],
    notes: 'Damage: d6 | HP: 6+CON | Load: 9+STR\nAlignments — Good: Perform your art to aid those who truly need it. | Neutral: Avoid a conflict or defuse a tense situation through performance. | Chaotic: Spur others to significant and unplanned action.',
  },
  {
    name: 'Cleric',
    hpBase: 8,
    damageDie: 'd6',
    loadBase: '10+STR',
    alignments: ['Good', 'Lawful', 'Evil'],
    races: [
      { name: 'Dwarf', move: 'You are one with stone. When you commune you are also granted a vision of what lies beneath the earth.' },
      { name: 'Human', move: 'Your faith is diverse. Choose one cleric spell. You can cast it as if it were a wizard spell.' },
    ],
    startingMoves: `DEITY
You serve and worship a deity. Give your deity a name and tell the GM what they're god of. The GM will tell you:
• What is your deity's domain?
• What is your deity's ban (something forbidden by your deity)?

DIVINE GUIDANCE
When you petition your deity according to the precepts of your faith, you are granted some useful knowledge or boon related to their domain. The GM will tell you what.

TURN UNDEAD
When you hold your holy symbol aloft and call on your deity for aid, roll+WIS. On a 10+, so long as you continue to pray and brandish your symbol, no undead can come within reach of you. On a 7-9, some falter but others press on.

COMMUNE
When you spend uninterrupted time (an hour or so) in quiet communion with your deity, you:
• Lose any spells already granted to you
• Are granted new spells of your choice whose total levels don't exceed your own level+1
• Prepare your rotes, which never count against your limit

CAST A SPELL (Cleric)
When you unleash a spell granted to you by your deity, roll+WIS. On a 10+, the spell is successfully cast and your deity does not revoke the spell — you may cast it again. On a 7-9, the spell is cast but choose one: you draw unwanted attention or put yourself in a spot, the spell's effects are delayed, you take -1 ongoing to cast a spell until the next time you commune, you forget the spell (cross it off).`,
    bonds: `Fill in the blanks for each bond that applies:
• ___ has strayed from the path of righteousness. I will help them find their way.
• ___ is a heathen. I will show them the light of my deity — whether they wish it or not.
• I worked with ___ to do something I now consider sinful. I must atone for my actions.
• ___ respects my deity. We work well together.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Scale mail (2 armor, 3 weight)',
      'Choose a weapon: Staff (close, two-handed, 1 weight) OR Mace (close, 1 weight)',
      'Holy symbol of your deity (0 weight)',
      'Choose: Adventuring gear (1 weight) OR 3 antitoxins (0 weight)',
      'Starting spells: Rote of Light, plus 2 cleric spells of your choice',
    ],
    notes: 'Damage: d6 | HP: 8+CON | Load: 10+STR\nAleric Spells (rotes always prepared): Light, Sanctify, Guidance\nAlignments — Good: Endanger yourself to heal another. | Lawful: Deny healing to a criminal or unworthy supplicant. | Evil: Harm another to prove the superiority of your deity.',
  },
  {
    name: 'Druid',
    hpBase: 6,
    damageDie: 'd6',
    loadBase: '6+STR',
    alignments: ['Good', 'Neutral', 'Chaotic'],
    races: [
      { name: 'Elf', move: 'The sap of the elder trees flows in your veins. When in the presence of ancient trees, you may ask the GM what they have seen.' },
      { name: 'Human', move: 'At the beginning of each session, you may ask the GM for a vision about what will happen in this session related to nature.' },
    ],
    startingMoves: `BORN OF THE SOIL
You learned your magic in a specific place of power (a region). Choose it as your Land. Describe it. When you are in your Land, or when you call on memories of it, your prayers are more powerful — take +1 ongoing to cast a spell.

SPIRIT TONGUE
The grunts, barks, chirps, and phlegmy rattles of the creatures of the wild are as speech to you. You can understand any animal well enough to communicate basic concepts — hunger, danger, and direction. Most animals will be startled by a human speaker but will give you a chance.

SHAPESHIFTER
When you call upon the spirits to take the form of a beast, roll+WIS. On a 10+, take 3 hold. On a 7-9, take 2 hold. Spend hold to:
• Move somewhere a human couldn't
• Strike with fierce natural weapons for d6+STR damage
• Sense beyond human senses for a moment
• Speak to a creature of that form
You may take a different form as your load allows.

COMMUNE WITH NATURE
When you spend time in quiet commune with the natural world, lose any spells already granted and gain new druid spells of your choice whose total levels don't exceed your level+1. Also prepare your rotes.

CAST A SPELL (Druid)
When you call on the natural spirits to work magic for you, roll+WIS. Works the same as cleric casting.`,
    bonds: `Fill in the blanks for each bond that applies:
• ___ smells more like prey than person. I keep a close watch on them.
• The human cities make ___ feel uncomfortable. I will show them the world is not so small.
• ___ has eaten the flesh of a magical creature. I must purify them.
• I have guided ___ through dangerous wilderness before.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Leather armor (1 armor, 1 weight)',
      'Staff (close, two-handed, 1 weight)',
      'Adventuring gear (1 weight)',
      'Choose: Bundle of herbs (1 weight) OR Totem of your Land (0 weight)',
      'Starting spells: Rote of Spiritwalk, plus 2 druid spells',
    ],
    notes: 'Damage: d6 | HP: 6+CON | Load: 6+STR\nDruid Rotes: Guidance, Shapeshift (rote), Speak with Dead\nAlignments — Good: Heal the damage done to the natural world. | Neutral: Act in accordance with the spirits of this place. | Chaotic: Destroy what damages the natural order.',
  },
  {
    name: 'Fighter',
    hpBase: 10,
    damageDie: 'd10',
    loadBase: '15+STR',
    alignments: ['Good', 'Neutral', 'Evil'],
    races: [
      { name: 'Dwarf', move: 'When you share a drink with someone, you may ask the GM one question about them as though you rolled a 10+ on Discern Realities.' },
      { name: 'Elf', move: 'Choose one weapon — you have a lifetime of training with it. When you wield that weapon you get +1.' },
      { name: 'Human', move: "Once per battle you may reroll a single damage roll (yours or someone else's)." },
      { name: 'Halfling', move: 'When you Defy Danger and use your small size or dexterity to your advantage, take +1.' },
    ],
    startingMoves: `BEND BARS, LIFT GATES
When you use pure strength to destroy an inanimate obstacle, roll+STR. On a 10+, choose 3. On a 7-9, choose 2:
• It doesn't take a very long time
• Nothing of value is damaged
• It doesn't make an inordinate amount of noise
• You can fix the thing again without a lot of effort

ARMORED
You ignore the clumsy tag on armor you wear.

SIGNATURE WEAPON
This is your weapon. There are many like it, but this one is yours. Your signature weapon has a base type (choose 1: Ragged blade / Serrated edge / Blade-breaker / Ornate blade / Simple blade / Heavy blade / Blade of the worthy) and a look (choose 1). Choose your weapon's range: Hand, Close, or Reach. Choose two enhancements from the list.`,
    bonds: `Fill in the blanks for each bond that applies:
• ___ has stood by me in battle and I will return the favor.
• I have sworn to protect ___. I will not fail.
• I worry about the ability of ___ to survive in this dungeon.
• ___ is soft, but I will make them hard like me.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Your Signature Weapon',
      'Choose armor: Scale mail (2 armor, 3 weight) OR Chainmail (1 armor, 1 weight, worn)',
      'Choose 2: Adventuring gear (1 weight) / Shield (+1 armor, 2 weight) / 3 antitoxins (0 weight) / Dungeon rations x2 (2 weight) / 1 healing potion (0 weight)',
    ],
    notes: 'Damage: d10 | HP: 10+CON | Load: 15+STR\nAlignments — Good: Defend those who cannot defend themselves. | Neutral: Defeat a worthy opponent. | Evil: Kill a defenseless or surrendered enemy.',
  },
  {
    name: 'Paladin',
    hpBase: 10,
    damageDie: 'd10',
    loadBase: '12+STR',
    alignments: ['Lawful', 'Good'],
    races: [
      { name: 'Human', move: "When you pray for guidance, even if you don't Commune, you still get an answer to a simple question." },
      { name: 'Dwarf', move: "When you take damage you can choose to instead take -1 ongoing until you Commune and receive the Deity's blessing." },
    ],
    startingMoves: `HOLY WEAPON
When you lay your hands on a weapon and bless it, it becomes a Holy Weapon for as long as you hold it. A Holy Weapon deals +1d4 damage to undead, demons, and other unholy creatures.

LAY ON HANDS (CHA)
When you touch someone, skin to skin, and pray for their well-being, roll+CHA. On a 10+, you heal 1d8 damage or remove one disease or poison. On a 7-9, they are healed, but the damage or affliction is transferred to you.

ARMORED
You ignore the clumsy tag on armor you wear.

I AM THE LAW
When you give an NPC an order based on your divine authority, roll+CHA. On a 10+, they obey you or they explain what it would take to obey. On a 7-9, they do it if it's reasonable and safe for them, otherwise you get +1 forward to force the issue.

QUEST
When you dedicate yourself to a mission through prayer and ritual cleansing, state what you set out to do:
• Slay [monster] a terror to the innocent
• Protect [person] from the forces of evil
• Bring [artifact] to [place]
• Cleanse [place] of its evil
You get +1 armor ongoing and you deal +1d4 damage whenever you act in accordance with your Quest. However, if you fail your Quest, you lose all Holy moves until you atone.`,
    bonds: `Fill in the blanks for each bond that applies:
• ___ has insulted my deity; I do not trust them.
• ___ is a good and faithful person; I will see them do right.
• ___ is in danger of losing their soul; I will save them.
• I respect the beliefs of ___ but hope they will someday see the true path.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Scale mail (2 armor, 3 weight)',
      'Holy symbol (0 weight)',
      'Choose a weapon: Long sword (close, +1 damage, 1 weight) OR Warhammer (close, forceful, 1 weight)',
      'Choose: Shield (+1 armor, 2 weight) OR Adventuring gear (1 weight)',
      '1 healing potion (0 weight)',
    ],
    notes: 'Damage: d10 | HP: 10+CON | Load: 12+STR\nAlignments — Lawful: Deny mercy to a criminal or unworthy supplicant. | Good: Endanger yourself to defeat an undead or demonic threat.',
  },
  {
    name: 'Ranger',
    hpBase: 8,
    damageDie: 'd8',
    loadBase: '11+STR',
    alignments: ['Good', 'Neutral', 'Chaotic'],
    races: [
      { name: 'Elf', move: 'When you Hunt and Track, on a hit you may also ask one question about the creature from the GM.' },
      { name: 'Human', move: "When you Make Camp in a dungeon or city, you don't need to consume a ration." },
    ],
    startingMoves: `HUNT AND TRACK (WIS)
When you follow a trail of clues left behind by passing creatures, roll+WIS. On a 10+, you follow the creature's trail until there's a significant change in its direction or mode of travel. On a 7-9, you follow the trail as long as you move at half your normal speed.

CALLED SHOT
When you stand and carefully aim at a target, forgoing other actions to do so, and then attack, you may choose your target's weak point. Describe it and deal +1d4 damage.

ANIMAL COMPANION
You have a devoted animal companion who fights alongside you. Choose an animal and describe your companion. Your animal companion can be given orders in combat; it shares your moves and your damage roll.

MAN'S BEST FRIEND
When you allow your animal companion to take a blow that was meant for you, the damage is negated and your animal companion is either dead or gravely injured (GM's choice). If your animal companion is injured, it cannot accompany you until you Make Camp and heal it (spend a ration).

FAMILIAR PREY
When you first encounter an enemy you have hunted before, tell the GM what you know about it.

CAMOUFLAGE
When you keep still in natural surroundings, enemies never spot you first — you always have the chance to ambush or escape.`,
    bonds: `Fill in the blanks for each bond that applies:
• I have guided ___ before and they owe me for it.
• ___ is a friend of nature, so I will be their friend as well.
• ___ has no respect for nature. I hope to teach them better.
• My animal companion reacts strangely to ___; I will discover why.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Leather armor (1 armor, 1 weight)',
      'Choose: Bow (near, far, 2 weight) with bundle of arrows (3 ammo, 1 weight) OR Short sword (close, 1 weight) and shield (+1 armor, 2 weight)',
      'Choose: Adventuring gear (1 weight) OR Blanket (1 weight) and a map of the area',
      'Your animal companion (describe it)',
    ],
    notes: 'Damage: d8 | HP: 8+CON | Load: 11+STR\nAlignments — Good: Endanger yourself to protect the meek. | Neutral: Help an animal or spirit of the wild. | Chaotic: Kill a defenseless or surrendered enemy.',
  },
  {
    name: 'Thief',
    hpBase: 6,
    damageDie: 'd8',
    loadBase: '9+STR',
    alignments: ['Neutral', 'Chaotic', 'Evil'],
    races: [
      { name: 'Halfling', move: 'When you attack with a ranged weapon, deal +2 damage.' },
      { name: 'Human', move: 'You are a professional. When you Spout Lore or Discern Realities about criminal activities, people, or places, take +1.' },
    ],
    startingMoves: `TRAP EXPERT
When you spend a moment to survey a dangerous area, roll+DEX. On a 10+, hold 3. On a 7-9, hold 1. Spend your hold as you walk through the area to avoid traps or create distractions.

TRICKS OF THE TRADE
When you pick locks or pockets or perform some other act of larceny, roll+DEX. On a 10+, you do it, no problem. On a 7-9, you still do it, but the GM will offer you two options between suspicion and cost.

BACKSTAB
When you attack a surprised or defenseless enemy with a melee weapon, you can choose to deal your damage or roll+DEX. On a 10+, choose two. On a 7-9, choose one:
• You don't get into melee with them
• You deal your damage+1d6
• You create an advantage; +1 forward to you or an ally acting on it
• Reduce their armor by 1 until they repair it

FLEXIBLE MORALS
When someone tries to detect your alignment you can tell them any alignment you like.

POISONER
You've mastered the art of poison. You carry 3 uses of a dangerous poison. When you apply it to your weapon and deal damage, add 1d4 to your damage and the target is also Sick (they take 1 damage forward for every 10 minutes spent not resting).`,
    bonds: `Fill in the blanks for each bond that applies:
• ___ has my back when things go wrong.
• ___ knows incriminating details about me.
• ___ and I have a con running. They might not know it yet.
• ___ is my fence. When I need to sell something, I talk to them first.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Leather armor (1 armor, 1 weight)',
      'Choose 2 weapons: Short sword (close, 1 weight) / Dagger (hand, 1 weight) / Throwing daggers (thrown, near, 1 weight)',
      'Adventuring gear (1 weight)',
      'Thieves\' tools (1 weight)',
      '3 uses of poison (0 weight)',
    ],
    notes: 'Damage: d8 | HP: 6+CON | Load: 9+STR\nAlignments — Neutral: Avoid a conflict or defuse a tense situation through subterfuge. | Chaotic: Shift danger or blame to another. | Evil: Harm an innocent for your own gain.',
  },
  {
    name: 'Wizard',
    hpBase: 4,
    damageDie: 'd4',
    loadBase: '7+STR',
    alignments: ['Good', 'Neutral', 'Evil'],
    races: [
      { name: 'Elf', move: 'Magic is as natural as breath to you. Detect Magic is a cantrip for you.' },
      { name: 'Human', move: 'Choose one cleric spell. You can cast it as if it were a wizard spell.' },
    ],
    startingMoves: `SPELLBOOK
You have mastered several spells and inscribed them in your spellbook. You start with three first level spells in your book as well as the cantrips. Whenever you gain a level, you add a new spell of your level or lower to your book. Your spellbook is 1 weight.

PREPARE SPELLS
When you spend uninterrupted time (an hour or so) studying your spellbook, you lose any spells you already have prepared and prepare new spells of your choice from your spellbook whose total levels don't exceed your own level+1. You also prepare your cantrips which never count toward your limit.

CAST A SPELL (Wizard)
When you release a spell you've prepared, roll+INT. On a 10+, the spell is successfully cast and you don't lose it from your prepared list. On a 7-9, the spell is cast but choose one: you draw unwanted attention / the spell's effects are amplified or reduced (GM's choice) / you forget the spell (cross it off).

SPELL DEFENSE
You may expend your prepared spells to counter a magical attack against you or your allies. When you do, roll+INT. On a 10+, the spell is countered and has no effect. On a 7-9, the spell is countered but you are exhausted and take -1 ongoing to cast a spell until you sleep.

RITUAL
When you draw on a place of power to create a magical effect, tell the GM what you're trying to achieve. Ritual effects are always possible, but the GM will ask for 1-4 of: it will take days/weeks/months, you must get an ingredient from a dangerous place, it will be dangerous, you'll need assistance from a specialist, the effect will be short-lived.`,
    bonds: `Fill in the blanks for each bond that applies:
• ___ will be my protector while I study and cast spells.
• ___ is woefully ignorant of the workings of magic; I will enlighten them.
• ___ has made a pact with a power I do not trust. I will watch them carefully.
• I have a spell that might help ___ but they don't know its cost yet.`,
    startingEquipment: [
      'Dungeon rations (5 uses, 1 weight)',
      'Your spellbook (1 weight)',
      'Dagger (hand, 1 weight)',
      'Choose: Healing potion (0 weight) OR 3 antitoxins (0 weight)',
      'Adventuring gear (1 weight)',
      'Starting spells: 3 first-level spells of your choice from the wizard spell list',
    ],
    notes: 'Damage: d4 | HP: 4+CON | Load: 7+STR\nWizard Cantrips (always prepared): Light, Unseen Servant, Prestidigitation\nAlignments — Good: Use magic to directly aid another. | Neutral: Discover something about a magical mystery. | Evil: Use magic to cause suffering.',
  },
]

export function getDWClass(name: string): DWClassTemplate | undefined {
  return DW_CLASSES.find(c => c.name.toLowerCase() === name.toLowerCase())
}

export function applyDWTemplate(template: DWClassTemplate): {
  class: string
  features: string
  equipment: string[]
  notes: string
  combatStats: { maxHp: number; hp: number; ac: number; speed: number }
} {
  return {
    class: template.name,
    features: template.startingMoves,
    equipment: template.startingEquipment,
    notes: `${template.notes}\n\nBONDS\n${template.bonds}`,
    combatStats: {
      maxHp: template.hpBase,
      hp: template.hpBase,
      ac: 10,
      speed: 30,
    },
  }
}
