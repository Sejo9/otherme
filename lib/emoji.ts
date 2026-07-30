"use client";

/**
 * A small emoji picker dataset.
 *
 * Deliberately not `emoji-mart`: that ships roughly a megabyte of data and a
 * whole component library to do what a couple of hundred hand-picked glyphs
 * and a keyword string can. Rendering is left to the system emoji font, which
 * is what every native picker does anyway.
 *
 * Format is `"<emoji> <keywords>"`, comma separated. Emoji sequences never
 * contain commas, so splitting is safe.
 */
type Category = { id: string; icon: string; label: string; raw: string };

const CATEGORIES: Category[] = [
  {
    id: "smileys",
    icon: "😀",
    label: "Smileys",
    raw: `😀 grin happy,😃 smile happy,😄 laugh happy,😁 beam grin,😆 laugh squint,😅 sweat laugh,
🤣 rofl laughing,😂 tears joy cry laugh,🙂 slight smile,🙃 upside down silly,🫠 melting,😉 wink,
😊 blush smile shy,😇 halo angel innocent,🥲 happy tears,🥹 holding back tears proud,
😌 relieved content,😔 sad down,😞 disappointed,😟 worried,🙁 frown,☹️ sad,😣 persevere,
😖 confounded,😫 tired,😩 weary,🥺 pleading puppy,😢 cry sad,😭 sobbing crying,😤 triumph huff,
😠 angry,😡 rage mad,🤬 swearing cursing,🤯 mind blown shocked,😳 flushed embarrassed,
🥵 hot,🥶 cold,😱 scream fear,😨 fearful,😰 anxious,😥 sad relieved,😓 sweat,🤗 hug,
🤔 thinking hmm,🤭 oops giggle,🤫 shush quiet,🫢 gasp,😐 neutral,😑 expressionless,
😶 no mouth speechless,🙄 eyeroll,😏 smirk,😒 unamused,🥱 yawn bored,😴 sleeping,🤤 drool,
😪 sleepy,🤒 sick,🤕 hurt,🤢 nauseated,🤮 vomit,🥴 woozy drunk,😵 dizzy,🤠 cowboy,
🥳 party celebrate,😎 cool sunglasses,🤓 nerd,🧐 monocle,🤪 zany silly,😜 tongue wink,
😝 tongue squint,😛 tongue,🫡 salute,🤨 raised eyebrow,😬 grimace awkward`,
  },
  {
    id: "love",
    icon: "❤️",
    label: "Love",
    raw: `❤️ red heart love,🧡 orange heart,💛 yellow heart,💚 green heart,💙 blue heart,
💜 purple heart,🖤 black heart,🤍 white heart,🤎 brown heart,🩷 pink heart,🩵 light blue heart,
🩶 grey heart,❤️‍🔥 heart fire burning,❤️‍🩹 mending heart,💔 broken heart,💕 two hearts,
💞 revolving hearts,💓 beating heart,💗 growing heart,💖 sparkling heart,💘 heart arrow cupid,
💝 heart ribbon gift,💟 heart decoration,😍 heart eyes love,🥰 smiling hearts adore,
😘 kiss blow,😗 kissing,😙 kissing smile,😚 kissing closed,💋 kiss lips,👨‍❤️‍👨 couple,
💑 couple heart,💏 kiss couple,👩‍❤️‍👨 couple heart,🫶 heart hands,🤟 love you gesture,
💐 bouquet flowers,🌹 rose,🌷 tulip,💍 ring engagement,💌 love letter,🕯️ candle,
🥂 cheers toast,🍾 champagne,🎁 gift present,🫂 hug embrace`,
  },
  {
    id: "gestures",
    icon: "👍",
    label: "Gestures",
    raw: `👍 thumbs up yes,👎 thumbs down no,👌 ok perfect,🤌 pinched italian,🤏 pinch small,
✌️ peace victory,🤞 fingers crossed hope,🫰 finger heart,🤙 call me shaka,👈 point left,
👉 point right,👆 point up,👇 point down,☝️ index up,✋ raised hand stop,🤚 back hand,
🖐️ splayed hand,🖖 vulcan,👋 wave hello bye,🤝 handshake deal,🙏 pray thanks please,
✍️ writing,💅 nail polish,🤳 selfie,💪 muscle strong,🦾 mechanical arm,🙌 raised hands praise,
👏 clap applause,🫡 salute,🤷 shrug,🤦 facepalm,💁 tipping hand,🙋 raising hand,
🙆 ok gesture,🙅 no gesture,💃 dancing woman,🕺 dancing man,🕴️ levitating,🚶 walking,
🏃 running,🧎 kneeling,🛌 in bed sleeping,👀 eyes look,👁️ eye,🧠 brain,🦵 leg,🦶 foot`,
  },
  {
    id: "animals",
    icon: "🐻",
    label: "Nature",
    raw: `🐶 dog puppy,🐱 cat kitten,🐭 mouse,🐹 hamster,🐰 rabbit bunny,🦊 fox,🐻 bear,
🐼 panda,🐨 koala,🐯 tiger,🦁 lion,🐮 cow,🐷 pig,🐸 frog,🐵 monkey,🙈 see no evil,
🙉 hear no evil,🙊 speak no evil,🐔 chicken,🐧 penguin,🐦 bird,🐤 chick,🦆 duck,🦉 owl,
🦇 bat,🐺 wolf,🐗 boar,🐴 horse,🦄 unicorn,🐝 bee,🐛 caterpillar,🦋 butterfly,🐌 snail,
🐢 turtle,🐍 snake,🐙 octopus,🦑 squid,🦐 shrimp,🐠 fish,🐬 dolphin,🐳 whale,🦈 shark,
🐊 crocodile,🐘 elephant,🦒 giraffe,🦓 zebra,🐑 sheep,🐕 dog,🌸 blossom flower,🌺 hibiscus,
🌻 sunflower,🌼 daisy,🌱 seedling,🌲 tree,🌳 tree,🌴 palm,🍀 clover luck,🍁 maple leaf,
🍂 fallen leaves autumn,🌊 wave ocean,🌙 moon night,⭐ star,🌟 glowing star,✨ sparkles,
☀️ sun,🌈 rainbow,☁️ cloud,🌧️ rain,⛈️ storm,❄️ snow,🔥 fire lit,💧 droplet,🌍 earth world`,
  },
  {
    id: "food",
    icon: "🍕",
    label: "Food",
    raw: `🍏 apple,🍌 banana,🍇 grapes,🍓 strawberry,🫐 blueberries,🍒 cherries,🍑 peach,
🥭 mango,🍍 pineapple,🥑 avocado,🍅 tomato,🥕 carrot,🌽 corn,🥦 broccoli,🧄 garlic,
🍞 bread,🥐 croissant,🥖 baguette,🧇 waffle,🥞 pancakes,🧀 cheese,🍳 egg cooking,🥓 bacon,
🍔 burger,🍟 fries,🍕 pizza,🌭 hotdog,🥪 sandwich,🌮 taco,🌯 burrito,🥗 salad,🍝 pasta,
🍜 ramen noodles,🍲 stew,🍛 curry,🍣 sushi,🍤 shrimp fried,🍚 rice,🥟 dumpling,🍦 ice cream,
🍩 doughnut,🍪 cookie,🎂 birthday cake,🍰 cake slice,🧁 cupcake,🍫 chocolate,🍬 candy,
🍿 popcorn,🧂 salt,☕ coffee,🍵 tea,🧊 ice,🥤 soft drink,🧋 bubble tea,🍺 beer,🍻 beers,
🍷 wine,🥃 whisky,🍸 cocktail,🍹 tropical drink,🥛 milk,🍼 bottle,🥄 spoon,🍴 fork knife,
🍽️ plate dinner,🥡 takeout`,
  },
  {
    id: "activity",
    icon: "⚽",
    label: "Activity",
    raw: `⚽ football soccer,🏀 basketball,🏈 american football,⚾ baseball,🎾 tennis,
🏐 volleyball,🏉 rugby,🎱 pool billiards,🏓 ping pong,🏸 badminton,🥊 boxing,🥋 martial arts,
⛳ golf,🎣 fishing,🏊 swimming,🏄 surfing,🚴 cycling,🧘 yoga meditate,🏋️ weights gym,
🤸 gymnastics,⛷️ ski,🏂 snowboard,🎿 skis,🏆 trophy win,🥇 first medal,🎖️ medal,
🎯 bullseye target,🎲 dice,🧩 puzzle,♟️ chess,🎮 gaming controller,🕹️ joystick,🎰 slot machine,
🎨 art paint,🎭 theatre,🎬 film movie,🎤 microphone sing,🎧 headphones music,🎵 music note,
🎶 music notes,🎹 piano,🎸 guitar,🎺 trumpet,🥁 drum,📷 camera photo,📸 camera flash,
🎉 party tada,🎊 confetti,🎈 balloon,🎃 pumpkin,🎄 christmas tree,🧨 firecracker,🎆 fireworks`,
  },
  {
    id: "travel",
    icon: "✈️",
    label: "Travel",
    raw: `🚗 car,🚕 taxi,🚌 bus,🚎 trolley,🏎️ race car,🚓 police car,🚑 ambulance,🚒 fire engine,
🚚 truck,🚲 bicycle,🛴 scooter,🏍️ motorcycle,✈️ plane flight,🛫 takeoff,🛬 landing,
🚀 rocket,🛸 ufo,🚁 helicopter,⛵ sailboat,🚤 speedboat,🛳️ ship cruise,⚓ anchor,🚂 train,
🚆 train,🚊 tram,🚇 metro,🗺️ map,🧭 compass,🏔️ mountain,🌋 volcano,🏕️ camping,🏖️ beach,
🏝️ island,🏜️ desert,🏡 house home,🏠 house,🏢 office building,🏨 hotel,🏰 castle,
🗼 tower,🗽 statue liberty,⛲ fountain,🌉 bridge night,🌃 night city,🌆 sunset city,
🌇 sunset,🌌 milky way stars,🎡 ferris wheel,🎢 roller coaster,🧳 luggage suitcase,
🛎️ bell hotel,🗓️ calendar,🕰️ clock`,
  },
  {
    id: "objects",
    icon: "💡",
    label: "Objects",
    raw: `📱 phone mobile,💻 laptop computer,⌨️ keyboard,🖥️ desktop,🖨️ printer,🖱️ mouse,
💾 floppy save,💡 lightbulb idea,🔋 battery,🔌 plug,📷 camera,📺 tv television,📻 radio,
☎️ telephone,📞 phone call,📟 pager,📠 fax,🔍 search magnify,🔎 magnify,🔒 lock,🔓 unlock,
🔑 key,🗝️ old key,🔨 hammer,🪛 screwdriver,🔧 wrench,⚙️ gear settings,🧲 magnet,
💊 pill medicine,🩹 bandage plaster,🧬 dna,🔬 microscope,🔭 telescope,📡 satellite,
💰 money bag,💸 money wings,💳 card,🧾 receipt,✉️ envelope mail,📩 incoming mail,
📦 package box,📬 mailbox,✏️ pencil,🖊️ pen,📝 memo note,📔 notebook,📚 books,📖 open book,
🔖 bookmark,📰 newspaper,🗒️ notepad,📌 pin,📎 paperclip,✂️ scissors,🗑️ bin trash,
🛒 trolley shopping,🎒 backpack,👕 shirt,👗 dress,👠 heels,👟 trainers shoes,🧦 socks,
🧢 cap,👑 crown,💎 gem diamond,🕶️ sunglasses,☂️ umbrella,🪑 chair,🛏️ bed,🚿 shower,
🧹 broom,🧺 basket laundry,🕳️ hole`,
  },
  {
    id: "symbols",
    icon: "✅",
    label: "Symbols",
    raw: `✅ check tick yes,☑️ ballot check,✔️ check mark,❌ cross no wrong,❎ cross mark,
⭕ circle,🚫 prohibited no,⛔ no entry,‼️ double exclamation,❗ exclamation,❓ question,
❔ white question,💯 hundred perfect,🔥 fire,💫 dizzy,💥 boom collision,💤 zzz sleep,
💨 dash wind,🕳️ hole,🎵 note,➕ plus,➖ minus,➗ divide,✖️ multiply,♾️ infinity,
💲 dollar,🔱 trident,⚡ zap lightning,☢️ radioactive,♻️ recycle,⚠️ warning,🔞 eighteen,
📵 no phones,🔇 muted,🔈 speaker,🔉 speaker low,🔊 speaker loud,🔔 bell,🔕 bell off,
📢 loudspeaker,📣 megaphone,💬 speech bubble,🗨️ speech,🗯️ anger bubble,💭 thought bubble,
♠️ spades,♥️ hearts,♦️ diamonds,♣️ clubs,🃏 joker,🀄 mahjong,🎴 flower cards,
🔴 red circle,🟠 orange circle,🟡 yellow circle,🟢 green circle,🔵 blue circle,🟣 purple circle,
⚫ black circle,⚪ white circle,🟥 red square,🟧 orange square,🟨 yellow square,
🟩 green square,🟦 blue square,🟪 purple square,⬛ black square,⬜ white square`,
  },
];

