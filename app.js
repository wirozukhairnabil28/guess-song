const $=id=>document.getElementById(id);
const clipSeconds=[0.1,1,3,5,10];
const levels=["Easy","Medium","Hard","Impossible","Music God"];
const levelHints=["most popular","popular hits","challenging","hardest hits","rare picks"];
function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch(error){return fallback}}

// Clear old stored streak on reload so the game starts from level Easy, but PRESERVE played song history (anti-repetition for 30+ rounds)
localStorage.removeItem("tebakProgressV2");
localStorage.removeItem("tebakLevelViral");
localStorage.removeItem("tebakSolved");

const savedFilters=readJson("tebakFilters",{});
if(["all","Pop","Rock","Electronic","Hip-Hop/Rap","R&B/Soul","Alternative","Latin"].includes(savedFilters.genre))$("genreSelect").value=savedFilters.genre;
if(["all","2000-2009","2010-2019","2020-now"].includes(savedFilters.year))$("yearSelect").value=savedFilters.year;
if(["all","indo","west"].includes(savedFilters.region))document.querySelectorAll(".segment").forEach(button=>button.classList.toggle("active",button.dataset.region===savedFilters.region));

const state={
  region:document.querySelector(".segment.active")?.dataset.region||"all",
  genre:$("genreSelect").value,
  year:$("yearSelect").value,
  current:null,
  attempt:0,
  solved:0,
  solvedIds:[],
  level:0,
  locked:false,
  selected:null,
  songs:[],
  catalog:[],
  searchCatalog:[],
  audio:new Audio(),
  frameId:null,
  clipTimer:null,
  playingListener:null,
  requestId:0,
  failedIds:new Set(),
  recentIds:readJson("tebakRecentSongs",[]),
  playStats:readJson("tebakPlayStats",{})
};
const RECENT_LIMIT=120,SONG_COOLDOWN=40,ARTIST_COOLDOWN=6,MIN_TIER=12;
function savePlayHistory(){
  localStorage.setItem("tebakRecentSongs",JSON.stringify(state.recentIds));
  localStorage.setItem("tebakPlayStats",JSON.stringify(state.playStats));
}
function playCount(id){return state.playStats[id]?.n||0}
function recordPlay(song){
  state.recentIds=state.recentIds.filter(id=>id!==song.id).concat(song.id).slice(-RECENT_LIMIT);
  state.playStats[song.id]={n:playCount(song.id)+1};
  savePlayHistory();
}

function saveProgress(){/* session-based streak */}
function renderProgress(){
  document.body.dataset.level=String(state.level);
  $("levelBadge").textContent=levels[state.level];
  $("bestScore").textContent=String(state.solved);
  $("roundCounter").innerHTML=levelCounter();
}
function saveFilters(){
  localStorage.setItem("tebakFilters",JSON.stringify({region:state.region,genre:state.genre,year:state.year}));
}

const waveform=$("waveform");
for(let i=0;i<clipSeconds.length;i++){const bar=document.createElement("i");waveform.appendChild(bar)}

state.audio.preload="none";
state.audio.hidden=true;
const savedVolume=Number(localStorage.getItem("tebakVolume"));
const initialVolume=Number.isFinite(savedVolume)&&localStorage.getItem("tebakVolume")!==null?Math.min(100,Math.max(0,savedVolume)):75;
$("volumeSlider").value=String(initialVolume);
state.audio.volume=initialVolume/100;
$("volumeValue").value=`${initialVolume}%`;
document.body.appendChild(state.audio);
state.audio.addEventListener("ended",finishClip);

document.querySelectorAll(".segment").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll(".segment").forEach(item=>item.classList.toggle("active",item===button));
  state.region=button.dataset.region;
  saveFilters();
  updateFilterOptions();
}));
$("genreSelect").addEventListener("change",event=>{state.genre=event.target.value;saveFilters();updateFilterOptions()});
$("yearSelect").addEventListener("change",event=>{state.year=event.target.value;saveFilters();updateFilterOptions()});
$("howBtn").addEventListener("click",()=>$("howDialog").showModal());
$("closeDialog").addEventListener("click",()=>$("howDialog").close());
$("howDialog").addEventListener("click",event=>{if(event.target===$("howDialog"))$("howDialog").close()});

