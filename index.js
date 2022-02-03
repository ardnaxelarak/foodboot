require('dotenv').config();

const Articles = require('articles');
const WordNet = require('node-wordnet');
const { TwitterApi } = require('twitter-api-v2');
const CronJob = require('cron').CronJob;

const wordnet = new WordNet();

const entries = [];
const entriesByLevel = Array(10).fill([]);

const subLevels = [1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5];
const superLevels = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 5];

const client = new TwitterApi({
  appKey: process.env.TWITTER_CONSUMER_KEY,
  appSecret: process.env.TWITTER_CONSUMER_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN_KEY,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
}).v2;

function prettify(lemma) {
  return lemma.replace(/_/g, " ");
}

async function printHyponyms(prefix, entry) {
  for (const ptr of entry.ptrs) {
    if (ptr.pointerSymbol == "~") {
      const sub = await wordnet.getAsync(ptr.synsetOffset, ptr.pos);
      console.log(`${prefix}${sub.lemma}#${sub.pos}#${sub.lexId}`);
      await printHyponyms(prefix + "  ", sub);
    }
  }
}

async function createEntry(parent, entry) {
  const data = {
    level: parent.level + 1,
    lemma: entry.lemma,
    pretty: prettify(entry.lemma),
    parent: parent,
    children: [],
  };

  parent.children.push(data);
  entries.push(data);
  entriesByLevel[data.level].push(data);

  for (const ptr of entry.ptrs) {
    if (ptr.pointerSymbol == "~") {
      const subentry = await wordnet.getAsync(ptr.synsetOffset, ptr.pos);
      await createEntry(data, subentry);
    }
  }
}

async function createEntries(...roots) {
  for (const root of roots) {
    const data = {
      level: 0,
      lemma: root.lemma,
      pretty: prettify(root.lemma),
      parent: null,
      children: [],
    };

    entries.push(data);
    entriesByLevel[data.level].push(data);

    for (const ptr of root.ptrs) {
      if (ptr.pointerSymbol == "~") {
        const subentry = await wordnet.getAsync(ptr.synsetOffset, ptr.pos);
        await createEntry(data, subentry);
      }
    }
  }
}

function randomEntry() {
  return entries[Math.floor(Math.random() * entries.length)];
}

function randomEntryByLevel(level) {
  return entriesByLevel[level][Math.floor(Math.random() * entriesByLevel[level].length)];
}

function randomRelation() {
  const word1 = randomEntryByLevel(subLevels[Math.floor(Math.random() * subLevels.length)]);
  const word2 = randomEntryByLevel(superLevels[Math.floor(Math.random() * superLevels.length)]);

  return `${Articles.articlize(word1.pretty)} is ${Articles.articlize(word2.pretty)}`;
}

async function postTweet(status) {
  const { data } = await client.tweet(status);
  return data.id;
}

async function main() {
  const foodstuff = await wordnet.findSenseAsync("foodstuff#n#1");
  const beverage = await wordnet.findSenseAsync("beverage#n#1");

  await createEntries(foodstuff, beverage);

  console.log("Loaded successfully.");
  console.log(randomRelation());

  const job = new CronJob('0 0 * * * *', async function() {
    try {
      postTweet(randomRelation());
    } catch (err) {
      console.log(err);
    }
  }, null, true, 'America/Los_Angeles');
}

main();
