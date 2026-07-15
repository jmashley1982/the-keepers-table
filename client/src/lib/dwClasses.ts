export interface DWAdvancedMove {
  name: string
  description: string
  requires?: string
  replaces?: string
}

export interface DWClassTemplate {
  name: string
  hpBase: number
  damageDie: string
  loadBase: string
  alignments: string[]
  races: { name: string; move: string }[]
  looks: string[][]
  startingMoves: string
  advancedMoves1: DWAdvancedMove[]
  advancedMoves2: DWAdvancedMove[]
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
    looks: [
      ['Wild Eyes', 'Dead Eyes', 'Bright Eyes'],
      ['Shaggy Hair', 'Braided Hair', 'Mohawk', 'Bald'],
      ['Massive Body', 'Lithe Body', 'Battle-Scarred Body'],
      ['Animal Skins', 'Stitched Leathers', 'Furs and Bones'],
    ],
    startingMoves: `HERCULEAN APPETITES
You have a d8 hold over your Appetites (hunger, lust, wanderlust). When you indulge an Appetite, hold fades as the GM dictates.

UNENCUMBERED, UNARMORED
When you are not wearing armor and not encumbered, take +1 armor.

APPETITE FOR DESTRUCTION (choose one at character creation)
- SMASH! When you use your to defy danger, any harm you take is reduced by 1d6.
- DESTROY! When you hack and slash an enemy into oblivion, you deal +1d6 damage.
- BEND BARS, LIFT GATES. When you use pure strength, treat 7-9 as a 10+.`,
    advancedMoves1: [
      { name: 'Full Plate and Packing Steel', description: `You ignore the clumsy tag on armor you wear.` },
      { name: 'Hoarder', description: `When you have time to rifle through the belongings of a fallen enemy, roll+WIS. On a 10+, hold 3. On a 7–9, hold 1. Spend your hold 1 for 1 to have the GM reveal one of the following about the fallen:

 - A weapon worth taking
 - Coins or something of value
 - A useful mundane item` },
      { name: 'Long Pig', description: `When you eat the heart of a worthy enemy (your call), roll+CON. On a 10+, heal to your full HP and take +1 forward. On a 7–9, heal to your full HP.` },
      { name: 'Destined for Greatness', description: `When you make your Last Breath roll, on a 7–9 you may choose to survive with 1 HP instead of making a deal with Death. If you do, your Herculean Appetites lose 1 hold.` },
      { name: 'Cry Havoc', description: `When you lead the charge into battle, those who follow you take +1 forward.` },
      { name: 'Sick Burn', description: `When you mock and taunt your enemies, roll+CHA. On a 10+, choose 2. On a 7–9, choose 1.

 - One enemy breaks from their group to deal with you personally
 - One enemy becomes enraged and acts foolishly
 - One enemy is demoralized and takes -1 forward` },
      { name: 'Burning Hatred', description: `Choose a type of creature (orcs, undead, dragons, etc.) When you first encounter a member of that type in a session, hold 2. Spend your hold 1 for 1 to:

 - Deal +1d4 damage against that creature
 - Take +1 forward on a move against that creature` },
      { name: 'Outsider', description: `When you interact with civilized folk who underestimate or look down on you, roll+CHA. On a 10+, they recognize you as a warrior to be respected, if not trusted. On a 7–9, they treat you indifferently rather than dismissively.` },
      { name: 'Cleave', description: `When you Hack and Slash, on a 10+ you may deal your damage to a second target in reach as well, in addition to the primary.` },
    ],
    advancedMoves2: [
      { name: 'Armored Appetite', description: `You ignore the clumsy tag on armor you wear. While wearing armor, your Unencumbered, Unarmored bonus still applies.`,
      replaces: 'full_plate_and_packing_steel' },
      { name: 'Wild Abandon', description: `When you lead the charge into battle, those who follow you take +1 forward. You also take +1 forward.`,
      replaces: 'cry_havoc' },
      { name: 'Blood Bath', description: `When you Hack and Slash and deal damage, you may deal your damage to all enemies within reach instead of just one or two.`,
      requires: 'cleave' },
      { name: 'King of the Wild Frontier', description: `Your legend has spread even among the civilized. When you first meet someone who might have heard of you, roll+CHA. On a 10+, they know your name and either want something from you or have something to offer. On a 7–9, they've heard of you — stories mixed, but they pay attention.`,
      replaces: 'outsider' },
      { name: 'Indomitable', description: `When someone attempts to Parley with you using a threat of violence or harm, their roll is treated as a miss regardless of result.` },
      { name: 'Burning Bridges', description: `When you take damage from an enemy, take +1 forward against that enemy.` },
    ],
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
    notes: `Damage: d10 | HP: 8+CON | Load: 8+STR
Alignments — Chaotic: Drive yourself to the limits and try something that terrifies you. | Neutral: Help someone survive a challenge that would break a lesser person. | Evil: Destroy something that cannot fight back.`,
  },
  {
    name: 'Bard',
    hpBase: 6,
    damageDie: 'd6',
    loadBase: '9+STR',
    alignments: ['Good', 'Neutral', 'Chaotic'],
    races: [
      { name: 'Elf', move: 'When you enter an important location (your call) you can ask the GM for one fact from the history of that location.' },
      { name: 'Human', move: 'When you first enter a civilized settlement someone who respects the custom of hospitality to minstrels will take you in as their guest.' },
    ],
    looks: [
      ['Knowing Eyes', 'Fiery Eyes', 'Joyous Eyes'],
      ['Fancy Hair', 'Wild Hair', 'Stylish Cap'],
      ['Finery', 'Traveling Clothes', 'Poor Clothes'],
      ['Fit Body', 'Well-fed Body', 'Thin Body'],
    ],
    startingMoves: `ARCANE ART
When you weave a performance into a basic spell, choose an ally and an effect:

 - Heal 1d8 damage
 - +1d4 forward to damage
 - Their mind is shaken clear of one enchantment
 - The next time someone successfully assists the target with aid, they get +2 instead of +1

Then roll+Cha.

 - On a 10+, the ally gets the selected effect.
 - On a 7-9, your spell still works, but you draw unwanted attention or your magic reverberates to other targets affecting them as well, GM’s choice

BARDIC LORE
Choose an area of expertise:

 - Spells and Magicks
 - The Dead and Undead
 - Grand Histories of the Known World
 - A Bestiary of Creatures Unusual
 - The Planar Spheres
 - Legends of Heroes Past
 - Gods and Their Servants

When you first encounter an important creature, location, or item (your call) covered by your bardic lore you can ask the GM any one question about it; the GM will answer truthfully. The GM may then ask you what tale, song, or legend you heard that information in.

CHARMING AND OPEN
When you speak frankly with someone, you can ask their player a question from the list below. They must answer it truthfully, then they may ask you a question from the list (which you must answer truthfully).

 - Whom do you serve?
 - What do you wish I would do?
 - How can I get you to __________?
 - What are you really feeling right now?
 - What do you most desire?

A PORT IN THE STORM
When you return to a civilized settlement you’ve visited before, tell the GM when you were last here. They’ll tell you how it’s changed since then.`,
    advancedMoves1: [
      { name: 'Healing Song', description: `When you heal with Arcane Art you heal +1d8 damage.` },
      { name: 'Vicious Cacophony', description: `When you grant bonus damage with Arcane Art, you grant an extra +1d4 damage.` },
      { name: 'It Goes To Eleven', description: `When you unleash a crazed performance (a righteous lute solo or mighy brass blast, maybe) choose a target who can hear you and roll+CHA. 

 * On a 10+ the target attacks their nearest ally in range. 
 * On a 7-9 they attack their nearest ally, but you also draw their attention and ire.` },
      { name: 'Metal Hurlant', description: `When you shout with great force or play a shattering note choose a target and roll+CON. 

 * On a 10+ the target takes 1d10 damage and is deafened for a few minutes. 
 * On a 7-9 you still damage your target, but it’s out of control: the GM will choose an additional target nearby.` },
      { name: 'A Little Help From My Friends', description: `When you successfully aid someone you take +1 forward as well.` },
      { name: 'Eldritch Tome', description: `Your Arcane Art is strong, allowing you to choose two effects instead of one.` },
      { name: 'Duelist\'s Parry', description: `When you Hack & Slash, you take +1 armor forward.` },
      { name: 'Bamboozle', description: `When you Parley with someone, on a 7+ you also take +1 forward with them.` },
      { name: 'Multiclass Dabbler', description: `Get one move from another class. Treat your level as one lower for choosing the move.` },
      { name: 'Multiclass Initiate', description: `Get one move from another class. Treat your level as one lower for choosing the move.`,
      requires: 'multiclass_dabbler' },
    ],
    advancedMoves2: [
      { name: 'Healing Chorus', description: `When you heal with Arcane Art, you heal +2d8 damage.`,
      replaces: 'healing_song' },
      { name: 'Vicious Blast', description: `When you grant bonus damage with Arcane Art, you grant an extra +2d4 damage.`,
      replaces: 'vicious_cacophony' },
      { name: 'Unforgettable Face', description: `When you meet someone you’ve met before (your call) after some time apart you take +1 forward against them.` },
      { name: 'Reputation', description: `When you first meet someone who’s heard songs about you, roll+CHA.

 * On a 10+, tell the GM two things they’ve heard about you.
 * On a 7-9, tell the GM one thing they’ve heard, and the GM tells you one thing.` },
      { name: 'Eldritch Chord', description: `When you use Arcane Art, you choose two effects. You also get to choose one of those effects to double.`,
      replaces: 'eldritch_tones' },
      { name: 'An Ear For Magic', description: `When you hear an enemy cast a spell the GM will tell you the name of the spell and its effects. Take +1 forward when acting on the answers.` },
      { name: 'Devious', description: `When you use Charming and Open you may also ask “How are you vulnerable to me?” Your subject may not ask this question of you.` },
      { name: 'Duelists\'s Block', description: `When you Hack & Slash, you take +2 armor forward.`,
      replaces: 'duelists_parry' },
      { name: 'Multiclass Master', description: `Get a move from another class. Treat your level as one lower for choosing the move.` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
• This is not my first adventure with __________.
• I sang stories of __________ long before I ever met them in person.
• __________ is often the butt of my jokes.
• I am writing a ballad about the adventures of __________.
• __________ trusted me with a secret.
• __________ does not trust me, and for good reason.`,
    startingEquipment: [
      'You have Dungeon rations (ration, 5 uses, 3 coins, 1 weight)',
      'Choose one instrument, all are 0 weight for you: Your father\'s mandolin, repaired OR A fine lute, a gift from a noble OR The pipes with which you courted your first love OR A stolen horn OR A fiddle, never before played OR A songbook in a forgotten tongue',
      'Choose your clothing: Leather Armor (1 armor, worn, 10 coins, 1 weight) OR Ostentatious clothes (0 weight)',
      'Choose your armament: Dueling Rapier (close, 1 piercing, Precise, 50 coins, 2 weight) OR Ragged Bow (near, 15 coins, 2 weight), Bundle of Arrows (3 ammo, 1 coins, 1 weight), and Short Sword (close, 8 coins, 1 weight)',
      'Choose one: Adventuring Gear (5 uses, 20 coins, 1 weight) OR Bandages (3 uses, slow, 5 coins, 0 weight) OR Halfling Pipeleaf (6 uses, 5 coins, 0 weight) OR 3 coins',
    ],
    notes: `Damage: d6 | HP: 6+CON | Load: 9+STR
Alignments — Good: Perform your art to aid someone else. | Neutral: Avoid a conflict or defuse a tense situation. | Chaotic: Spur others to significant and unplanned decisive action.`,
  },
  {
    name: 'Cleric',
    hpBase: 8,
    damageDie: 'd6',
    loadBase: '10+STR',
    alignments: ['Good', 'Lawful', 'Evil'],
    races: [
      { name: 'Dwarf', move: 'You are one with stone. When you Commune you are also granted a special version of Words of the Unspeaking as a rote which only works on stone.' },
      { name: 'Human', move: 'Your faith is diverse. Choose one wizard spell. You can cast and be granted that spell as if it was a cleric spell.' },
    ],
    looks: [
      ['Kind Eyes', 'Sharp Eyes', 'Sad Eyes'],
      ['Tonsure', 'Strange Hair', 'Bald'],
      ['Flowing Robes', 'Habit', 'Common Garb'],
      ['Thin Body', 'Knobby Body', 'Flabby Body'],
    ],
    startingMoves: `DEITY
You serve and worship some deity or power which grants you spells. Give your god a name (maybe Helferth, Sucellus, Zorica or Krugon the Bleak) and choose your deity’s domain:

 - Healing and Restoration
 - Bloody Conquest
 - Civilization
 - Knowledge and Hidden Things
 - The Downtrodden and Forgotten
 - What Lies Beneath
Choose one precept of your religion:

 - Your religion preaches the sanctity of suffering, add Petition: Suffering
 - Your religion is cultish and insular, add Petition: Gaining Secrets
 - Your religion has important sacrificial rites, add Petition: Offering
 - Your religion believes in trial by combat, add Petition: Personal Victory

DIVINE GUIDANCE
When you petition your deity according to the precept of your religion, you are granted some useful knowledge or boon related to your deity’s domain. The GM will tell you what.

TURN UNDEAD
When you hold your holy symbol aloft and call on your deity for protection, roll+Wis. On a 7+, so long as you continue to pray and brandish your holy symbol, no undead may come within reach of you. On a 10+, you also momentarily daze intelligent undead and cause mindless undead to flee. Aggression breaks the effects and they are able to act as normal. Intelligent undead may still find ways to harry you from afar. They’re clever like that.

COMMUNE
When you spend uninterrupted time (an hour or so) in quiet communion with your deity, you:

 - Lose any spells already granted to you.
 - Are granted new spells of your choice whose total levels don’t exceed your own level+1, and none of which is a higher level than your own level.
 - Prepare all of your rotes, which never count against your limit.

CAST A SPELL
When you unleash a spell granted to you by your deity, roll+Wis. On a 10+, the spell is successfully cast and your deity does not revoke the spell, so you may cast it again. On a 7–9, the spell is cast, but choose one:

 - You draw unwelcome attention or put yourself in a spot. The GM will tell you how.
 - Your casting distances you from your deity—take -1 ongoing to cast a spell until the next time you commune.
 - After you cast it, the spell is revoked by your deity. You cannot cast the spell again until you commune and have it granted to you.
Note that maintaining spells with ongoing effects will sometimes cause a penalty to your roll to cast a spell.`,
    advancedMoves1: [
      { name: 'Chosen One', description: `Choose one spell. You are granted that spell as if it was one level lower.` },
      { name: 'Invigorate', description: `When you heal someone they take +2 forward to their damage.` },
      { name: 'The Scales of Life and Death', description: `When someone takes their last breath in your presence, they take +1 to the roll.` },
      { name: 'Serenity', description: `When you Cast a Spell you ignore the first -1 penalty from ongoing spells.` },
      { name: 'First Aid', description: `Cure Light Wounds is a rote for you, and therefore doesn’t count against your limit of granted spells.` },
      { name: 'Divine Intervention', description: `When you Commune you get 1 hold and lose any hold you already had. Spend that hold when you or an ally takes damage to call on your deity, they intervene with an appropriate manifestation (a sudden gust of wind, a lucky slip, a burst of light) and negate the damage.` },
      { name: 'Penitent', description: `When you take damage and embrace the pain, you may take +1d4 damage (ignoring armor). If you do, take +1 forward to cast a spell.` },
      { name: 'Empower', description: `When you Cast a Spell, on a 10+ you have the option of choosing from the 7–9 list. If you do, you may choose one of these effects as well:

 - The spell’s effects are doubled
 - The spell’s targets are doubled` },
      { name: 'Orison for Guidance', description: `When you sacrifice something of value to your deity and pray for guidance, your deity tells you what it would have you do. If you do it, mark experience.` },
      { name: 'Divine Protection', description: `You get +2 armor while on a quest.`,
      replaces: 'holy_protection' },
      { name: 'Devoted Healer', description: `When you heal someone else of damage, add your level to the amount of damage healed.` },
    ],
    advancedMoves2: [
      { name: 'Anointed', description: `Choose one spell in addition to the one you picked for chosen one. You are granted that spell as if it was one level lower.`,
      requires: 'chosen_one' },
      { name: 'Apotheosis', description: `The first time you spend time in prayer as appropriate to your god after taking this move, choose a feature associated with your deity (rending claws, wings of sapphire feathers, an all-seeing third eye, etc.). When you emerge from prayer, you permanently gain that physical feature.` },
      { name: 'Reaper', description: `When you take time after a conflict to dedicate your victory to your deity and deal with the dead, take +1 forward.` },
      { name: 'Providence', description: `You ignore the -1 penalty from two spells you maintain.`,
      replaces: 'serenity' },
      { name: 'Greater First Aid', description: `Cure Moderate Wounds is a rote for you, and therefore doesn’t count against your limit of granted spells.`,
      requires: 'first_aid' },
      { name: 'Divine Invincibility', description: `When you Commune you gain 2 hold and lose any hold you already had. Spend that hold when you or an ally takes damage to call on your deity, who intervenes with an appropriate manifestation (a sudden gust of wind, a lucky slip, a burst of light) and negates the damage.`,
      replaces: 'divine_intervention' },
      { name: 'Martyr', description: `When you take damage and embrace the pain, you may take +1d4 damage (ignoring armor). If you do, take +1 forward to cast a spell and add your level to any damage done or healed by the spell.`,
      replaces: 'penitent' },
      { name: 'Divine Armor', description: `When you wear no armor or shield you get 3 armor.`,
      replaces: 'divine_protection' },
      { name: 'Greater Empower', description: `When you cast a spell, on a 10–11 you have the option of choosing from the 7–9 list. If you do, you may choose one of these effects as well. On a 12+ you get to choose one of these effects for free.

 - The spell’s effects are doubled
 - The spell’s targets are doubled`,
      replaces: 'empower' },
      { name: 'Multiclass Dabbler', description: `Get one move from another class. Treat your level as one lower for choosing the move.` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
• __________ has insulted my deity; I do not trust them.
• __________ is a good and faithful person; I trust them implicitly.
• __________ is in constant danger, I will keep them safe.
• I am working on converting __________ to my faith.`,
    startingEquipment: [
      'You carry dungeon rations (ration, 5 uses, 3 coins, 1 weight) and some symbol of the divine, describe it (0 weight)',
      'Choose your defenses: Chainmail (1 armor, worn, 10 coins, 1 weight) OR Shield (+1 armor, 15 coins, 2 weight)',
      'Choose your armament: Warhammer (close, 8 coins, 1 weight) OR Mace (close, 8 coins, 1 weight) OR Staff (close, two-handed, 1 coins, 1 weight) and Bandages (3 uses, slow, 5 coins, 0 weight)',
      'Choose one: Adventuring Gear (5 uses, 20 coins, 1 weight) and dungeon rations (ration, 5 uses, 3 coins, 1 weight) OR Healing Potion (50 coins, 0 weight)',
    ],
    notes: `Damage: d6 | HP: 8+CON | Load: 10+STR
Alignments — Good: Endanger yourself to heal another. | Lawful: Endanger yourself following the precepts of your church or god. | Evil: Harm another to prove the superiority of your church or god.`,
  },
  {
    name: 'Druid',
    hpBase: 6,
    damageDie: 'd6',
    loadBase: '6+STR',
    alignments: ['Chaotic', 'Good', 'Neutral'],
    races: [
      { name: 'Elf', move: 'The sap of the elder trees flows within you. In addition to any other attunements, the Great Forest is always considered your land.' },
      { name: 'Human', move: 'As your people learned to bind animals to field and farm, so too are you bound to them. You may always take the shape of any domesticated animal, in addition to your normal options.' },
      { name: 'Halfling', move: 'You sing the healing songs of spring and brook. When you Make Camp, you and your allies heal +1d6.' },
    ],
    looks: [
      ['Wise Eyes', 'Wild Eyes', 'Haunting Eyes'],
      ['Furry Hood', 'Messy Hair', 'Braided Hair'],
      ['Ceremonial Garb', 'Practical Leathers', 'Weathered Hides'],
    ],
    startingMoves: `BORN OF THE SOIL
You learned your magic in a place whose spirits are strong and ancient and they’ve marked you as one of their own. No matter where you go, they live within you and allow you to take their shape. Choose one of the following. It is the land to which you are attuned—when shapeshifting you may take the shape of any animal who might live in your Land.

 - The Great Forests
 - The Whispering Plains
 - The Vast Desert
 - The Stinking Mire
 - The River Delta
 - The Depths of the Earth
 - The Sapphire Islands
 - The Open Sea
 - The Towering Mountains
 - The Frozen North
 - The Blasted Wasteland
Chose a tell—a physical attribute that marks you as born of the soil—that reflects the spirit of your land. It may be an animal feature like antlers or leopard’s spots or something more general: hair like leaves or eyes of glittering crystal. Your tell remains no matter what shape you take.

BY NATURE SUSTAINED
You don’t need to eat or drink. If a move tells you to mark off a ration just ignore it.

SPIRIT TONGUE
The grunts, barks, chirps, and calls of the creatures of the wild are as language to you. You can understand any animal native to your land or akin to one whose essence you have studied.

SHAPESHIFTER
When you call upon the spirits to change your shape, roll+Wis. On a 10+ hold 3. On a 7–9 hold 2. On a miss hold 1 in addition to whatever the GM says.
You may take on the physical form of any species whose essence you have studied or who lives in your land: you and your possessions meld into a perfect copy of the species’ form. You have any innate abilities and weaknesses of the form: claws, wings, gills, breathing water instead of air. You still use your normal stats but some moves may be harder to trigger—a housecat will find it hard to do battle with an ogre. The GM will also tell you one or more moves associated with your new form. Spend 1 hold to make that move. Once you’re out of hold, you return to your natural form. At any time, you may spend all your hold and revert to your natural form.

STUDIED ESSENCE
When you spend time in contemplation of an animal spirit, you may add its species to those you can assume using shapeshifting.`,
    advancedMoves1: [
      { name: 'Hunter’s Brother', description: `Choose one move from the ranger class list.` },
      { name: 'Red of Tooth and Claw', description: `When you are in an appropriate animal form (something dangerous) increase your damage to d8.` },
      { name: 'Communion of Whispers', description: `When you spend time in a place, making note of its resident spirits and calling on the spirits of the land, roll+Wis. You will be granted a vision of significance to you, your allies, and the spirits around you. On a 10+ the vision will be clear and helpful to you. On a 7–9 the vision is unclear, its meaning murky. On a miss, the vision is upsetting, frightening, or traumatizing. The GM will describe it. Take -1 forward.` },
      { name: 'Barkskin', description: `So long as your feet touch the ground you have +1 armor.` },
      { name: 'Eyes of the Tiger', description: `When you mark an animal (with mud, dirt, or blood) you can see through that animal’s eyes as if they were your own, no matter what distance separates you. Only one animal at a time may be marked in this way.` },
      { name: 'Shed', description: `When you take damage while shapeshifted you may choose to revert to your natural form to negate the damage.` },
      { name: 'Thing-Talker', description: `You see the spirits in the sand, the sea and the stone. You may now apply your spirit tongue, shapeshifting and studied essence to inanimate natural objects (plants and rocks) or creatures made thereof, as well as animals. Thing-talker forms can be exact copies or can be mobile vaguely humanoid-shaped entities.` },
      { name: 'Formcrafter', description: `When you Shapeshifter choose a stat: you take +1 ongoing to rolls using that stat while shifted. The GM will choose a stat, too: you take -1 ongoing to rolls using that stat while shifted.` },
      { name: 'Elemental Mastery', description: `When you call on the primal spirits of fire, water, earth or air to perform a task for you roll+Wis. On a 10+ choose two. On a 7–9 choose one. On a miss, some catastrophe occurs as a result of your calling.

 - The effect you desire comes to pass
 - You avoid paying nature’s price 
 - You retain control` },
      { name: 'Balance', description: `When you deal damage, take 1 balance. When you touch someone and channel the spirits of life you may spend balance. For each balance spent, heal 1d4 HP.` },
    ],
    advancedMoves2: [
      { name: 'Embracing No Form', description: `When you Shapeshifter, roll 1d4 and add that total to your hold.` },
      { name: 'Doppelgänger’s Dance', description: `You are able to study the essence of specific individuals to take their exact form, including men, elves, or the like. Suppressing your tell is possible, but if you do, take -1 ongoing until you return to your own form.` },
      { name: 'Blood and Thunder', description: `When you are in an appropriate animal form (something dangerous) increase your damage to d10.`,
      replaces: 'red_of_tooth_and_claw' },
      { name: 'The Druid Sleep', description: `When you take this move, the next opportunity that you have safety and time to spend in an appropriate location, you may attune yourself to a new land. This effect occurs only once and the GM will tell you how long it will take and what cost you must pay. From then on, you are considered to be born of the soil in both lands.` },
      { name: 'World-Talker', description: `You see the patterns that make up the fabric of the world. You may now apply your spirit tongue, shapeshifter and studied essence moves to pure elements—fire, water, air and earth.`,
      requires: 'thing_talker' },
      { name: 'Stalker’s Sister', description: `Choose one move from the ranger class list.` },
      { name: 'Formshaper', description: `You may increase your armor by 1 or deal an additional +1d4 damage while in an animal form. Choose which when you Shapeshifter.`,
      requires: 'formcrafter' },
      { name: 'Chimera', description: `When you Shapeshifter, you may create a merged form of up to three different shapes. You may be a bear with the wings of an eagle and the head of a ram, for example. Each feature will grant you a different move to make. Your chimera form follows the same rules as shapeshifter otherwise.` },
      { name: 'Weather Weaver', description: `When you are under open skies when the sun rises the GM will ask you what the weather will be that day. Tell them whatever you like, it comes to pass.` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
• __________ smells more like prey than a hunter.
• The spirits spoke to me of a great danger that follows __________.
• I have showed __________ a secret rite of the Land.
• __________ has tasted my blood and I theirs. We are bound by it.`,
    startingEquipment: [
      'You carry some token of your land, describe it.',
      'Choose your defenses: Hide Armor (1 armor, 1 weight) OR Wooden Shield (+1 armor, 1 weight)',
      'Choose your armament: Shillelagh (close, 1 coins, 1 weight) OR Staff (close, two-handed, 1 coins, 1 weight) OR Spear (reach, thrown, near, 5 coins, 1 weight)',
      'Choose one: Adventuring Gear (5 uses, 20 coins, 1 weight) OR Poultices and Herbs (2 uses, slow, 10 coins, 1 weight) OR Halfling Pipeleaf (6 uses, 5 coins, 0 weight) OR 3 Antitoxins (10 coins, 0 weight)',
    ],
    notes: `Damage: d6 | HP: 6+CON | Load: 6+STR
Alignments — Chaotic: Destroy a symbol of civilization. | Good: Help something or someone grow. | Neutral: Eliminate an unnatural menace.`,
  },
  {
    name: 'Fighter',
    hpBase: 10,
    damageDie: 'd10',
    loadBase: '12+STR',
    alignments: ['Good', 'Neutral', 'Evil'],
    races: [
      { name: 'Dwarf', move: 'When you share a drink with someone, you may Parley with them using CON instead of CHA.' },
      { name: 'Elf', move: 'Choose one weapon—you can always treat weapons of that type as if they had the precise tag.' },
      { name: 'Halfling', move: 'When you Defy Danger and use your small size to your advantage, take +1.' },
      { name: 'Human', move: 'Once per battle you may reroll a single damage roll (yours or someone else’s).' },
    ],
    looks: [
      ['Hard Eyes', 'Dead Eyes', 'Eager Eyes'],
      ['Wild Hair', 'Shorn Hair', 'Battered Helm'],
      ['Calloused Skin', 'Tanned Skin', 'Scarred Skin'],
      ['Built Body', 'Lithe Body', 'Ravaged Body'],
    ],
    startingMoves: `BEND BARS, LIFT GATES
When you use pure strength to destroy an inanimate obstacle, roll+Str. On a 10+, choose 3. On a 7-9 choose 2.

 - It doesn’t take a very long time
 - Nothing of value is damaged
 - It doesn’t make an inordinate amount of noise
 - You can fix the thing again without a lot of effort

ARMORED
You ignore the clumsy tag on armor you wear.

SIGNATURE WEAPON
This is your weapon. There are many like it, but this one is yours. Your weapon is your best friend. It is your life. You master it as you master your life. Your weapon, without you, is useless. Without your weapon, you are useless. You must wield your weapon true.
Choose a base description, all are 2 weight:

 - Sword
 - Axe
 - Hammer
 - Spear
 - Flail
 - Fists
Choose the range that best fits your weapon:

 - Hand
 - Close
 - Reach
Choose two enhancements:

 - Hooks and spikes. +1 damage, but +1 weight.
 - Sharp. +2 piercing.
 - Perfectly weighted. Add precise.
 - Serrated edges. +1 damage.
 - Glows in the presence of one type of creature, your choice.
 - Huge. Add messy and forceful.
 - Versatile. Choose an additional range.
 - Well-crafted. -1 weight.
Choose a look:

 - Ancient
 - Unblemished
 - Ornate
 - Blood-stained
 - Sinister`,
    advancedMoves1: [
      { name: 'Merciless', description: `When you deal damage, deal +1d4 damage.` },
      { name: 'Heirloom', description: `When you consult the spirits that reside within your signature weapon, they will give you an insight relating to the current situation, and might ask you some questions in return, roll+CHA. On a 10+, the GM will give you good detail. On a 7-9, the GM will give you an impression.` },
      { name: 'Armor Mastery', description: `When you make your armor take the brunt of damage dealt to you, the damage is negated but you must reduce the armor value of your armor or shield (your choice) by 1. The value is reduced each time you make this choice. If the reduction leaves the item with 0 armor it is destroyed.` },
      { name: 'Improved Weapon', description: `Choose one extra enhancement for your signature weapon.` },
      { name: 'Seeing Red', description: `When you Discern Realities during combat, you take +1.` },
      { name: 'Interrogator', description: `When you Parley using threats of impending violence as leverage, you may use STR instead of CHA.` },
      { name: 'Scent of Blood', description: `When you Hack & Slash an enemy, your next attack against that same foe deals +1d4 damage.` },
      { name: 'Multiclass Dabbler', description: `Get one move from another class. Treat your level as one lower for choosing the move.` },
      { name: 'Iron Hide', description: `You gain +1 armor.` },
      { name: 'Blacksmith', description: `When you have access to a forge you can graft the magical powers of a weapon onto your signature weapon. This process destroys the magical weapon. Your signature weapon gains the magical powers of the destroyed weapon.` },
    ],
    advancedMoves2: [
      { name: 'Bloodthirsty', description: `When you deal damage, deal +1d8 damage.`,
      replaces: 'merciless' },
      { name: 'Armored Perfection', description: `When you choose to let your armor take the brunt of damage dealt to you, the damage is negated and you take +1 forward against the attacker, but you must reduce the armor value of your armor or shield (your choice) by 1. The value is reduced each time you make this choice. If the reduction leaves the item with 0 armor it is destroyed.`,
      replaces: 'armor_mastery' },
      { name: 'Evil Eye', description: `When you enter combat, roll+CHA. On a 10+, hold 2. On a 7-9, hold 1. Spend your hold to make eye contact with an NPC present, who freezes or flinches and can’t act until you break it off. On a 6-, your enemies immediately identify you as their biggest threat.`,
      requires: 'seeing_red' },
      { name: 'Taste of Blood', description: `When you Hack & Slash an enemy, your next attack against that same foe deals +1d8 damage.`,
      replaces: 'scent_of_blood' },
      { name: 'Multiclass Initiate', description: `Get one move from another class. Treat your level as one lower for choosing the move.`,
      requires: 'multiclass_dabbler' },
      { name: 'Steel Hide', description: `You gain +2 armor.`,
      replaces: 'iron_hide' },
      { name: 'Through Death’s Eyes', description: `When you go into battle, roll+WIS. On a 10+, name someone who will live and someone who will die. On a 7-9, name someone who will live or someone who will die. Name NPCs, not player characters. The GM will make your vision come true, if it’s even remotely possible. On a 6- you see your own death and consequently take -1 ongoing throughout the battle.` },
      { name: 'Eye for Weaponry', description: `When you look over an enemy’s weaponry, ask the GM how much damage they do.` },
      { name: 'Superior Warrior', description: `When you Hack & Slash on a 12+ you deal your damage, avoid their attack, and impress, dismay, or frighten your enemy.` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
• __________ owes me their life, whether they admit it or not.
• I have sworn to protect __________.
• I worry about the ability of __________ to survive in the dungeon.
• __________ is soft, but I will make them hard like me.`,
    startingEquipment: [
      'You carry your signature weapon and dungeon rations (ration, 5 uses, 3 coins, 1 weight).',
      'Choose your defenses: Chainmail (1 armor, worn, 10 coins, 1 weight) OR Scale Armor (2 armor, worn, 3 weight)',
      'Choose two: 2 Healing Potions (50 coins, 0 weight) OR Shield (+1 armor, 15 coins, 2 weight) OR Antitoxin (10 coins, 0 weight), dungeon rations (ration, 5 uses, 3 coins, 1 weight), and Poultices and Herbs (2 uses, slow, 10 coins, 1 weight) OR 22 coins',
    ],
    notes: `Damage: d10 | HP: 10+CON | Load: 12+STR
Alignments — Good: Defend those weaker than you. | Neutral: Defeat a worthy opponent. | Evil: Kill a defenseless or surrendered enemy.`,
  },
  {
    name: 'Paladin',
    hpBase: 10,
    damageDie: 'd10',
    loadBase: '12+STR',
    alignments: ['Lawful', 'Good'],
    races: [
      { name: 'Human', move: 'When you pray for guidance, even for a moment, and ask, “What here is evil?” the GM will tell you, honestly.' },
    ],
    looks: [
      ['Kind Eyes', 'Fiery Eyes', 'Glowing Eyes'],
      ['Helmet', 'Styled Hair', 'Bald'],
      ['Worn Holy Symbol Fancy Holy Symbol'],
      ['Fit Body', 'Bulky Body', 'Thin Body'],
    ],
    startingMoves: `LAY ON HANDS
When you touch someone, skin to skin, and pray for their well-being , roll+CHA. On a 10+ you heal 1d8 damage or remove one disease. On a 7–9, they are healed, but the damage or disease is transferred to you.

ARMORED
You ignore the clumsy tag on armor you wear.

I AM THE LAW
When you give an NPC an order based on your divine authority, roll+Cha. On a 7+, they choose one:

 - Do what you say
 - Back away cautiously, then flee
 - Attack you
On a 10+, you also take +1 forward against them. On a miss, they do as they please and you take -1 forward against them.

QUEST
When you dedicate yourself to a mission through prayer and ritual cleansing, state what you set out to do:

 - Slay __________, a great blight on the land
 - Defend __________ from the iniquities that beset them
 - Discover the truth of __________
Then choose up to two boons:

 - An unwavering sense of direction to __________.
 - Invulnerability to __________ (e.g., edged weapons, fire, enchantment, etc.)
 - A mark of divine authority
 - Senses that pierce lies
 - A voice that transcends language
 - A freedom from hunger, thirst, and sleep
The GM will then tell you what vow or vows is required of you to maintain your blessing:

 - Honor (forbidden: cowardly tactics and tricks)
 - Temperance (forbidden: gluttony in food, drink, and pleasure of the flesh)
 - Piety (required: observance of daily holy services)
 - Valor (forbidden: suffering an evil creature to live)
 - Truth (forbidden: lies)
 - Hospitality (required: comfort to those in need, no matter who they are)`,
    advancedMoves1: [
      { name: 'Divine Favor', description: `Dedicate yourself to a deity (name a new one or choose one that’s already been established). You gain the commune and cast a spell cleric moves. When you select this move, treat yourself as a cleric of level 1 for using spells. Every time you gain a level thereafter, increase your effective cleric level by 1.` },
      { name: 'Bloody Aegis', description: `When you take damage you can grit your teeth and accept the blow. If you do you take no damage but instead suffer a debility of your choice. If you already have all six debilities you can’t use this move.` },
      { name: 'Smite', description: `While on a quest you deal +1d4 damage.` },
      { name: 'Exterminatus', description: `When you speak aloud your promise to defeat an enemy, you deal +2d4 damage against that enemy and -4 damage against anyone else. This effect lasts until the enemy is defeated. If you fail to defeat the enemy or give up the fight, you can admit your failure, but the effect continues until you find a way to redeem yourself.` },
      { name: 'Charge!', description: `When you lead the charge into combat, those you lead take +1 forward.` },
      { name: 'Staunch Defender', description: `When you Defend you always get +1 hold, even on a 6-.` },
      { name: 'Setup Strike', description: `When you Hack & Slash, choose an ally. Their next attack against your target does +1d4 damage.` },
      { name: 'Holy Protection', description: `You get +1 armor while on a quest.` },
      { name: 'Voice of Authority', description: `Take +1 to order hirelings.` },
      { name: 'Hospitaller', description: `When you heal an ally, you heal +1d8 damage.` },
    ],
    advancedMoves2: [
      { name: 'Evidence of Faith', description: `When you see divine magic as it happens, you can ask the GM which deity granted the spell and its effects. Take +1 when acting on the answers.`,
      requires: 'divine_favor' },
      { name: 'Holy Smite', description: `While on a quest you deal +1d8 damage.`,
      replaces: 'smite' },
      { name: 'Ever Onward', description: `When you lead the charge into combat, those you lead take +1 forward and +2 armor forward.`,
      replaces: 'charge' },
      { name: 'Impervious Defender', description: `When you Defend you always get +1 hold, even on a 6-. When you get a 12+ to defend instead of getting hold the nearest attacking creature is stymied giving you a clear advantage, the GM will describe it.`,
      replaces: 'staunch_defender' },
      { name: 'Tandem Strike', description: `When you Hack & Slash, choose an ally. Their next attack against your target does +1d4 damage and they take +1 forward against them.`,
      replaces: 'setup_strike' },
      { name: 'Divine Protection', description: `You get +2 armor while on a quest.`,
      replaces: 'holy_protection' },
      { name: 'Divine Authority', description: `Take +1 to order hirelings. When you roll a 12+ the hireling transcends their moment of fear and doubt and carries out your order with particular effectiveness or efficiency.`,
      replaces: 'voice_of_authority' },
      { name: 'Perfect Hospitaller', description: `When you heal an ally, you heal +2d8 damage.`,
      replaces: 'hospitaller' },
      { name: 'Indomitable', description: `When you suffer a debility (even through Bloody Aegis) take +1 forward against whatever caused it.` },
      { name: 'Perfect Knight', description: `When you Quest you choose three boons instead of two.` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
• __________’s misguided behavior endangers their very soul!
• __________ has stood by me in battle and can be trusted completely.
• I respect the beliefs of __________ but hope they will someday see the true way.
• __________ is a brave soul, I have much to learn from them.`,
    startingEquipment: [
      'You start with dungeon rations (ration, 5 uses, 3 coins, 1 weight), Scale Armor (2 armor, worn, 3 weight), and some mark of faith, describe it (0 weight).',
      'Choose your weapon: Halberd (reach, +1 damage, two-handed, 9 coins, 2 weight) OR Long Sword (close, +1 damage, 15 coins, 2 weight)',
      'Choose one: Adventuring Gear (5 uses, 20 coins, 1 weight) OR Dungeon rations (ration, 5 uses, 3 coins, 1 weight) and Healing Potion (50 coins, 0 weight)',
    ],
    notes: `Damage: d10 | HP: 10+CON | Load: 12+STR
Alignments — Lawful: Deny mercy to a criminal or unbeliever. | Good: Endanger yourself to protect someone weaker than you.`,
  },
  {
    name: 'Ranger',
    hpBase: 8,
    damageDie: 'd8',
    loadBase: '11+STR',
    alignments: ['Chaotic', 'Good', 'Neutral'],
    races: [
      { name: 'Elf', move: 'When you Undertake a Perilous Journey through wilderness whatever job you take you succeed as if you rolled a 10+.' },
      { name: 'Human', move: 'When you Make Camp in a dungeon or city, you don’t need to consume a ration.' },
    ],
    looks: [
      ['Wild Eyes', 'Sharp Eyes', 'Animal Eyes'],
      ['Hooded Head', 'Wild Hair', 'Bald'],
      ['Cape', 'Camouflage', 'Traveling Clothes'],
      ['Lithe Body', 'Wild Body', 'Sharp Body'],
    ],
    startingMoves: `HUNT AND TRACK
When you follow a trail of clues left behind by passing creatures, roll+WIS. On a 7+, you follow the creature’s trail until there’s a significant change in its direction or mode of travel. On a 10+, you also choose 1:

 - Gain a useful bit of information about your quarry, the GM will tell you what
 - Determine what caused the trail to end

CALLED SHOT
When you attack a defenseless or surprised enemy at range, you can choose to deal your damage or name your target and roll+DEX.

 - Head 10+: As 7–9, plus your damage 7-9: They do nothing but stand and drool for a few moments.
 - Arms 10+: As 7-9, plus your damage 7-9: They drop anything they’re holding.
 - Legs 10+: As 7-9, plus your damage 7-9: They’re hobbled and slow moving.

ANIMAL COMPANION
You have a supernatural connection with a loyal animal. You can’t talk to it per se but it always acts as you wish it to. Name your animal companion and choose a species:
Wolf, cougar, bear, eagle, dog, hawk, cat, owl, pigeon, rat, mule
Choose a base:

 - Ferocity +2, Cunning +1, 1 Armor, Instinct +1
 - Ferocity +2, Cunning +2, 0 Armor, Instinct +1
 - Ferocity +1, Cunning +2, 1 Armor, Instinct +1
 - Ferocity +3, Cunning +1, 1 Armor, Instinct +2
Choose as many strengths as its ferocity:
Fast, burly, huge, calm, adaptable, quick reflexes, tireless, camouflage, ferocious, intimidating, keen senses, stealthy
Your animal companion is trained to fight humanoids. Choose as many additional trainings as its cunning:
Hunt, search, scout, guard, fight monsters, perform, labor, travel
Choose as many weaknesses as its instinct:
Flighty, savage, slow, broken, frightening, forgetful, stubborn, lame

COMMAND
When you work with your animal companion on something it’s trained in…

 - …and you attack the same target, add its ferocity to your damage
 - …and you track, add its cunning to your roll
 - …and you take damage, add its armor to your armor
 - …and you Discern Realities, add its cunning to your roll
 - …and you parley, add its cunning to your roll
 - …and someone interferes with you, add its instinct to their roll`,
    advancedMoves1: [
      { name: 'Half-Elven', description: `Somewhere in your lineage lies mixed blood and it begins to show its presence. You gain the elf starting move if you took the human one at character creation or vice versa.` },
      { name: 'Wild Empathy', description: `You can speak with and understand animals.` },
      { name: 'Familiar Prey', description: `When you Spout Lore about a monster you use WIS instead of INT.` },
      { name: 'Viper’s Strike', description: `When you strike an enemy with two weapons at once, add an extra 1d4 damage for your off-hand strike.` },
      { name: 'Camouflage', description: `When you keep still in natural surroundings, enemies never spot you until you make a movement.` },
      { name: 'Man’s Best Friend', description: `When you allow your animal companion to take a blow that was meant for you, the damage is negated and your animal companion’s ferocity becomes 0. If its ferocity is already 0 you can’t use this ability. When you have a few hours of rest with your animal companion its ferocity returns to normal.` },
      { name: 'Blot Out the Sun', description: `When you Volley you may spend extra ammo before rolling. For each point of ammo spent you may choose an extra target. Roll once and apply damage to all targets.` },
      { name: 'Well-Trained', description: `Choose another training for your animal companion.` },
      { name: 'God Amidst the Wastes', description: `Dedicate yourself to a deity (name a new one or choose one that’s already been established). You gain the Commune and Cast a Spell cleric moves. When you select this move, treat yourself as a cleric of level 1 for using spells. Every time you gain a level thereafter, increase your effective cleric level by 1.` },
      { name: 'Follow Me', description: `When you Undertake a Perilous Journey you can take two roles. You make a separate roll for each.` },
      { name: 'A Safe Place', description: `When you set the watch for the night, everyone takes +1 to Take Watch.` },
    ],
    advancedMoves2: [
      { name: 'Wild Speech', description: `You can speak with and understand any non-magical, non-planar creature.`,
      replaces: 'wild_empathy' },
      { name: 'Hunter’s Prey', description: `When you Spout Lore about a monster you use WIS instead of INT. On a 12+, in addition to the normal effects, you get to ask the GM any one question about the subject.`,
      replaces: 'familiar_prey' },
      { name: 'Viper’s Fangs', description: `When you strike an enemy with two weapons at once, add an extra 1d8 damage for your off-hand strike.`,
      replaces: 'vipers_strike' },
      { name: 'Smaug’s Belly', description: `When you know your target’s weakest point your arrows have 2 piercing.` },
      { name: 'Strider', description: `When you Undertake a Perilous Journey you can take two roles. Roll twice and use the better result for both roles.`,
      replaces: 'follow_me' },
      { name: 'A Safer Place', description: `When you set the watch for the night everyone takes +1 to Take Watch. After a night in camp when you set the watch everyone takes +1 forward.`,
      replaces: 'a_safe_place' },
      { name: 'Observant', description: `When you Hunt and Track, on a hit you may also ask one question about the creature you are tracking from the Discern Realities list for free.` },
      { name: 'Special Trick', description: `Choose a move from another class. So long as you are working with your animal companion you have access to that move.` },
      { name: 'Unnatural Ally', description: `Your animal companion is a monster, not an animal. Describe it. Give it +2 ferocity and +1 instinct, plus a new training.` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
(No bonds listed in SRD)`,
    startingEquipment: [
      'You start with dungeon rations (ration, 5 uses, 3 coins, 1 weight), Leather Armor (1 armor, worn, 10 coins, 1 weight), and a Bundle of Arrows (3 ammo, 1 coins, 1 weight).',
      'Choose your armament: Hunter\'s bow (near, far, 1 weight) and Short Sword (close, 8 coins, 1 weight) OR Hunter\'s bow (near, far, 1 weight) and Spear (reach, thrown, near, 5 coins, 1 weight)',
      'Choose one: Adventuring Gear (5 uses, 20 coins, 1 weight) and dungeon rations (ration, 5 uses, 3 coins, 1 weight) OR Adventuring Gear (5 uses, 20 coins, 1 weight) and Bundle of Arrows (3 ammo, 1 coins, 1 weight)',
    ],
    notes: `Damage: d8 | HP: 8+CON | Load: 11+STR
Alignments — Chaotic: Free someone from literal or figurative bonds. | Good: Endanger yourself to combat an unnatural threat. | Neutral: Help an animal or spirit of the wild.`,
  },
  {
    name: 'Thief',
    hpBase: 6,
    damageDie: 'd8',
    loadBase: '9+STR',
    alignments: ['Chaotic', 'Neutral', 'Evil'],
    races: [
      { name: 'Halfling', move: 'When you attack with a ranged weapon, deal +2 damage.' },
      { name: 'Human', move: 'You are a professional. When you Spout Lore or Discern Realities about criminal activities, take +1.' },
    ],
    looks: [
      ['Shifty Eyes Criminal Eyes'],
      ['Hooded Head', 'Messy Hair', 'Cropped Hair'],
      ['Dark Clothes', 'Fancy Clothes', 'Common Clothes'],
      ['Lithe Body', 'Knobby Body', 'Flabby Body'],
    ],
    startingMoves: `TRAP EXPERT
When you spend a moment to survey a dangerous area, roll+DEX. On a 10+, hold 3. On a 7–9, hold 1. Spend your hold as you walk through the area to ask these questions:

 - Is there a trap here and if so, what activates it?
 - What does the trap do when activated?
 - What else is hidden here?

TRICKS OF THE TRADE
When you pick locks or pockets or disable traps, roll+DEX. On a 10+, you do it, no problem. On a 7–9, you still do it, but the GM will offer you two options between suspicion, danger, or cost.

BACKSTAB
When you attack a surprised or defenseless enemy with a melee weapon, you can choose to deal your damage or roll+DEX. On a 10+ choose two. On a 7–9 choose one.

 - You don’t get into melee with them
 - You deal your damage+1d6
 - You create an advantage, +1 forward to you or an ally acting on it
 - Reduce their armor by 1 until they repair it

FLEXIBLE MORALS
When someone tries to detect your alignment you can tell them any alignment you like.

POISONER
You’ve mastered the care and use of a poison. Choose a poison from the list below; that poison is no longer dangerous for you to use. You also start with three uses of the poison you choose. Whenever you have time to gather materials and a safe place to brew you can make three uses of the poison you choose for free. Note that some poisons are applied, meaning you have to carefully apply it to the target or something they eat or drink. Touch poisons just need to touch the target, they can even be used on the blade of a weapon.

 - Oil of Tagit (applied): The target falls into a light sleep
 - Bloodweed (touch): The target deals -1d4 damage ongoing until cured
 - Goldenroot (applied): The target treats the next creature they see as a trusted ally, until proved otherwise
 - Serpent’s Tears (touch): Anyone dealing damage to the target rolls twice and takes the better result.`,
    advancedMoves1: [
      { name: 'Cheap Shot', description: `When using a precise or hand weapon, your Backstab deals an extra +1d6 damage.` },
      { name: 'Cautious', description: `When you use Trap Expert you always get +1 hold, even on a 6-.` },
      { name: 'Wealth and Taste', description: `When you make a show of flashing around your most valuable possession, choose someone present. They will do anything they can to obtain your item or one like it.` },
      { name: 'Shoot First', description: `You’re never caught by surprise. When an enemy would get the drop on you, you get to act first instead.` },
      { name: 'Poison Master', description: `After you’ve used a poison once it’s no longer dangerous for you to use.` },
      { name: 'Envenom', description: `You can apply even complex poisons with a pinprick. When you apply a poison that’s not dangerous for you to use to your weapon it’s touch instead of applied.` },
      { name: 'Brewer', description: `When you have time to gather materials and a safe place to brew you can create three doses of any one poison you’ve used before.` },
      { name: 'Underdog', description: `When you’re outnumbered, you have +1 armor.` },
      { name: 'Connections', description: `When you put out word to the criminal underbelly about something you want or need, roll+CHA. On a 10+, someone has it, just for you. On a 7–9, you’ll have to settle for something close or it comes with strings attached, your call.` },
    ],
    advancedMoves2: [
      { name: 'Dirty Fighter', description: `When using a precise or hand weapon, your backstab deals an extra +1d8 damage and all other attacks deal +1d4 damage.`,
      replaces: 'cheap_shot' },
      { name: 'Extremely Cautious', description: `When you use Trap Expert you always get +1 hold, even on a 6-. On a 12+ you get 3 hold and the next time you come near a trap the GM will immediately tell you what it does, what triggers it, who set it, and how you can use it to your advantage.`,
      replaces: 'cautious' },
      { name: 'Alchemist', description: `When you have you have time to gather materials and a safe place to brew you can create three doses of any poison you’ve used before. Alternately you can describe the effects of a poison you’d like to create. The GM will tell you that you can create it, but with one or more caveats:

 - It will only work under specific circumstances
 - The best you can manage is a weaker version
 - It’ll take a while to take effect
 - It’ll have obvious side effects`,
      replaces: 'brewer' },
      { name: 'Serious Underdog', description: `You have +1 armor. When you’re outnumbered, you have +2 armor instead.`,
      replaces: 'underdog' },
      { name: 'Evasion', description: `When you Defy Danger on a 12+, you transcend the danger. You not only do what you set out to, but the GM will offer you a better outcome, true beauty, or a moment of grace.` },
      { name: 'Strong Arm, True Aim', description: `You can throw any melee weapon, using it to Volley. A thrown melee weapon is gone; you can never choose to reduce ammo on a 7–9.` },
      { name: 'Escape Route', description: `When you’re in too deep and need a way out, name your escape route and roll+DEX. On a 10+ you’re gone. On a 7–9 you can stay or go, but if you go it costs you: leave something behind or take something with you, the GM will tell you what.` },
      { name: 'Disguise', description: `When you have time and materials you can create a disguise that will fool anyone into thinking you’re another creature of about the same size and shape. Your actions can give you away but your appearance won’t.` },
      { name: 'Heist', description: `When you take time to make a plan to steal something, name the thing you want to steal and ask the GM these questions. When acting on the answers you and your allies take +1 forward.

 - Who will notice it’s missing?
 - What’s its most powerful defense?
 - Who will come after it?
 - Who else wants it?` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
• I stole something from __________.
• __________ has my back when things go wrong.
• __________ knows incriminating details about me.
• __________ and I have a con running.`,
    startingEquipment: [
      'You start with dungeon rations (ration, 5 uses, 3 coins, 1 weight), Leather Armor (1 armor, worn, 10 coins, 1 weight), 3 uses of your chosen poison, and 10 coins.',
      'Choose your arms: Dagger (hand, 2 coins, 1 weight) and Short Sword (close, 8 coins, 1 weight) OR Rapier (close, Precise, 25 coins, 1 weight)',
      'Choose a ranged weapon: 3 Throwing Daggers (thrown, near, 1 coins, 0 weight) OR Ragged Bow (near, 15 coins, 2 weight) and Bundle of Arrows (3 ammo, 1 coins, 1 weight)',
      'Choose one: Adventuring Gear (5 uses, 20 coins, 1 weight) OR Healing Potion (50 coins, 0 weight)',
    ],
    notes: `Damage: d8 | HP: 6+CON | Load: 9+STR
Alignments — Chaotic: Leap into danger without a plan. | Neutral: Avoid detection or infiltrate a location. | Evil: Shift danger or blame from yourself to someone else.`,
  },
  {
    name: 'Wizard',
    hpBase: 4,
    damageDie: 'd4',
    loadBase: '7+STR',
    alignments: ['Good', 'Neutral', 'Evil'],
    races: [
      { name: 'Elf', move: 'Magic is as natural as breath to you. Detect Magic is a cantrip for you.' },
      { name: 'Human', move: 'Choose one Cleric spell. You can cast it as if it was a Wizard spell.' },
    ],
    looks: [
      ['Haunted Eyes', 'Sharp Eyes', 'Crazy Eyes'],
      ['Styled Hair', 'Wild Hair', 'Pointed Hat'],
      ['Worn Robes', 'Stylish Robes', 'Strange Robes'],
      ['Pudgy Body', 'Creepy Body', 'Thin Body'],
    ],
    startingMoves: `SPELLBOOK
You have mastered several spells and inscribed them in your spellbook. You start out with three first level spells in your spellbook as well as the cantrips. Whenever you gain a level, you add a new spell of your level or lower to your spellbook. You spellbook is 1 weight.

PREPARE SPELLS
When you spend uninterrupted time (an hour or so) in quiet contemplation of your spellbook, you:
Lose any spells you already have prepared

Prepare new spells of your choice from your spellbook whose total levels don’t exceed your own level+1.

Prepare your cantrips which never count against your limit.
 - Lose any spells you already have prepared
 - Prepare new spells of your choice from your spellbook whose total levels don’t exceed your own level+1.
 - Prepare your cantrips which never count against your limit.

CAST A SPELL
When you release a spell you’ve prepared, roll+Int. On a 10+, the spell is successfully cast and you do not forget the spell—you may cast it again later. On a 7-9, the spell is cast, but choose one:
You draw unwelcome attention or put yourself in a spot. The GM will tell you how.

The spell disturbs the fabric of reality as it is cast—take -1 ongoing to cast a spell until the next time you Prepare Spells.

After it is cast, the spell is forgotten. You cannot cast the spell again until you prepare spells.
 - You draw unwelcome attention or put yourself in a spot. The GM will tell you how.
 - The spell disturbs the fabric of reality as it is cast—take -1 ongoing to cast a spell until the next time you Prepare Spells.
 - After it is cast, the spell is forgotten. You cannot cast the spell again until you prepare spells.
Note that maintaining spells with ongoing effects will sometimes cause a penalty to your roll to cast a spell.

SPELL DEFENSE
You may end any ongoing spell immediately and use the energy of its dissipation to deflect an oncoming attack. The spell ends and you subtract its level from the damage done to you.

RITUAL
When you draw on a place of power to create a magical effect, tell the GM what you’re trying to achieve. Ritual effects are always possible, but the GM will give you one to four of the following conditions:
It’s going to take days/weeks/months

First you must __________

You’ll need help from __________

It will require a lot of money

The best you can do is a lesser version, unreliable and limited

You and your allies will risk danger from __________

You’ll have to disenchant __________ to do it
 - It’s going to take days/weeks/months
 - First you must __________
 - You’ll need help from __________
 - It will require a lot of money
 - The best you can do is a lesser version, unreliable and limited
 - You and your allies will risk danger from __________
 - You’ll have to disenchant __________ to do it`,
    advancedMoves1: [
      { name: 'Prodigy', description: `Choose a spell. You prepare that spell as if it were one level lower.` },
      { name: 'Empowered Magic', description: `When you Cast a Spell, on a 10+ you have the option of choosing from the 7-9 list. If you do, you may choose one of these as well:
The spell’s effects are maximized

The spell’s targets are doubled
 - The spell’s effects are maximized
 - The spell’s targets are doubled` },
      { name: 'Fount of Knowledge', description: `When you Spout Lore about something no one else has any clue about, take +1.` },
      { name: 'Know-It-All', description: `When another player’s character comes to you for advice and you tell them what you think is best, they get +1 forward when following your advice and you mark experience if they do.` },
      { name: 'Expanded Spellbook', description: `Add a new spell from the spell list of any class to your spellbook.` },
      { name: 'Enchanter', description: `When you have time and safety with a magic item you may ask the GM what it does, the GM will answer you truthfully.` },
      { name: 'Logical', description: `When you use strict deduction to analyze your surroundings, you can Discern Realities with INT instead of WIS.` },
      { name: 'Arcane Ward', description: `As long as you have at least one prepared spell of first level or higher, you have +2 armor.` },
      { name: 'Counterspell', description: `When you attempt to counter an arcane spell that will otherwise affect you, stake one of your prepared spells on the defense and roll+Int. On a 10+, the spell is countered and has no effect on you. On a 7-9, the spell is countered and you forget the spell you staked. Your counterspell protects only you; if the countered spell has other targets they get its effects.` },
      { name: 'Quick Study', description: `When you see the effects of an arcane spell, ask the GM the name of the spell and its effects. You take +1 when acting on the answers.` },
    ],
    advancedMoves2: [
      { name: 'Master', description: `Choose one spell in addition to the one you picked for prodigy. You prepare that spell as if it were one level lower.`,
      requires: 'prodigy' },
      { name: 'Greater Empowered Magic', description: `When you Cast a Spell, on a 10-11 you have the option of choosing from the 7-9 list. If you do, you may choose one of these effects as well. On a 12+ you get to choose one of these effects for free:
The spell’s effects are doubled

The spell’s targets are doubled
 - The spell’s effects are doubled
 - The spell’s targets are doubled`,
      replaces: 'empowered_magic' },
      { name: 'Enchanter’s Soul', description: `When you have time and safety with a magic item in a place of power you can empower that item so that the next time you use it its effects are amplified, the GM will tell you exactly how.`,
      requires: 'enchanter' },
      { name: 'Highly Logical', description: `When you use strict deduction to analyze your surroundings, you can Discern Realities with Int instead of Wis. On a 12+ you get to ask the GM any three questions, not limited by the list.`,
      replaces: 'logical' },
      { name: 'Arcane Armor', description: `As long as you have at least one prepared spell of first level or higher, you have +4 armor.`,
      replaces: 'arcane_ward' },
      { name: 'Protective Counter', description: `When an ally within sight of you is affected by an arcane spell, you can counter it as if it affected you. If the spell affects multiple allies you must counter for each ally separately.`,
      requires: 'counterspell' },
      { name: 'Ethereal Tether', description: `When you have time with a willing or helpless subject you can craft an ethereal tether with them. You perceive what they perceive and can Discern Realities about someone tethered to you or their surroundings no matter the distance. Someone willingly tethered to you can communicate with you over the tether as if you were in the room with them.` },
      { name: 'Mystical Puppet Strings', description: `When you use magic to control a person’s actions they have no memory of what you had them do and bear you no ill will.` },
      { name: 'Spell Augmentation', description: `When you deal damage to a creature you can shunt a spell’s energy into them—end one of your ongoing spells and add the spell’s level to the damage dealt.` },
      { name: 'Self-Powered', description: `When you have time, arcane materials, and a safe space, you can create your own place of power. Describe to the GM what kind of power it is and how you’re binding it to this place, the GM will tell you one kind of creature that will have an interest in your workings.` },
    ],
    bonds: `Fill in the blanks for each bond that applies:
• __________ will play an important role in the events to come. I have foreseen it!
• __________ is keeping an important secret from me.
• __________ is woefully misinformed about the world; I will teach them all that I can.`,
    startingEquipment: [
      'You start with your spellbook (1 weight) and dungeon rations (ration, 5 uses, 3 coins, 1 weight).',
      'Choose your defenses: Leather Armor (1 armor, worn, 10 coins, 1 weight) OR Bag of Books (5 uses, 10 coins, 2 weight) and 3 Healing Potion (50 coins, 0 weight)',
      'Choose your weapon: Dagger (hand, 2 coins, 1 weight) OR Staff (close, two-handed, 1 coins, 1 weight)',
      'Choose one: Healing Potion (50 coins, 0 weight) OR 3 Antitoxins (10 coins, 0 weight)',
    ],
    notes: `Damage: d4 | HP: 4+CON | Load: 7+STR
Alignments — Good: Use magic to directly aid another. | Neutral: Discover something about a magical mystery. | Evil: Use magic to cause terror and fear.`,
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
