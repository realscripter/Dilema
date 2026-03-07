# FEATURES.md — Nieuwe Game Modes & Features

## Overzicht van toegevoegde features

Alle 7 gevraagde features zijn geïmplementeerd zonder externe dependencies toe te voegen en zonder de bestaande game modes te breken.

---

### 1. 🤔 Would You Rather Mode

**Beschrijving:** "Zou je liever X of Y?" vragen met percentages in de resultaten.

**Implementatie:**
- **Server (`server.js`):**
  - 20 ingebouwde "Zou Je Liever" vragen in `WOULD_YOU_RATHER_QUESTIONS` array
  - `request-wyr` socket event: geeft een random, nog niet gebruikte vraag terug
  - Tracking van gebruikte vragen per kamer (`usedWyrIndices`) om herhalingen te voorkomen
  - Ondersteunt `would-you-rather` als geldig dilemma type

- **Client (`script.js`):**
  - Nieuwe "ZOU JE LIEVER" knop in creator choice view
  - WYR input view met kaart-display en "Andere Vraag" shuffle knop
  - Auto-fill van tekst inputs zodat standaard submit flow werkt
  - `wyr-question` socket listener die de vraag rendert
  - Speciale WYR resultaat renderer (`renderWyrResults`) met **percentage bars** die animeren

- **UI (`index.html` + `style.css`):**
  - WYR creator card met accent border
  - Stijlvolle vraagweergave met categorie badge
  - Percentage balken (`.wyr-pct-bar` + `.wyr-pct-fill`) in resultaten
  - Grote percentage labels

---

### 2. ⏱️ Timed Mode

**Beschrijving:** Spelers hebben X seconden om te stemmen, anders wordt een random keuze gemaakt.

**Implementatie:**
- **Server (`server.js`):**
  - `timedModeEnabled` en `timedModeSeconds` (5-60 sec) in room settings
  - `startVoteTimer()` / `stopVoteTimer()` functies met interval countdown
  - `handleVoteTimerExpired()`: wijst random stemmen toe aan spelers die niet op tijd stemden
  - `vote-timer-update`, `vote-timer-stopped`, `vote-timer-expired` socket events
  - Timer start automatisch wanneer een dilemma wordt ingediend

- **Client (`script.js`):**
  - Visuele timer bar boven de vote view
  - Timer wordt ook getoond in vote-person view
  - Countdown text in seconden met kleur- en stijl-urgentie

- **UI:**
  - Settings toggle "Vote Timer" met dropdown voor seconden (10/15/20/30/45/60)
  - Geanimeerde voortgangsbalk die van groen naar rood gaat bij <5 seconden
  - `.vote-timer-progress.urgent` class voor pulserende animatie

---

### 3. 🏆 Tournament Mode

**Beschrijving:** Bracket systeem waar dilemma's tegen elkaar strijden.

**Implementatie:**
- **Server (`server.js`):**
  - `initTournament()`: bouwt bracket van 4 of 8 vragen uit categorieën + WYR pool
  - `getCurrentTournamentMatch()` / `advanceTournament()`: bracket navigatie
  - `start-tournament` socket event (alleen host kan starten)
  - `tournament-started` en `tournament-match` emit events
  - Fase-tracking: kwartfinale → halve finale → finale → done

- **Client (`script.js`):**
  - Tournament knop in creator choice view (alleen zichtbaar als enabled)
  - Tournament bracket display view
  - Match voting: twee dilemma's naast elkaar, spelers kiezen welke beter is
  - Fase labels (Kwartfinale, Halve Finale, FINALE)

- **UI:**
  - Tournament bracket items met nummering
  - Tournament choice card met gouden accent
  - Staggered fade-in animaties voor bracket items

---

### 4. 📂 Custom Categories

**Beschrijving:** Spelers kunnen categorieën kiezen voor vragen.

**Implementatie:**
- **Server (`server.js`):**
  - 4 categorieën met elk 5 vragen: `grappig`, `serieus`, `dark`, `random`
  - `CATEGORY_QUESTIONS` object met per-categorie vragenlijsten
  - `selectedCategories` in room settings
  - `request-wyr` respecteert geselecteerde categorieën
  - Per-categorie tracking van gebruikte vragen om herhalingen te voorkomen

- **Client (`script.js`):**
  - Category toggles in settings screen
  - Categorieën worden meegestuurd bij room creation
  - WYR shuffle respecteert geselecteerde categorieën

- **UI:**
  - Emoji-gelabelde categorie toggles (😂 Grappig, 🤔 Serieus, 🌑 Dark, 🎲 Random)
  - Categorie badge in WYR preview
  - Hint text onder de categorie opties

---

### 5. 🏅 Scoreboard

**Beschrijving:** Puntensysteem voor snelste antwoord en unieke keuzes.

**Implementatie:**
- **Server (`server.js`):**
  - `initScoreboard()` / `calculateScoreboardPoints()` / `getScoreboardData()`
  - Punten berekening:
    - **Snelheid:** Snelste stem = 3 punten, tweede = 2, rest = 1
    - **Uniciteit:** Als je de enige bent met die keuze = +2 bonus
  - `voteTime` wordt opgeslagen bij elke stem
  - Scoreboard data wordt meegestuurd met `vote-result`
  - `request-scoreboard` event voor on-demand opvragen