$("resetHistoryBtn").addEventListener("click",()=>{
  state.recentIds=[];state.playStats={};state.failedIds.clear();state.solvedIds=[];
  localStorage.removeItem("tebakPlayStats");
  state.level=0;state.solved=0;
  localStorage.removeItem("tebakRecentSongs");
  localStorage.removeItem("tebakProgressV2");
  localStorage.removeItem("tebakLevelViral");
  localStorage.removeItem("tebakSolved");
  saveProgress();
  renderProgress();
  $("resetHistoryBtn").textContent="↺ Reset complete!";
  setTimeout(()=>{$("resetHistoryBtn").textContent="↺ Reset history"},2000);
  if(state.catalog.length)updateFilterOptions();
});

$("startBtn").addEventListener("click",()=>{state.failedIds.clear();nextSong()});
$("nextBtn").addEventListener("click",()=>{state.failedIds.clear();nextSong()});
$("cancelLoadingBtn").addEventListener("click",()=>{
  state.requestId++;
  stopAudio();
  state.current=null;
  state.locked=false;
  $("cancelLoadingBtn").classList.add("hidden");
  $("anotherBtn")?.classList.add("hidden");
  $("idleState").classList.remove("hidden");
  $("activeState").classList.add("hidden");
  $("resultState").classList.add("hidden");
  $("startWrap").classList.remove("hidden");
  $("gameStatus").textContent="READY TO PLAY";
  $("roundCounter").innerHTML=levelCounter();
  $("idleCopy").textContent="Choose your songs whenever you are ready.";
  setFiltersEnabled(true);
});
$("anotherBtn").addEventListener("click",()=>{if(state.current&&!state.locked)finishSong(false)});
$("playBtn").addEventListener("click",playSnippet);
$("volumeSlider").addEventListener("input",event=>{
  const volume=Number(event.target.value);
  state.audio.volume=volume/100;
  $("volumeValue").value=`${volume}%`;
  localStorage.setItem("tebakVolume",String(volume));
});
$("skipBtn").addEventListener("click",useAttempt);
$("answerInput").addEventListener("input",showSuggestions);
$("answerInput").addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();submitGuess()}
  if(event.key==="Escape")$("suggestions").classList.add("hidden");
});

if(location.protocol==="file:"){
  $("filterAvailability").textContent="Game must be run from local server. Launch MULAI-GAME.cmd then open http://127.0.0.1:8000/";
  $("startBtn").disabled=true;
}else{
  loadCatalogOptions();
}

async function loadCatalogOptions(){
  try{
    const [songsRes, searchRes] = await Promise.allSettled([
      fetch("/api/songs?region=all&genre=all&year=all"),
      fetch("/search_dictionary.json")
    ]);
    if(songsRes.status === "fulfilled" && songsRes.value.ok){
      state.catalog = (await songsRes.value.json()).tracks || [];
      updateFilterOptions();
    }
    if(searchRes.status === "fulfilled" && searchRes.value.ok){
      state.searchCatalog = (await searchRes.value.json()) || [];
    }
  }catch(error){
    $("filterAvailability").textContent="Server is not reachable. Please start MULAI-GAME.cmd.";
    $("startBtn").disabled=true;
    $("nextBtn").disabled=true;
  }
}

function catalogMatches(region,genre,year){
  return state.catalog.filter(song=>(region==="all"||song.region===region)&&(genre==="all"||song.genre===genre)&&yearMatchesFilter(song.year,year));
}

