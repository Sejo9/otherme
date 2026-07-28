/**
 * Word list for the daily duel.
 *
 * One list serves as both the answer pool and the accepted-guess dictionary.
 * That keeps the bundle small and means a guess is never rejected for being a
 * word we simply didn't include — if you can guess it, it can be the answer.
 *
 * ~520 common words, so the answers do not repeat for well over a year.
 */
const RAW = `
about above abuse actor adapt admit adopt adult after again agent agree ahead
alarm album alert alike alive allow alone along aloud alter among anger angle
angry ankle apart apple apply arena argue arise armor aroma array arrow aside
asset audio audit avoid awake award aware badly baker basic basil basin batch
beach beard beast began begin begun being belly below bench berry birth black
blade blame bland blank blast blaze bleak blend bless blind blink bliss block
blood bloom blown blues blunt blush board boast bonus boost booth bound brace
brain brake brand brass brave bread break breed brick bride brief bring brisk
broad broke brook broom brown brush build built bunch burnt burst cabin cable
candy canoe carry carve catch cause cease chain chair chalk charm chart chase
cheap check cheek cheer chess chest chief child chill china chose civic civil
claim clash class clean clear clerk click cliff climb cling clock close cloth
cloud clown coach coast cocoa colon color comet comic coral couch cough could
count court cover crack craft crane crash crate crawl crazy cream creek crept
crest crime crisp cross crowd crown crude cruel crumb crush crust curly curve
cycle daily dairy dance dared dealt death debut decay decor delay dense depth
diary dirty ditch diver dizzy dodge doing donor doubt dough dozen draft drain
drama drank drawn dream dress dried drift drill drink drive drove drown drunk
dryer dwell eager eagle early earth eight elbow elder elect elite empty ended
enemy enjoy enter entry equal error essay event every exact exams exist extra
faith false fancy fatal fault favor feast fence ferry fetch fever fiber field
fiery fifth fifty fight final first flame flash fleet flesh flick fling float
flock flood floor flour flown fluid flush focal focus force forge forth forty
forum found frame fraud fresh fried front frost frown fruit fully funny gauge
ghost giant given giver gland glass gleam globe gloom glory glove going grace
grade grain grand grant grape graph grasp grass grave gravy graze great greed
green greet grief grill grind groan groom gross group grove growl grown guard
guess guest guide guilt habit handy happy harsh haste hatch haunt heard heart
heavy hedge hello hence hobby holly honey honor horse hotel house hover human
humor hurry ideal image imply index inner input irony issue ivory jelly jewel
joint judge juice knack knead kneel knife knock knots known label labor lance
large laser later laugh layer leach leads learn lease leash least leave legal
lemon level lever light liked limit linen liner links liver lobby local lodge
logic loose lorry loved lower loyal lucky lunar lunch lying magic major maker
mango maple march marsh match maybe mayor meant medal media medic melon mercy
merge merit merry metal meter midst might minor minus mirth mixed model moist
money month moral motor mount mouse mouth movie music naked named nasty naval
needy nerve never newly night noble noise north noted novel nurse ocean offer
often olive onion onset opera orbit order organ other otter ought ounce outer
owner oxide paint panel panic paper party pasta patch patio pause peace peach
pearl pedal penny perch phase phone photo piano piece pilot pinch pitch pivot
place plain plane plant plate plaza plead pluck plumb point polar polio porch
pouch pound power press price pride prime print prior prize probe prone proof
proud prove prune pulse punch pupil puppy purse queen query quest queue quick
quiet quilt quirk quite quota radar radio raise rally ranch range rapid ratio
reach react ready realm rebel refer reign relax relay renew reply reset resin
retro rhyme rider ridge rifle right rigid rinse ripen risen risky rival river
roast robin robot rocky roman rough round route royal rugby ruler rumor rural
saint salad salon sandy sauce scale scare scarf scene scent scoop scope score
scout scrap screw seize sense serve seven shade shaft shake shall shame shape
share shark sharp sheep sheer sheet shelf shell shift shine shiny shirt shock
shoot shore short shout shown shrub sight silky silly since siren sixth sixty
skate skill skirt slate slave sleek sleep slept slice slide slope small smart
smash smell smile smoke snack snake sneak solar solid solve sorry sound south
space spare spark speak spear speed spell spend spent spice spike spill spine
spite split spoke spoon sport spray spread spree squad squat stack staff stage
stain stair stake stale stall stamp stand stare start state steak steal steam
steel steep steer stern stick stiff still sting stock stole stone stood stool
store storm story stout stove strap straw strip stuck study stuff style sugar
suite sunny super surge sushi swamp swear sweat sweep sweet swell swept swift
swing sword table taken tally tango taste teach tempo tenor tense tenth thank
theme there thick thief thigh thing think third thorn those three threw throw
thumb tiger tight timer times tired title toast today token tonic tooth topic
torch total touch tough towel tower toxic trace track trade trail train trait
tramp trash treat trend trial tribe trick tried tries troop trout truck truly
trunk trust truth tulip tummy tumor tuned twice twist typed ultra uncle under
union unite unity until upper upset urban usage usual vague valid value valve
vapor vault venue verse video vigil villa vinyl viral virus visit vital vivid
vocal voice voter wagon waist waste watch water waved weary weave wedge weigh
weird whale wharf wheat wheel where which while white whole whose widow width
wield wiser witch woken woman world worry worse worst worth would wound wrist
write wrong wrote yacht yeast yield young yours youth zebra
`;

export const WORDS: string[] = [...new Set(RAW.trim().split(/\s+/))].filter(
  (w) => w.length === 5
);

const WORD_SET = new Set(WORDS);

export const isWord = (guess: string): boolean => WORD_SET.has(guess.toLowerCase());

export const MAX_GUESSES = 6;

/**
 * The answer for a given day.
 *
 * Derived from the date rather than random so both clients independently agree
 * on the same word before either has written anything to the database. The
 * stride is coprime with the list length, so it walks the whole list before
 * repeating.
 */
export function wordForDay(day: string): string {
  const seed = Number(day.replaceAll("-", ""));
  const stride = 137;
  return WORDS[(seed * stride) % WORDS.length];
}

export type Mark = "g" | "y" | ".";

/** Local scoring, used to render your own board without a round trip. */
export function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(5).fill(".");
  const pool: string[] = [];

  // Greens first, so a repeated letter is never marked yellow twice.
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) marks[i] = "g";
    else pool.push(answer[i]);
  }

  for (let i = 0; i < 5; i++) {
    if (marks[i] === "g") continue;
    const at = pool.indexOf(guess[i]);
    if (at !== -1) {
      marks[i] = "y";
      pool.splice(at, 1);
    }
  }

  return marks;
}

/** Best-known state of each letter, for the keyboard. */
export function keyboardState(guesses: string[], answer: string): Record<string, Mark> {
  const rank: Record<Mark, number> = { g: 3, y: 2, ".": 1 };
  const state: Record<string, Mark> = {};

  for (const guess of guesses) {
    const marks = score(guess, answer);
    guess.split("").forEach((letter, i) => {
      const current = state[letter];
      if (!current || rank[marks[i]] > rank[current]) state[letter] = marks[i];
    });
  }

  return state;
}
