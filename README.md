# GUESS SONG 🎵

An interactive web-based music guessing game where players identify viral hits and legendary deep cuts from short audio clips (0.1s to 10s).

---

## 🚀 Features

- **Progressive Difficulty System**:
  - **Easy**: Mega-viral TikTok & Reels tracks (identifiable within 1-2 notes).
  - **Medium**: Popular social media and chart-topping hits.
  - **Hard**: Trending tracks with subtle or tricky intro hooks.
  - **Impossible**: Nostalgic and deceptive intros.
  - **Music God**: The hardest challenge — classic rock, prog-rock, indie gems, and non-mainstream deep cuts.
- **Short Audio Preview Mechanics**:
  - Guess correctly to level up.
  - Miss or skip to unlock progressively longer clips: `0.1s → 1s → 3s → 5s → 10s`.
  - Running out of attempts forfeits the session and resets your streak back to Easy.
- **Filters & Catalog**:
  - Filter by region (**All**, **Indonesian**, or **International**).
  - Filter by **Genre** and **Release Year**.
- **Smart Song Rotation (anti-repeat)**:
  - Shuffle-bag: every song in the current filter/level is played once before any song repeats (history is saved in the browser across sessions).
  - Cooldown: the same song is not repeated within 40 rounds, and the same artist not within 6 rounds (when enough alternatives exist).
  - Levels use real per-song difficulty; if a level has fewer than 12 songs, neighbouring levels are mixed in.
  - `↺ Reset history` clears the rotation history.
- **Clean & Fast**:
  - Vanilla HTML5, CSS3, and JavaScript — zero heavy frontend frameworks.
  - Responsive dark-mode interface with ambient background lighting.
  - Embedded local Python audio streaming server.

---

## 🛠️ How to Play Locally

### Quick Start (Windows)
Double-click `MULAI-GAME.cmd` in the folder. It will start the local server and automatically open your default browser to `http://127.0.0.1:8000/`.

### Manual Start
1. Ensure Python 3.9+ is installed.
2. In the project directory, run:
   ```bash
   python server.py
   ```
3. Open your browser and navigate to:
   ```
   http://127.0.0.1:8000/
   ```

---

## 📄 License & Credits

- Music audio previews streamed via Deezer API.
- Created by **Wiro Zukhair Nabil**.