function updateFilterOptions(){
  if(!state.catalog.length||document.querySelector(".filters").classList.contains("is-locked"))return;
  const matches=catalogMatches(state.region,state.genre,state.year);
  for(const button of document.querySelectorAll(".segment"))button.disabled=!catalogMatches(button.dataset.region,state.genre,state.year).length;
  for(const option of $("genreSelect").options)option.disabled=!catalogMatches(state.region,option.value,state.year).length;
  for(const option of $("yearSelect").options)option.disabled=!catalogMatches(state.region,state.genre,option.value).length;
  $("startBtn").disabled=!matches.length;
}

async function nextSong(){
  if(location.protocol==="file:"){
    showEmptyPool("Run via local server at http://127.0.0.1:8000/");
    return;
  }
  state.region=document.querySelector(".segment.active")?.dataset.region||"all";
  state.genre=$("genreSelect").value;
  state.year=$("yearSelect").value;
  
  const previewPool=state.catalog.filter(song=>(state.region==="all"||song.region===state.region)&&(state.genre==="all"||song.genre===state.genre)&&yearMatchesFilter(song.year,state.year));
  setFiltersEnabled(false);
  stopAudio();
  const requestId=++state.requestId;
  state.current=null;
  state.locked=true;
  $("idleState").classList.remove("hidden");
  $("activeState").classList.add("hidden");
  $("resultState").classList.add("hidden");
  $("startWrap").classList.add("hidden");
  $("cancelLoadingBtn").classList.remove("hidden");
  $("anotherBtn")?.classList.add("hidden");
  $("startBtn").disabled=true;
  $("nextBtn").disabled=true;
  $("gameStatus").textContent="SEARCHING RANDOM TRACK";
  $("roundCounter").innerHTML=levelCounter();
  $("idleCopy").textContent="Preparing audio snippet…";

  try{
    const pool=await fetchTrackPool();
    if(requestId!==state.requestId)return;
    const availablePool=pool.filter(song=>!state.failedIds.has(song.id));
    if(!availablePool.length)throw new Error("empty-pool");

    const candidateGroups=rankedCandidateGroups(availablePool,state.level);
    const playable=await findPlayableSong(candidateGroups,requestId);
    if(!playable)throw new Error("preview-unavailable");
    if(requestId!==state.requestId)return;
    state.songs=pool;
    state.current=playable;
    state.attempt=0;
    state.locked=false;
    state.selected=null;
    $("cancelLoadingBtn").classList.add("hidden");
    recordPlay(playable);
    $("startBtn").disabled=false;
    $("nextBtn").disabled=false;
    $("idleState").classList.add("hidden");
    $("resultState").classList.add("hidden");
    $("activeState").classList.remove("hidden");
    $("startWrap").classList.add("hidden");
    $("anotherBtn")?.classList.remove("hidden");
    $("gameStatus").textContent="LISTEN CAREFULLY";
    $("roundCounter").innerHTML=levelCounter();
    $("regionTag").textContent=state.current.region==="indo"?"INDONESIAN":"INTERNATIONAL";
    $("genreTag").textContent=(state.current.genre||"MIX").toUpperCase();
    $("yearTag").textContent=String(state.current.year);
    $("playLabel").textContent="Play clip";
    $("playHint").textContent=state.level<=2?"Press play to hear the chorus (reff) clip, then unlock longer durations.":"Press play to hear the intro clip, then unlock longer durations.";
    $("playHint").classList.remove("done");
    $("playIcon").textContent="▶";
    $("audioCredit").href="https://www.deezer.com";
    $("audioCredit").classList.remove("hidden");
    state.audio.src=state.current.streamUrl;
    state.audio.addEventListener("loadedmetadata",()=>{
      try { state.audio.currentTime = getClipStartTime(); } catch(e) {}
    },{once:true});
    $("clipDuration").textContent=formatClip(clipSeconds[0]);
    $("feedback").textContent="";
    $("answerInput").value="";
    $("answerInput").disabled=false;
    $("skipBtn").disabled=false;
    $("suggestions").classList.add("hidden");
    renderAttempts();
    setClipProgress();
  }catch(error){
    if(requestId!==state.requestId)return;
    $("startBtn").disabled=false;
    $("nextBtn").disabled=false;
    const messages={
      "preview-unavailable":"No playable audio preview found for this category. Please try another selection.",
      "rare-empty":"No rare songs found for this selection.",
      "catalog-unavailable":"Server unreachable. Ensure MULAI-GAME.cmd is running.",
    };
    state.current=null;
    $("cancelLoadingBtn").classList.add("hidden");
    if(!state.catalog.length)loadCatalogOptions();
    showEmptyPool(error.message==="empty-pool"?"No songs match this category. Please try different filters.":(messages[error.message]||"Failed to load track. Please try again."));
  }
}