- **Client (`script.js`):**
  - Scoreboard toggle knop (🏆) in game header
  - Inklapbaar scoreboard panel
  - `renderScoreboard()`: medaille ranking, naam, totaal, detail (⚡speed ✨unique)
  - Auto-update na elke ronde

- **UI:**
  - Scoreboard panel met achtergrond
  - Medaille emojis (🥇🥈🥉) voor top 3
  - Gouden accent voor #1 positie
  - Staggered fade-in animatie voor entries
  - Speed en unique score details

---

### 6. 🔊 Sound Effects

**Beschrijving:** Timer ticking, reveal sound, vote sound via Web Audio API.

**Implementatie (geen externe bestanden):**
- **`SFX` module in `script.js`:**
  - `playTick()`: Zacht tick geluid (sine wave 800→600Hz, 80ms)
  - `playTickUrgent()`: Urgent tick (square wave 1000Hz, 100ms) — laatste 5 seconden
  - `playReveal()`: Oplopende toon bij resultaat reveal (400→800→600Hz, 400ms)
  - `playSuccess()`: Drietal oplopende tonen (C-E-G akkoord, 3x120ms)
  - `playBuzzer()`: Buzzer bij timer expiry (sawtooth 150Hz, 300ms)
  - `playVote()`: Korte bevestigingstoon bij stemmen (sine 500→700Hz, 120ms)

- **Waar ze worden afgespeeld:**
  - Vote timer countdown: tick elke 2s, urgent tick laatste 5s
  - Vote timer expired: buzzer
  - Vote submitted: vote sound
  - Results shown: reveal sound
  - WYR winner: success sound
  - Game start: success sound
  - WYR shuffle: vote sound

- **Technisch:**
  - Lazy AudioContext creatie (alleen bij eerste interactie)
  - Auto-resume van suspended context
  - Graceful fallback als Web Audio niet beschikbaar is

---

### 7. ✨ Animations

**Beschrijving:** Soepelere transities tussen rondes, vote reveal animaties.

**Implementatie:**
- **`Anim` helper module in `script.js`:**
  - `fadeIn(el, delay)`: Fade + slide-up met optionele vertraging
  - `staggerIn(container, selector, baseDelay)`: Kinderen stapsgewijs animeren
  - `pulse(el)`: Schaal-pulse effect
  - `pop(el)`: Scale-pop feedback effect
  - `animate(el, class, duration)`: Algemene class-based animatie

- **CSS animaties (`style.css`):**
  - `@keyframes pulse`: Subtiele schaal-pulse
  - `@keyframes pop`: Scale-pop (1→1.15→1)
  - `@keyframes slideInLeft/Right`: Zijwaartse slide-in
  - `@keyframes bounceIn`: Bounce schaal-effect (0.3→1.05→0.95→1)
  - `@keyframes shimmer`: Shimmer achtergrond effect
  - `@keyframes countPulse`: Countdown nummer animatie

- **Waar toegepast:**
  - `.view.active`: Elke view-transitie krijgt fadeSlideUp
  - `.result-card.selected`: bounceIn bij winnaar
  - `.result-card`: Smooth cubic-bezier transition (0.5s)
  - `.voter-chip.voted`: Pop animatie bij stem registratie
  - `.vote-timer-progress.urgent`: Pulserende timer balk
  - Scoreboard items: Staggered fade-in
  - Tournament bracket: Staggered fade-in
  - WYR percentage bars: Animated width transition (1s ease)

---

## Settings Overzicht (Lobby)

| Setting | Type | Default | Range |
|---------|------|---------|-------|
| Zou Je Liever mode | Toggle | Uit | Aan/Uit |
| Categorieën | Multi-toggle | Geen | grappig, serieus, dark, random |
| Vote Timer | Toggle + Select | Uit | 10-60 seconden |
| Tournament Mode | Toggle | Uit | Aan/Uit |
| Scoreboard | Toggle | Uit | Aan/Uit |

## Socket Events (Nieuw)

| Event | Richting | Beschrijving |
|-------|----------|-------------|
| `request-wyr` | Client → Server | Vraag om WYR vraag (optioneel met categorie) |
| `wyr-question` | Server → Client | WYR vraag met opties en categorie |
| `start-tournament` | Client → Server | Start tournament bracket |
| `tournament-started` | Server → Clients | Bracket data + fase |
| `tournament-match` | Server → Clients | Huidige match om op te stemmen |
| `vote-timer-update` | Server → Clients | Timer countdown tick |
| `vote-timer-stopped` | Server → Clients | Timer gestopt |
| `vote-timer-expired` | Server → Clients | Timer verlopen, random stemmen |
| `request-scoreboard` | Client → Server | Scoreboard data opvragen |
| `scoreboard-data` | Server → Client | Scoreboard rankings |

## Niet Veranderd
- ✅ Bestaande dilemma mode werkt nog
- ✅ Open vragen mode werkt nog
- ✅ Foto mode werkt nog
- ✅ Vote de persoon werkt nog
- ✅ Zeldzame rondes werken nog
- ✅ AI filter werkt nog
- ✅ Session recovery werkt nog
- ✅ Geen externe dependencies toegevoegd
- ✅ Basis styling behouden