export type EmojiEntry = { char: string; keywords: string };

function parse(raw: string): EmojiEntry[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const space = part.indexOf(" ");
      return space === -1
        ? { char: part, keywords: "" }
        : { char: part.slice(0, space), keywords: part.slice(space + 1) };
    });
}

export type EmojiCategory = {
  id: string;
  icon: string;
  label: string;
  emoji: EmojiEntry[];
};

export const EMOJI_CATEGORIES: EmojiCategory[] = CATEGORIES.map((c) => ({
  id: c.id,
  icon: c.icon,
  label: c.label,
  emoji: parse(c.raw),
}));

const ALL: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emoji);

export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Prefix matches on a keyword first — "he" should find heart before shelf.
  const starts: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];

  for (const entry of ALL) {
    const words = entry.keywords.split(" ");
    if (words.some((w) => w.startsWith(q))) starts.push(entry);
    else if (entry.keywords.includes(q)) contains.push(entry);
  }

  return [...starts, ...contains].slice(0, 60);
}

// --- recently used ---------------------------------------------------------
const RECENT_KEY = "otherme:emoji:recent";
const RECENT_MAX = 24;

export function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRecent(char: string): string[] {
  const next = [char, ...loadRecent().filter((c) => c !== char)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode, quota, whatever — recents are a nicety, not a feature.
  }
  return next;
}