function shuffleSongs(songs){
  const shuffled=songs.slice();
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
  return shuffled;
}

// Level tier: lagu dengan level tepat dulu; kalau kurang dari MIN_TIER, lebarkan ke level tetangga.
function tierFor(pool,level){
  const last=levels.length-1;
  const isHard=song=>song.level===last||song.deepCut;
  const distance=song=>level===last?(isHard(song)?0:last-song.level):(isHard(song)?99:Math.abs(song.level-level));
  const sorted=pool.map(song=>({song,d:Number.isFinite(song.level)||song.deepCut?distance(song):0})).sort((x,y)=>x.d-y.d);
  const tier=[];
  for(let i=0;i<sorted.length;){
    const d=sorted[i].d;let j=i;
    while(j<sorted.length&&sorted[j].d===d)tier.push(sorted[j++].song);
    if(tier.length>=MIN_TIER)break;
    i=j;
  }
  return tier;
}

// Shuffle-bag: lagu yang paling jarang diputar didahulukan (lintas sesi), lagu/artis yang baru saja
// muncul diturunkan prioritasnya, dan urutan di dalam kelompok yang sama diacak.
function rankedCandidateGroups(pool,level){
  const tier=tierFor(pool,level);
  const artistOf=new Map(state.catalog.map(song=>[song.id,normalize(song.artist)]));
  const recentSongs=new Set(state.recentIds.slice(-SONG_COOLDOWN));
  const recentArtists=new Set(state.recentIds.slice(-ARTIST_COOLDOWN).map(id=>artistOf.get(id)).filter(Boolean));
  const ranked=shuffleSongs(tier).map(song=>({
    song,
    penalty:(recentSongs.has(song.id)?2:0)+(recentArtists.has(normalize(song.artist))?1:0),
    count:playCount(song.id)
  }));
  // Pakai penalty hanya jika masih ada cukup alternatif; stabil sehingga urutan acak tetap terjaga.
  const fresh=ranked.filter(item=>item.penalty===0).length;
  ranked.sort((x,y)=>(fresh>=4?x.penalty-y.penalty:0)||x.count-y.count||x.penalty-y.penalty);
  return [ranked.map(item=>item.song)];
}

async function findPlayableSong(groups,requestId){
  const deadline=Date.now()+22000;
  for(const candidates of groups){
    for(let index=0;index<candidates.length&&Date.now()<deadline;index+=4){
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),Math.min(12000,deadline-Date.now()));
      try{
        const playableSongs=[];
        let firstReady;
        const firstPlayable=new Promise(resolve=>{firstReady=resolve});
        const batch=candidates.slice(index,index+4).map(async song=>{
          const response=await fetch(`/api/preview?id=${encodeURIComponent(song.id)}`,{signal:controller.signal});
          if(!response.ok)throw new Error("preview-unavailable");
          const preview=await response.json();
          if(!preview.streamUrl||!await audioIsReady(preview.streamUrl))throw new Error("audio-unavailable");
          playableSongs.push({...song,...preview});firstReady();
        });
        const allDone=Promise.allSettled(batch);
        await Promise.race([firstPlayable,allDone]);
        if(!playableSongs.length)continue;
        await Promise.race([allDone,new Promise(resolve=>setTimeout(resolve,1200))]);
        const playable=playableSongs[Math.floor(Math.random()*playableSongs.length)];
        if(requestId===state.requestId)return playable;
        return null;
      }catch(error){
        if(requestId!==state.requestId)return null;
      }finally{clearTimeout(timeout);controller.abort()}
    }
  }
  return null;
}

