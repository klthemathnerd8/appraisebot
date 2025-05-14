import { verifyKey } from "discord-interactions";

const CHARACTERS = new Set([
  "magekid","bazooka","zetoman","sniper","dai",
  "samurai","samrival","pboi","nero","jonjon",
  "janko","evilolif","revis","emy","bigb","hunt"
]);
const SUFFIX_PRIORITY = [
  "promo","magr1","chr3","chr2","chr","spr1",
  "mari1","mag1","se2","se1","r1","s2","s1"
];
const SUFFIX_VALUES = {
  promo:300000, magr1:6500, chr3:500, chr2:3500,
  chr:120000, spr1:500, mari1:300, mag1:500,
  se1:5500, se2:5500, r1:1500, s2:100, s1:100
};
const SPECIAL_VALUES = {
  daichr3:50000, bigbchr2:150000, revisspr1se:50000,
  daiser1:45000, magekidser1:45000, emyse:6500,
  samuraimari1:4000, revismari2:4000, pboimari2:4000,
  zetomanmari2:4000, neromari1:4000, magekidmari1:40000,
  daimari2:40000, bigbmari2:40000, bigbmari2r2r:55000,
  daiu1:800, daiu2:1200, emyu1:800, jankou1:800,
  nerou1:800, nerou2:1200, emymari2:40000
};

function getSkinValue(name) {
  if (SPECIAL_VALUES[name] !== undefined) {
    return SPECIAL_VALUES[name];
  }
  for (const suf of SUFFIX_PRIORITY) {
    if (name.endsWith(suf) && CHARACTERS.has(name.slice(0, -suf.length))) {
      return SUFFIX_VALUES[suf];
    }
  }
  return 10;
}

async function fetchHTML(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return await res.text();
}

async function fetchRawSkins(username) {
  const html = await fetchHTML(`https://bandit.rip/player/@${username}`);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = [];
  doc.querySelectorAll(".playerpage-costume-c").forEach(block => {
    const sprite = block.querySelector(
      ".playerpage-costume[style], .playerpage-costume-b[style], .playerpage-costume-b2[style]"
    );
    if (!sprite) return;
    const m = sprite.getAttribute("style").match(/\/([^/]+)\.png\)/);
    if (!m) return;
    let name = m[1].replace(/^base/, "");
    const countText = block.querySelector(".playerpage-costume-n")?.textContent.trim();
    if (!countText || isNaN(countText)) return;
    raw.push({ name, count: Number(countText) });
  });
  return raw;
}

async function fetchCoins(username) {
  const html = await fetchHTML(`https://bandit.rip/player/@${username}`);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const stat = doc.querySelector(".playerpage-profile-stats.brcoin2");
  const m = stat?.textContent.match(/COINS:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

export default {
  async fetch(request, env) {
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const bodyText = await request.text();

    // 1) Verify Discord signature
    if (!verifyKey(bodyText, signature, timestamp, env.DISCORD_PUBLIC_KEY)) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const payload = JSON.parse(bodyText);

    // 2) Respond to Discord PING
    if (payload.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3) Handle slash commands
    if (payload.type === 2) {
      const cmd = payload.data.name;
      const opts = payload.data.options || [];
      let reply = "";

      try {
        if (cmd === "appraise") {
          const username = opts.find(o => o.name === "username").value;
          const raw = await fetchRawSkins(username);
          const coins = await fetchCoins(username);

          // dedupe “r” suffix skins
          const keep = new Set(raw.map(r => r.name));
          raw.forEach(r => {
            if (r.name.endsWith("r") && keep.has(r.name.slice(0, -1))) {
              keep.delete(r.name.slice(0, -1));
            }
          });

          let skinTotal = 0;
          raw.forEach(r => {
            if (keep.has(r.name)) {
              skinTotal += getSkinValue(r.name) * r.count;
            }
          });

          reply = `💰 **${username}** has ${coins.toLocaleString()} coins + ${skinTotal.toLocaleString()} skins = **${(coins + skinTotal).toLocaleString()}**`;
        }
        else if (cmd === "open") {
          reply = "🔨 The `/open` command isn’t implemented yet.";
        }
        else {
          reply = `⚠️ Unknown command \`${cmd}\`.`;
        }
      } catch (e) {
        reply = `⚠️ Error: ${e.message}`;
      }

      return new Response(
        JSON.stringify({
          type: 4,
          data: { content: reply }
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(null, { status: 404 });
  }
};