function audioIsReady(url){
  return new Promise(resolve=>{
    const probe=new Audio();let settled=false;
    const finish=ready=>{if(settled)return;settled=true;clearTimeout(timeout);probe.pause();probe.removeAttribute("src");resolve(ready)};
    const timeout=setTimeout(()=>finish(false),4000);
    probe.preload="auto";probe.addEventListener("canplay",()=>finish(true),{once:true});probe.addEventListener("error",()=>finish(false),{once:true});probe.src=url;probe.load();
  });
}

async function fetchTrackPool(){
  const params=new URLSearchParams({region:state.region,genre:state.genre,year:state.year});
  const response=await fetch(`/api/songs?${params}`);
  if(!response.ok){
    const body=await response.json().catch(()=>({}));
    throw new Error(body.error||"catalog-unavailable");
  }
  const body=await response.json();
  return (body.tracks||[]).filter(song=>(state.region==="all"||song.region===state.region)&&(state.genre==="all"||song.genre===state.genre)&&yearMatchesFilter(song.year,state.year));
}

function yearMatchesFilter(year,selection){
  if(!Number.isInteger(year))return false;
  if(selection==="all")return true;
  if(selection==="2020-now")return year>=2020&&year<=new Date().getFullYear();
  if(selection==="before-2000")return year<2000;
  const [start,end]=selection.split("-").map(Number);
  return year>=start&&year<=end;
}

function getClipStartTime(){
  // Easy (0), Medium (1), Hard (2) -> putar dari reff (chorus hook)
  // Impossible (3), Music God (4) -> putar dari intro (0s)
  if(state.level <= 2){
    return Number(state.current?.reff || 10);
  }
  return 0;
}

function playSnippet(){
  if(!state.current||!state.audio.src){$("feedback").style.color="#ba5846";$("feedback").textContent="Please wait, loading audio snippet.";return}
  if(!state.audio.paused||state.playingListener){stopAudio();$("playLabel").textContent="Replay clip";return}

  const startTime = getClipStartTime();
  stopAudio();
  try { state.audio.currentTime = startTime; } catch(e) {}
  $("playIcon").textContent="Ⅱ";
  $("playLabel").textContent="Playing";
  const duration=clipSeconds[Math.min(state.attempt,clipSeconds.length-1)];

  const onPlaying=()=>{
    state.playingListener=null;
    state.audio.removeEventListener("playing",onPlaying);
    if(Math.abs(state.audio.currentTime - startTime) > 1.5 && state.audio.seekable.length > 0){
      try { state.audio.currentTime = startTime; } catch(e) {}
    }
    const actualStart = state.audio.currentTime;
    waveform.classList.add("playing");
    $("gameStatus").textContent="PLAYING SNIPPET";
    $("playHint").classList.remove("done");
    $("playHint").textContent=`Playing ${formatClip(duration)}…`;
    state.clipTimer=setTimeout(finishClip,duration*1000+200);
    const update=()=>{
      if(state.audio.paused)return;
      const elapsed = Math.max(0, state.audio.currentTime - actualStart);
      const progress=Math.min(1, elapsed / duration);
      setPlaybackProgress(progress);
      if(elapsed>=duration){finishClip();return}
      state.frameId=requestAnimationFrame(update);
    };
    update();
  };
  state.playingListener=onPlaying;
  state.audio.addEventListener("playing",onPlaying);
  state.audio.play().catch(error=>{
    if(state.playingListener!==onPlaying)return;
    state.audio.removeEventListener("playing",onPlaying);
    state.playingListener=null;
    console.warn("Preview playback failed",error.name,state.audio.error?.code);
    stopAudio();
    if(error.name==="NotAllowedError"){
      $("playHint").textContent="Browser blocked audio autoplay. Click play again.";
      $("feedback").style.color="#ba5846";
      $("feedback").textContent="Press the play button once more.";
      return;
    }
    state.failedIds.add(state.current.id);
    nextSong();
  });
}

function setPlaybackProgress(value){$("playProgress").style.transform=`scaleX(${value})`;$("playProgressTrack").setAttribute("aria-valuenow",String(Math.round(value*100)))}
function finishClip(){
  if(!state.current||state.locked)return;
  stopAudio(false);
  setPlaybackProgress(1);
  const startTime = getClipStartTime();
  try { state.audio.currentTime = startTime; } catch(e) {}
  $("playLabel").textContent="Replay clip";
  $("gameStatus").textContent="CLIP FINISHED";
  $("playHint").classList.add("done");
  $("playHint").textContent=state.attempt<clipSeconds.length-1?`${formatClip(clipSeconds[state.attempt])} finished. Replay or unlock ${formatClip(clipSeconds[state.attempt+1])}.`:`${formatClip(clipSeconds[state.attempt])} finished. Replay or reveal answer.`;
}

function getSearchPool(){
  const poolMap = new Map();
  const addSong = (song) => {
    if(!song || !song.title || !song.artist) return;
    const key = `${normalize(song.title)}:::${normalize(song.artist)}`;
    if(!poolMap.has(key)){
      poolMap.set(key, { title: song.title, artist: song.artist, id: song.id });
    }
  };

  // Prioritas urutan data
  if(state.current) addSong(state.current);
  if(Array.isArray(state.songs)) state.songs.forEach(addSong);
  if(Array.isArray(state.searchCatalog)) state.searchCatalog.forEach(addSong);
  if(Array.isArray(state.catalog)) state.catalog.forEach(addSong);

  return Array.from(poolMap.values());
}

function makeSuggestionOption(song, highlightArtist){
  const option = document.createElement("button");
  option.type = "button";
  option.className = "suggestion-option";
  const titleEl = document.createElement("span");
  titleEl.className = "sug-title";
  titleEl.textContent = song.title;
  const artistEl = document.createElement("span");
  artistEl.className = "sug-artist";
  if(highlightArtist){
    const em = document.createElement("span");
    em.className = "sug-artist-match";
    em.textContent = song.artist;
    artistEl.appendChild(em);
  } else {
    artistEl.textContent = song.artist;
  }
  option.appendChild(titleEl);
  option.appendChild(artistEl);
  option.addEventListener("click", () => {
    state.selected = song;
    $("answerInput").value = `${song.title} — ${song.artist}`;
    $("suggestions").classList.add("hidden");
    submitGuess();
  });
  return option;
}

function addSectionLabel(box, text){
  const label = document.createElement("span");
  label.className = "suggestions-section-label";
  label.textContent = text;
  box.appendChild(label);
}

function showSuggestions(){
  state.selected = null;
  const query = normalize($("answerInput").value);
  const box = $("suggestions");
  box.replaceChildren();

  if(query.length < 2){ box.classList.add("hidden"); return; }

  const pool = getSearchPool();
  const seen = new Set();
  let totalShown = 0;

  // --- Seksi 1: Ketik nama artis → tampilkan 5 judul lagu dari artis itu sebagai pengecoh ---
  const artistSeen = new Set();
  const matchedArtists = [];
  for(const item of pool){
    const normArtist = normalize(item.artist);
    const normTitle = normalize(item.title);
    // Artis cocok, tapi bukan karena judulnya
    if(normArtist.includes(query) && !normTitle.includes(query) && !artistSeen.has(normArtist)){
      artistSeen.add(normArtist);
      matchedArtists.push(item.artist);
    }
  }

  for(const artist of matchedArtists.slice(0, 2)){
    const normArtist = normalize(artist);
    const artistSongs = shuffleSongs(pool.filter(s => normalize(s.artist) === normArtist))
      .slice(0, 5);
    if(!artistSongs.length) continue;
    addSectionLabel(box, `Songs by ${artist}`);
    for(const song of artistSongs){
      const key = `${normalize(song.title)}:::${normArtist}`;
      if(seen.has(key)) continue;
      seen.add(key);
      box.appendChild(makeSuggestionOption(song, true));
      totalShown++;
    }
  }

  // --- Seksi 2: Hasil umum berdasarkan judul ---
  const titleMatches = [];
  for(const item of pool){
    const normTitle = normalize(item.title);
    const normArtist = normalize(item.artist);
    const key = `${normTitle}:::${normArtist}`;
    if(seen.has(key)) continue;
    if(normTitle.includes(query) || (normTitle + normArtist).includes(query)){
      titleMatches.push(item);
    }
  }

  if(titleMatches.length > 0){
    const limit = Math.max(3, 8 - totalShown);
    const toShow = titleMatches.slice(0, limit);
    if(totalShown > 0) addSectionLabel(box, "Other matches");
    for(const song of toShow){
      const key = `${normalize(song.title)}:::${normalize(song.artist)}`;
      if(seen.has(key)) continue;
      seen.add(key);
      box.appendChild(makeSuggestionOption(song, false));
      totalShown++;
    }
  }

  box.classList.toggle("hidden", totalShown === 0);
}


function submitGuess(){
  if(!state.current||state.locked)return;
  const text=normalize($("answerInput").value);
  if(!text){
    setFeedback("Please type a song title or artist first.","error");
    return;
  }

  const targetTitleNorm = normalize(state.current.title);
  const targetArtistNorm = normalize(state.current.artist);
  const combo1 = targetTitleNorm + targetArtistNorm;
  const combo2 = targetArtistNorm + targetTitleNorm;

  let correct = false;
  if(state.selected){
    if(state.selected.id && state.current.id && state.selected.id === state.current.id){
      correct = true;
    } else if(normalize(state.selected.title) === targetTitleNorm && normalize(state.selected.artist) === targetArtistNorm){
      correct = true;
    }
  } else {
    if(text === targetTitleNorm || text === combo1 || text === combo2){
      correct = true;
    }
  }

  $("suggestions").classList.add("hidden");
  if(correct){
    const playedLevel=state.level;
    state.solved++;
    if(!state.solvedIds.includes(state.current.id))state.solvedIds.push(state.current.id);
    if(state.level<levels.length-1){
      state.level++;
    }
    saveProgress();
    renderProgress();
    finishSong(true,playedLevel);
    return;
  }
  state.selected=null;setFeedback("Not quite right — clip unlocked longer!","error");$("answerInput").value="";useAttempt();
}

function useAttempt(){
  if(!state.current||state.locked)return;
  stopAudio();state.attempt++;renderAttempts();
  if(state.attempt>=clipSeconds.length){finishSong(false);return}
  $("clipDuration").textContent=formatClip(clipSeconds[state.attempt]);
  $("gameStatus").textContent="LONGER CLIP";
  $("playHint").classList.remove("done");$("playHint").textContent=`Now listening to ${formatClip(clipSeconds[state.attempt])}. Press play again.`;
  setClipProgress();
}

function renderAttempts(){$("attemptCaption").textContent=`ATTEMPT ${Math.min(state.attempt+1,clipSeconds.length)} OF ${clipSeconds.length}`;$("skipBtn").textContent=state.attempt<clipSeconds.length-1?`Unlock ${formatClip(clipSeconds[state.attempt+1])} clip`:"Reveal answer"}
function setClipProgress(){[...waveform.children].forEach((segment,index)=>segment.classList.toggle("unlocked",index<=state.attempt))}
function formatClip(seconds){return `${seconds}s`}

function finishSong(won,playedLevel=state.level){
  stopAudio();state.locked=true;setFiltersEnabled(true);renderAttempts();$("activeState").classList.add("hidden");$("resultState").classList.remove("hidden");$("anotherBtn")?.classList.add("hidden");
  
  const badge = $("resultBadge");
  const badgeIcon = $("resultBadgeIcon");
  const badgeText = $("resultBadgeText");
  const headline = $("resultHeadline");
  const message = $("resultMessage");
  const nextBtn = $("nextBtn");

  if(!won){
    state.level = 0;
    state.solved = 0;
    state.solvedIds = [];
    saveProgress();
    renderProgress();
    
    $("gameStatus").textContent = "SESSION OVER";
    $("roundCounter").innerHTML = levelCounter();

    badge.className = "result-badge is-loss";
    badgeIcon.textContent = "✕";
    badgeText.textContent = "Session Over";
    headline.textContent = "Better luck next time!";
    message.textContent = "You ran out of attempts! Streak reset back to " + levels[0] + ".";
    nextBtn.innerHTML = 'Try Again from ' + levels[0] + ' <span aria-hidden="true">&rarr;</span>';
  } else {
    $("gameStatus").textContent = "CORRECT GUESS";
    $("roundCounter").innerHTML = levelCounter();

    badge.className = "result-badge is-win";
    if(playedLevel === levels.length - 1){
      badgeIcon.textContent = "🏆";
      badgeText.textContent = "Victory!";
      headline.textContent = "Music God Defeated!";
      message.textContent = "Incredible! You conquered all viral and hardcore tracks!";
      nextBtn.innerHTML = 'Play Again from Start <span aria-hidden="true">&rarr;</span>';
      state.level = 0;
      saveProgress();
    } else {
      badgeIcon.textContent = "✓";
      badgeText.textContent = "Level Up!";
      headline.textContent = "Awesome Guess!";
      message.textContent = "You nailed it! Advancing to " + levels[state.level] + ".";
      nextBtn.innerHTML = 'Continue to ' + levels[state.level] + ' <span aria-hidden="true">&rarr;</span>';
    }
  }
  
  $("finalTitle").textContent = state.current.title;
  $("finalArtist").textContent = state.current.artist;
  $("nextChoiceHint").textContent = "Ready for the next round? You can change catalog, genre, or release year anytime above.";
  $("trackSource").href = state.current.trackUrl || `https://www.deezer.com/track/${state.current.id}`;
  nextBtn.disabled = false;
}

function levelCounter(){return "LEVEL <b>"+levels[state.level]+"</b>"}

function setFiltersEnabled(enabled){
  document.querySelectorAll(".segment").forEach(button=>{button.disabled=!enabled});
  $("genreSelect").disabled=!enabled;
  $("yearSelect").disabled=!enabled;
  document.querySelector(".filters").classList.toggle("is-locked",!enabled);
  if(enabled){
    if(state.catalog.length)updateFilterOptions();
  }else{
    $("filterAvailability").textContent="Picks are locked during the round. Play clip or unlock longer durations below.";
  }
}

function showEmptyPool(message="No tracks available."){
  setFiltersEnabled(true);
  $("startBtn").disabled=false;
  $("nextBtn").disabled=false;
  $("anotherBtn")?.classList.add("hidden");
  $("idleState").classList.remove("hidden");$("activeState").classList.add("hidden");$("resultState").classList.add("hidden");$("startWrap").classList.remove("hidden");
  $("gameStatus").textContent="TRACK UNAVAILABLE";$("roundCounter").innerHTML=levelCounter();$("idleCopy").textContent=message;$("startBtn").querySelector("span").textContent="↻";$("startWrap").querySelector("p").textContent="Try again";
}
function setFeedback(message,type){$("feedback").textContent=message;$("feedback").style.color=type==="error"?"#ba5846":"#4d7a3e"}
function stopAudio(resetProgress=true){if(state.frameId!==null){cancelAnimationFrame(state.frameId);state.frameId=null}if(state.clipTimer!==null){clearTimeout(state.clipTimer);state.clipTimer=null}if(state.playingListener){state.audio.removeEventListener("playing",state.playingListener);state.playingListener=null}state.audio.pause();waveform.classList.remove("playing");if(resetProgress)setPlaybackProgress(0);$("playIcon").textContent="▶"}
function normalize(value){return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"").trim()}
renderProgress();
